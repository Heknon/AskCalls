import {
  type ApiToken,
  type ApiTokenRepository,
  type AuditEvent,
  type AuditLog,
  type Call,
  type CallChunk,
  type CallRepository,
  type CallSummary,
  type DeviceKey,
  type DeviceLinkSession,
  DomainError,
  type HealthResult,
  type InboxItem,
  type InboxRepository,
  type KeyringEntry,
  type KeyringRepository,
  type LinkedAccount,
  type Page,
  type SearchHit,
  type SearchIndex,
  type User,
  type UserDataBlob,
  type UserDataKind,
  type UserDataStore,
  type UserKeys,
  type UserRepository,
  type VerificationToken,
  type VocabDelta,
  type VocabularyStore,
} from '@askcalls/domain';
import { uuidv7 } from 'uuidv7';

const ok = async (): Promise<HealthResult> => ({ ok: true, message: 'in-memory' });

const encodeCursor = (offset: number) => (offset > 0 ? String(offset) : null);
const decodeCursor = (cursor?: string | null) => (cursor ? Number.parseInt(cursor, 10) : 0);

function paginate<T>(rows: T[], limit: number, cursor?: string | null): Page<T> {
  const start = decodeCursor(cursor);
  const items = rows.slice(start, start + limit);
  const next = start + limit < rows.length ? encodeCursor(start + limit) : null;
  return { items, nextCursor: next };
}

const byDayDesc = (a: Call, b: Call) => b.day - a.day || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function summary(c: Call): CallSummary {
  return {
    id: c.id,
    day: c.day,
    durationBucket: c.durationBucket,
    wrappedDek: c.wrappedDek,
    metaCt: c.metaCt,
    tagToks: [...c.tagToks],
    hasRecording: c.recording !== null,
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * One in-memory database backing every repository mock, so cascades (user deletion,
 * call deletion removing chunks) behave like the real schema.
 */
export class MemoryDb {
  users = new Map<string, User>();
  keyring = new Map<string, KeyringEntry>();
  userKeys = new Map<string, UserKeys>();
  devices = new Map<string, DeviceKey>();
  linkSessions = new Map<string, DeviceLinkSession>();
  calls = new Map<string, Call>();
  chunks = new Map<string, CallChunk[]>();
  vocab: VocabDelta[] = [];
  userData = new Map<string, UserDataBlob & { userId: string }>();
  inbox = new Map<string, InboxItem>();
  tokens = new Map<string, ApiToken & { fetches: number; windowStart: Date | null }>();
  audit: AuditEvent[] = [];
  accounts: LinkedAccount[] = [];
  verificationTokens: VerificationToken[] = [];

  readonly userRepo: UserRepository = {
    healthCheck: ok,
    create: async (u) => {
      const user: User = {
        id: uuidv7(),
        email: u.email,
        name: u.name ?? null,
        image: u.image ?? null,
        plan: 'free',
        role: 'user',
        locale: null,
        telemetryConsent: { productEvents: false, errorReports: false },
        retentionDays: null,
        createdAt: new Date(),
        deletedAt: null,
      };
      this.users.set(user.id, user);
      return { ...user };
    },
    findById: async (id) => (this.users.has(id) ? { ...this.users.get(id)! } : null),
    findByEmail: async (email) => {
      for (const u of this.users.values()) if (u.email === email) return { ...u };
      return null;
    },
    update: async (id, patch) => {
      const u = this.users.get(id);
      if (!u) throw new DomainError('not_found', 'user not found');
      Object.assign(u, patch);
      return { ...u };
    },
    setPlan: async (id, plan) => {
      const u = this.users.get(id);
      if (u) u.plan = plan;
    },
    setRole: async (id, role) => {
      const u = this.users.get(id);
      if (u) u.role = role;
    },
    count: async () => this.users.size,
    listWithRetention: async () =>
      [...this.users.values()]
        .filter((u) => u.retentionDays !== null)
        .map((u) => ({ id: u.id, retentionDays: u.retentionDays! })),
    deleteHard: async (id) => {
      this.users.delete(id);
      const drop = <V extends { userId: string }>(m: Map<string, V>) => {
        for (const [k, v] of m) if (v.userId === id) m.delete(k);
      };
      drop(this.keyring);
      drop(this.devices);
      drop(this.linkSessions);
      drop(this.calls);
      drop(this.inbox);
      drop(this.tokens);
      drop(this.userData);
      this.userKeys.delete(id);
      for (const [k, v] of this.chunks) if (v[0]?.userId === id) this.chunks.delete(k);
      this.vocab = this.vocab.filter((d) => d.userId !== id);
      this.audit = this.audit.filter((e) => e.userId !== id);
      this.accounts = this.accounts.filter((a) => a.userId !== id);
    },
    findByAccount: async (provider, providerAccountId) => {
      const a = this.accounts.find(
        (x) => x.provider === provider && x.providerAccountId === providerAccountId,
      );
      return a && this.users.has(a.userId) ? { ...this.users.get(a.userId)! } : null;
    },
    linkAccount: async (account) => {
      if (
        this.accounts.some(
          (x) =>
            x.provider === account.provider && x.providerAccountId === account.providerAccountId,
        )
      ) {
        throw new DomainError('conflict', 'account already linked');
      }
      this.accounts.push({ ...account });
    },
    unlinkAccount: async (provider, providerAccountId) => {
      this.accounts = this.accounts.filter(
        (x) => !(x.provider === provider && x.providerAccountId === providerAccountId),
      );
    },
    listAccounts: async (userId) =>
      this.accounts.filter((a) => a.userId === userId).map((a) => ({ ...a })),
    createVerificationToken: async (t) => {
      this.verificationTokens.push({ ...t });
    },
    useVerificationToken: async (identifier, token) => {
      const i = this.verificationTokens.findIndex(
        (t) => t.identifier === identifier && t.token === token,
      );
      if (i < 0) return null;
      const [t] = this.verificationTokens.splice(i, 1);
      return t!;
    },
  };

  readonly keyringRepo: KeyringRepository = {
    healthCheck: ok,
    list: async (userId, opts) =>
      [...this.keyring.values()]
        .filter((e) => e.userId === userId && (opts?.includeRevoked || !e.revokedAt))
        .map((e) => ({ ...e })),
    get: async (userId, id) => {
      const e = this.keyring.get(id);
      return e && e.userId === userId && !e.revokedAt ? { ...e } : null;
    },
    add: async (entry) => {
      const e: KeyringEntry = {
        ...entry,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };
      this.keyring.set(e.id, e);
      return { ...e };
    },
    revoke: async (userId, id, at) => {
      const e = this.keyring.get(id);
      if (e && e.userId === userId) {
        e.revokedAt = at;
        e.wrappedRootKey = new Uint8Array();
      }
    },
    touch: async (userId, id, at) => {
      const e = this.keyring.get(id);
      if (e && e.userId === userId) e.lastUsedAt = at;
    },
    getUserKeys: async (userId) =>
      this.userKeys.has(userId) ? { ...this.userKeys.get(userId)! } : null,
    putUserKeys: async (keys) => {
      this.userKeys.set(keys.userId, { ...keys });
    },
    listDevices: async (userId) =>
      [...this.devices.values()].filter((d) => d.userId === userId).map((d) => ({ ...d })),
    getDevice: async (userId, id) => {
      const d = this.devices.get(id);
      return d && d.userId === userId ? { ...d } : null;
    },
    addDevice: async (device) => {
      const d: DeviceKey = { ...device, createdAt: new Date(), revokedAt: null };
      this.devices.set(d.id, d);
      return { ...d };
    },
    revokeDevice: async (userId, id, at) => {
      const d = this.devices.get(id);
      if (d && d.userId === userId) d.revokedAt = at;
    },
    createLinkSession: async (s) => {
      this.linkSessions.set(s.id, { ...s });
    },
    getLinkSession: async (id) =>
      this.linkSessions.has(id) ? { ...this.linkSessions.get(id)! } : null,
    updateLinkSession: async (id, patch) => {
      const s = this.linkSessions.get(id);
      if (!s) throw new DomainError('not_found', 'link session not found');
      Object.assign(s, patch);
    },
    deleteExpiredLinkSessions: async (now) => {
      let n = 0;
      for (const [k, s] of this.linkSessions) {
        if (s.expiresAt <= now) {
          this.linkSessions.delete(k);
          n++;
        }
      }
      return n;
    },
  };

  private ownCall(userId: string, id: string): Call | null {
    const c = this.calls.get(id);
    return c && c.userId === userId ? c : null;
  }

  readonly callRepo: CallRepository = {
    healthCheck: ok,
    create: async (input) => {
      if (this.calls.has(input.id)) throw new DomainError('conflict', 'call id already exists');
      for (const c of this.calls.values()) {
        if (c.userId !== input.userId) continue;
        if (
          c.contentTok === input.contentTok ||
          (input.audioTok !== null && c.audioTok === input.audioTok)
        ) {
          throw new DomainError('duplicate', 'call already exists', { existingId: c.id });
        }
      }
      const now = new Date();
      const call: Call = {
        ...input,
        keywordToks: [...input.keywordToks],
        tagToks: [...input.tagToks],
        createdAt: now,
        updatedAt: now,
      };
      this.calls.set(call.id, call);
      return { ...call };
    },
    get: async (userId, id) => {
      const c = this.ownCall(userId, id);
      return c ? { ...c } : null;
    },
    list: async (userId, filter, page) => {
      const rows = [...this.calls.values()]
        .filter(
          (c) =>
            c.userId === userId &&
            (filter.dayFrom === undefined || c.day >= filter.dayFrom) &&
            (filter.dayTo === undefined || c.day <= filter.dayTo) &&
            (filter.tagToks ?? []).every((t) => c.tagToks.includes(t)),
        )
        .sort(byDayDesc)
        .map(summary);
      return paginate(rows, page.limit, page.cursor);
    },
    update: async (userId, id, patch) => {
      const c = this.ownCall(userId, id);
      if (!c) throw new DomainError('not_found', 'call not found');
      if (patch.metaCt) c.metaCt = patch.metaCt;
      if (patch.tagToks) c.tagToks = [...patch.tagToks];
      if (patch.recording !== undefined) c.recording = patch.recording;
      c.updatedAt = new Date();
      return { ...c };
    },
    delete: async (userId, id) => {
      const c = this.ownCall(userId, id);
      if (!c) return null;
      this.calls.delete(id);
      this.chunks.delete(id);
      return { ...c };
    },
    findIdByAudioTok: async (userId, tok) => {
      for (const c of this.calls.values())
        if (c.userId === userId && c.audioTok === tok) return c.id;
      return null;
    },
    findIdByContentTok: async (userId, tok) => {
      for (const c of this.calls.values())
        if (c.userId === userId && c.contentTok === tok) return c.id;
      return null;
    },
    count: async (userId) => [...this.calls.values()].filter((c) => c.userId === userId).length,
    totalRecordingBytes: async (userId) =>
      [...this.calls.values()]
        .filter((c) => c.userId === userId && c.recording?.bucketRef === null)
        .reduce((n, c) => n + (c.recording?.bytes ?? 0), 0),
    listIdsBefore: async (userId, beforeDay, limit) =>
      [...this.calls.values()]
        .filter((c) => c.userId === userId && c.day < beforeDay)
        .slice(0, limit)
        .map((c) => c.id),
  };

  readonly searchIndex: SearchIndex = {
    healthCheck: ok,
    upsertChunks: async (userId, callId, chunks) => {
      if (!this.ownCall(userId, callId)) throw new DomainError('not_found', 'call not found');
      this.chunks.set(
        callId,
        chunks.map((c) => ({ ...c, userId, callId })),
      );
    },
    deleteChunks: async (userId, callId) => {
      if (this.ownCall(userId, callId)) this.chunks.delete(callId);
    },
    search: async (userId, q) => {
      const matches = [...this.calls.values()].filter(
        (c) =>
          c.userId === userId &&
          q.keywordGroups.every((g) => g.some((t) => c.keywordToks.includes(t))) &&
          (!q.contactToks?.length ||
            (c.contactTok !== null && q.contactToks.includes(c.contactTok))) &&
          (q.tagToks ?? []).every((t) => c.tagToks.includes(t)) &&
          !(q.excludeTagToks ?? []).some((t) => c.tagToks.includes(t)) &&
          (q.dayFrom === undefined || c.day >= q.dayFrom) &&
          (q.dayTo === undefined || c.day <= q.dayTo),
      );
      let hits: SearchHit[];
      if (q.vector) {
        const vector = q.vector;
        hits = matches
          .flatMap((c) => {
            const chunks = this.chunks.get(c.id) ?? [];
            if (!chunks.length) return [];
            let best = chunks[0]!;
            let bestScore = -2;
            for (const ch of chunks) {
              const s = cosine(vector, ch.embedding);
              if (s > bestScore) {
                bestScore = s;
                best = ch;
              }
            }
            return [
              {
                ...summary(c),
                bestSnippetCt: best.snippetCt,
                bestChunkOrd: best.ord,
                score: bestScore,
              },
            ];
          })
          .sort((a, b) => b.score! - a.score! || (a.id < b.id ? 1 : -1));
      } else {
        hits = matches
          .sort(byDayDesc)
          .map((c) => ({ ...summary(c), bestSnippetCt: null, bestChunkOrd: null, score: null }));
      }
      return paginate(hits, q.limit, q.cursor);
    },
  };

  readonly vocabStore: VocabularyStore = {
    healthCheck: ok,
    listSince: async (userId, afterSeq) =>
      this.vocab
        .filter((d) => d.userId === userId && d.seq > afterSeq)
        .sort((a, b) => a.seq - b.seq),
    append: async (userId, ct) => {
      const seq =
        Math.max(0, ...this.vocab.filter((d) => d.userId === userId).map((d) => d.seq)) + 1;
      const d: VocabDelta = {
        id: uuidv7(),
        userId,
        seq,
        ct,
        compacted: false,
        createdAt: new Date(),
      };
      this.vocab.push(d);
      return { ...d };
    },
    compact: async (userId, upToSeq, ct) => {
      this.vocab = this.vocab.filter((d) => !(d.userId === userId && d.seq <= upToSeq));
      const d: VocabDelta = {
        id: uuidv7(),
        userId,
        seq: upToSeq,
        ct,
        compacted: true,
        createdAt: new Date(),
      };
      this.vocab.push(d);
      return { ...d };
    },
    count: async (userId) => this.vocab.filter((d) => d.userId === userId).length,
  };

  readonly userDataStore: UserDataStore = {
    healthCheck: ok,
    get: async (userId, kind) => {
      const b = this.userData.get(`${userId}:${kind}`);
      return b ? { kind: b.kind, ct: b.ct, version: b.version } : null;
    },
    put: async (userId, kind: UserDataKind, ct, expectedVersion) => {
      const key = `${userId}:${kind}`;
      const current = this.userData.get(key)?.version ?? 0;
      if (current !== expectedVersion) {
        throw new DomainError('version_conflict', 'user data changed', { current });
      }
      const blob = { kind, ct, version: current + 1, userId };
      this.userData.set(key, blob);
      return blob.version;
    },
  };

  readonly inboxRepo: InboxRepository = {
    healthCheck: ok,
    create: async (item) => {
      const i: InboxItem = { ...item, createdAt: new Date() };
      this.inbox.set(i.id, i);
      return { ...i };
    },
    list: async (userId) =>
      [...this.inbox.values()]
        .filter((i) => i.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    get: async (userId, id) => {
      const i = this.inbox.get(id);
      return i && i.userId === userId ? { ...i } : null;
    },
    delete: async (userId, id) => {
      const i = this.inbox.get(id);
      if (!i || i.userId !== userId) return null;
      this.inbox.delete(id);
      return i;
    },
    count: async (userId) => [...this.inbox.values()].filter((i) => i.userId === userId).length,
    deleteExpired: async (now) => {
      const out: Array<{ userId: string; blobKey: string | null }> = [];
      for (const [k, i] of this.inbox) {
        if (i.expiresAt <= now) {
          this.inbox.delete(k);
          out.push({ userId: i.userId, blobKey: i.blobKey });
        }
      }
      return out;
    },
  };

  readonly tokenRepo: ApiTokenRepository = {
    healthCheck: ok,
    create: async (t) => {
      const token = {
        ...t,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
        fetches: 0,
        windowStart: null,
      };
      this.tokens.set(t.id, token);
      const { fetches: _f, windowStart: _w, ...pub } = token;
      return pub;
    },
    findByHash: async (hash) => {
      for (const t of this.tokens.values()) {
        if (t.tokenHash.length === hash.length && t.tokenHash.every((b, i) => b === hash[i])) {
          const { fetches: _f, windowStart: _w, ...pub } = t;
          return pub;
        }
      }
      return null;
    },
    list: async (userId) =>
      [...this.tokens.values()]
        .filter((t) => t.userId === userId)
        .map(({ fetches: _f, windowStart: _w, ...pub }) => pub),
    revoke: async (userId, id, at) => {
      const t = this.tokens.get(id);
      if (t && t.userId === userId) t.revokedAt = at;
    },
    touch: async (id, at) => {
      const t = this.tokens.get(id);
      if (t) t.lastUsedAt = at;
    },
    countActive: async (userId, now) =>
      [...this.tokens.values()].filter(
        (t) => t.userId === userId && !t.revokedAt && (!t.expiresAt || t.expiresAt > now),
      ).length,
    incrementFetches: async (id, now) => {
      const t = this.tokens.get(id);
      if (!t) throw new DomainError('not_found', 'token not found');
      if (!t.windowStart || now.getTime() - t.windowStart.getTime() >= 3_600_000) {
        t.windowStart = now;
        t.fetches = 0;
      }
      t.fetches += 1;
      return t.fetches;
    },
  };

  readonly auditLog: AuditLog = {
    healthCheck: ok,
    append: async (e) => {
      this.audit.push({ ...e, id: uuidv7(), at: new Date() });
    },
    list: async (userId, page, filter) => {
      const rows = this.audit
        .filter((e) => e.userId === userId && (!filter?.action || e.action === filter.action))
        .reverse();
      return paginate(rows, page.limit, page.cursor);
    },
  };
}
