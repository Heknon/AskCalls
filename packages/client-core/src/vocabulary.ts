import { type ApiClient, ApiError } from '@askcalls/api-contract';
import { listVocab, writeVocab } from '@askcalls/api-contract/routes/vocab';
import { AadFields, aad, decrypt, encrypt } from '@askcalls/crypto';
import {
  compactDeltas,
  createVocabulary,
  deserializeVocabulary,
  mergeVocabulary,
  type ReadonlyVocabulary,
  serializeVocabulary,
  type Vocabulary,
} from '@askcalls/indexing';
import type { KeySession } from './session';

/**
 * AAD sequence numbers. The server assigns `seq` on append, after the device has encrypted, so
 * appended deltas are bound to `vocab:0`. A compacted delta takes the `seq` the device names
 * (`upToSeq`), so it is bound to `vocab:<upToSeq>`.
 */
const APPEND_SEQ = 0;

/**
 * The local copy of the encrypted vocabulary (spec 7.12): fetches deltas since the last seen
 * seq, decrypts and merges them; appends a delta after each ingest; compacts the log when it
 * holds more deltas than the server's threshold. Held in memory only and cleared on lock.
 */
export class VocabularySync {
  #vocabulary: Vocabulary = createVocabulary();
  #lastSeq = 0;
  #count = 0;
  #compactAfter = 50;
  #running: Promise<void> | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly session: KeySession,
  ) {
    session.onWipe(() => this.#reset());
  }

  get vocabulary(): ReadonlyVocabulary {
    return this.#vocabulary;
  }

  get lastSeq(): number {
    return this.#lastSeq;
  }

  /** Deltas on the server at the last sync. */
  get deltaCount(): number {
    return this.#count;
  }

  #reset(): void {
    this.#vocabulary = createVocabulary();
    this.#lastSeq = 0;
    this.#count = 0;
  }

  #aad(seq: number) {
    return aad({ userId: this.session.userId, field: AadFields.vocabDelta(seq) });
  }

  async #decrypt(d: { seq: number; ct: Uint8Array; compacted: boolean }) {
    const plain = await decrypt(
      this.session.keys.kek,
      d.ct,
      this.#aad(d.compacted ? d.seq : APPEND_SEQ),
    );
    return deserializeVocabulary(plain);
  }

  /** Fetches and merges new deltas. Concurrent callers share one request. */
  sync(): Promise<void> {
    this.#running ??= this.#sync().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #sync(): Promise<void> {
    const res = await this.api.request(listVocab, { query: { since: this.#lastSeq } });
    this.#count = res.count;
    this.#compactAfter = res.compactAfter;
    if (res.deltas.length === 0) return;
    // A compaction folded deltas we already merged into a new one: rebuild from scratch.
    if (this.#lastSeq > 0 && res.deltas.some((d) => d.compacted)) {
      this.#reset();
      return this.#sync();
    }
    for (const d of res.deltas) {
      mergeVocabulary(this.#vocabulary, await this.#decrypt(d));
      this.#lastSeq = Math.max(this.#lastSeq, d.seq);
    }
  }

  /** Appends one ingest's (or, negated, one deletion's) forms, then syncs. */
  async append(delta: ReadonlyVocabulary): Promise<void> {
    if (delta.size === 0) return;
    const ct = await encrypt(
      this.session.keys.kek,
      serializeVocabulary(delta),
      this.#aad(APPEND_SEQ),
    );
    await this.api.request(writeVocab, { body: { op: 'append', ct } });
    await this.sync();
    await this.compactIfNeeded();
  }

  /** Folds every delta into one when the log is longer than the threshold. */
  async compactIfNeeded(): Promise<boolean> {
    if (this.#count <= this.#compactAfter) return false;
    const res = await this.api.request(listVocab, { query: { since: 0 } });
    const last = res.deltas.at(-1);
    if (!last || res.deltas.length <= res.compactAfter) return false;
    const all = await Promise.all(res.deltas.map((d) => this.#decrypt(d)));
    const folded = compactDeltas(all);
    const ct = await encrypt(
      this.session.keys.kek,
      serializeVocabulary(folded),
      this.#aad(last.seq),
    );
    try {
      await this.api.request(writeVocab, { body: { op: 'compact', upToSeq: last.seq, ct } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') return false;
      throw e;
    }
    this.#reset();
    await this.sync();
    return true;
  }
}
