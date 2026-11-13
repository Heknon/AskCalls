import type {
  BlobStore,
  Clock,
  ErrorReport,
  HealthResult,
  IdGenerator,
  LlmProvider,
  LlmTranslateRequest,
  PresignedRequest,
  RateLimiter,
  Telemetry,
  TelemetryEvent,
  TranscriptionProvider,
  TranscriptSegment,
} from '@askcalls/domain';
import { uuidv7 } from 'uuidv7';

const ok = async (): Promise<HealthResult> => ({ ok: true, message: 'mock' });

export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, Uint8Array>();
  healthCheck = ok;
  async put(key: string, body: Uint8Array) {
    this.objects.set(key, body.slice());
  }
  async get(key: string) {
    return this.objects.get(key)?.slice() ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async deletePrefix(prefix: string) {
    let n = 0;
    for (const k of [...this.objects.keys()]) {
      if (k.startsWith(prefix)) {
        this.objects.delete(k);
        n++;
      }
    }
    return n;
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
  async size(key: string) {
    return this.objects.get(key)?.length ?? null;
  }
  private presign(method: 'PUT' | 'GET', key: string, expiresInSec: number): PresignedRequest {
    return {
      url: `mock://blob/${encodeURIComponent(key)}`,
      method,
      headers: {},
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    };
  }
  async presignPut(key: string, opts: { expiresInSec: number }) {
    return this.presign('PUT', key, opts.expiresInSec);
  }
  async presignGet(key: string, opts: { expiresInSec: number }) {
    return this.presign('GET', key, opts.expiresInSec);
  }
}

/**
 * Deterministic transcription: one segment per started 5 seconds of a 16 kB/s estimate.
 * `scripted` lets tests return exact segments.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'mock';
  readonly capabilities = {
    clientTokens: true,
    browserDirect: true,
    maxChunkBytes: 4 * 1024 * 1024,
  };
  readonly received: Array<{ bytes: number; language: string }> = [];
  constructor(private scripted?: TranscriptSegment[]) {}
  healthCheck = ok;
  async mintClientToken() {
    return {
      token: `mock-${uuidv7()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      endpoint: 'mock://transcribe',
    };
  }
  async transcribe(req: { audio: Uint8Array; language: string }) {
    this.received.push({ bytes: req.audio.length, language: req.language });
    if (this.scripted)
      return {
        segments: this.scripted,
        language: req.language === 'auto' ? 'en' : req.language,
        durationSec: this.scripted.at(-1)?.end ?? 0,
      };
    const durationSec = Math.max(1, Math.round(req.audio.length / 16_000));
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < durationSec; t += 5) {
      segments.push({
        start: t,
        end: Math.min(durationSec, t + 5),
        speaker: t % 10 ? 'B' : 'A',
        text: `Mock segment at ${t} seconds.`,
      });
    }
    return { segments, language: req.language === 'auto' ? 'en' : req.language, durationSec };
  }
}

/**
 * The mock translator's whole vocabulary: deterministic, so tests can search one language and
 * find a call in the other. Words it does not know pass through unchanged, like names and numbers.
 */
export const MOCK_DICTIONARY: ReadonlyArray<readonly [string, string]> = [
  ['hello', 'שלום'],
  ['price', 'מחיר'],
  ['order', 'הזמנה'],
  ['delivery', 'משלוח'],
  ['contract', 'חוזה'],
  ['refrigerators', 'מקררים'],
  ['branch', 'סניף'],
  ['tuesday', 'שלישי'],
  ['thursday', 'חמישי'],
  ['morning', 'בוקר'],
  ['quote', 'הצעה'],
  ['roof', 'גג'],
  ['warehouse', 'מחסן'],
  ['panels', 'פאנלים'],
  ['installation', 'התקנה'],
  ['company', 'חברה'],
  ['customer', 'לקוח'],
  ['invoice', 'חשבונית'],
  ['meeting', 'פגישה'],
  ['yes', 'כן'],
];

const EN_HE = new Map(MOCK_DICTIONARY.map(([en, he]) => [en, he]));
const HE_EN = new Map(MOCK_DICTIONARY.map(([en, he]) => [he, en]));
const HE_PREFIX = /^[והבלמשכ]/;

/** English ↔ Hebrew by the dictionary; other targets keep every word (names-and-numbers style). */
function mockTranslateWord(word: string, target: string): string {
  if (target === 'he') return EN_HE.get(word.toLowerCase()) ?? word;
  if (target !== 'en') return word;
  const direct = HE_EN.get(word);
  if (direct) return direct;
  if (word.length > 3 && HE_PREFIX.test(word)) return HE_EN.get(word.slice(1)) ?? word;
  return word;
}

/** Streams a fixed, content-free answer word by word; translates with `MOCK_DICTIONARY`. */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';
  readonly model = 'mock-1';
  readonly asked: Array<{ questionLength: number; transcriptLength: number }> = [];
  readonly translated: Array<{ segments: number; target: string }> = [];
  constructor(private answer = 'This is a mock answer based on the call transcript.') {}
  healthCheck = ok;
  async *ask(req: { question: string; transcriptText: string }) {
    this.asked.push({
      questionLength: req.question.length,
      transcriptLength: req.transcriptText.length,
    });
    for (const word of this.answer.split(/(?<= )/)) yield word;
  }
  async translate(req: LlmTranslateRequest): Promise<string[]> {
    this.translated.push({ segments: req.segments.length, target: req.target });
    return req.segments.map((s) =>
      s.replace(/[\p{L}\p{M}']+/gu, (w) => mockTranslateWord(w, req.target)),
    );
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private clock: Clock = { now: () => new Date() }) {}
  healthCheck = ok;
  async hit(key: string, limit: number, windowMs: number) {
    const now = this.clock.now().getTime();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    const resetAt = new Date((recent[0] ?? now) + windowMs);
    return { allowed, remaining: Math.max(0, limit - recent.length), resetAt };
  }
  private counters = new Map<string, number>();
  async consume(key: string, windowStart: Date, amount: number, limit: number | null) {
    const k = `${key}@${windowStart.getTime()}`;
    const used = this.counters.get(k) ?? 0;
    if (limit !== null && used + amount > limit) return { allowed: false, used };
    this.counters.set(k, used + amount);
    return { allowed: true, used: used + amount };
  }
  async usage(key: string, windowStart: Date) {
    return this.counters.get(`${key}@${windowStart.getTime()}`) ?? 0;
  }
}

/** Records events for assertions (scrubber tests, product-event tests). */
export class RecordingTelemetry implements Telemetry {
  readonly events: Array<{ userId: string | null; event: TelemetryEvent }> = [];
  readonly errors: ErrorReport[] = [];
  readonly timings: Array<{ name: string; ms: number }> = [];
  event(userId: string | null, event: TelemetryEvent) {
    this.events.push({ userId, event });
  }
  error(report: ErrorReport) {
    this.errors.push(report);
  }
  timing(name: string, ms: number) {
    this.timings.push({ name, ms });
  }
  async flush() {}
}

export class FixedClock implements Clock {
  constructor(private t: Date) {}
  now() {
    return new Date(this.t);
  }
  set(t: Date) {
    this.t = t;
  }
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  uuidv7() {
    return uuidv7();
  }
  randomId() {
    this.n += 1;
    return `id_${this.n.toString().padStart(6, '0')}`;
  }
}
