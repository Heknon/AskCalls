import {
  FixedClock,
  MemoryBlobStore,
  MemoryDb,
  MemoryRateLimiter,
  MockLlmProvider,
  MockTranscriptionProvider,
  RecordingTelemetry,
} from '@askcalls/adapter-mocks';
import { InProcessScheduler, noBilling, systemIds } from '@askcalls/adapter-runtime';
import { DEFAULT_LIMITS, type Limits, type Ports } from '@askcalls/domain';

/** A Ports bundle over the in-memory mocks, with handles for assertions. Tests only. */
export interface TestPorts extends Ports {
  db: MemoryDb;
  blobStore: MemoryBlobStore;
  fixedClock: FixedClock;
  recordedTelemetry: RecordingTelemetry;
  mockTranscription: MockTranscriptionProvider;
  mockLlm: MockLlmProvider;
}

export function makeTestPorts(
  opts: {
    limits?: Partial<Limits>;
    now?: Date;
    transcription?: boolean;
    llm?: boolean;
  } = {},
): TestPorts {
  const db = new MemoryDb();
  const blobStore = new MemoryBlobStore();
  const fixedClock = new FixedClock(opts.now ?? new Date('2026-06-15T12:00:00Z'));
  const recordedTelemetry = new RecordingTelemetry();
  const mockTranscription = new MockTranscriptionProvider();
  const mockLlm = new MockLlmProvider();
  return {
    db,
    blobStore,
    fixedClock,
    recordedTelemetry,
    mockTranscription,
    mockLlm,
    users: db.userRepo,
    keyring: db.keyringRepo,
    calls: db.callRepo,
    search: db.searchIndex,
    vocab: db.vocabStore,
    userData: db.userDataStore,
    inbox: db.inboxRepo,
    apiTokens: db.tokenRepo,
    audit: db.auditLog,
    blobs: blobStore,
    transcription: opts.transcription === false ? null : mockTranscription,
    llm: opts.llm === false ? null : mockLlm,
    rateLimiter: new MemoryRateLimiter(fixedClock),
    telemetry: recordedTelemetry,
    billing: noBilling,
    scheduler: new InProcessScheduler(),
    clock: fixedClock,
    ids: systemIds,
    limits: { ...DEFAULT_LIMITS, ...opts.limits },
  };
}
