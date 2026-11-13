import { describeBlobStoreContract } from '@askcalls/domain/contracts/blob-store';
import { describeCallRepositoryContract } from '@askcalls/domain/contracts/call-repository';
import { describeKeyringRepositoryContract } from '@askcalls/domain/contracts/keyring-repository';
import { describeLocalCredentialRepositoryContract } from '@askcalls/domain/contracts/local-credentials';
import {
  describeLlmProviderContract,
  describeTranscriptionProviderContract,
} from '@askcalls/domain/contracts/providers';
import { describeSearchIndexContract } from '@askcalls/domain/contracts/search-index';
import {
  describeApiTokenRepositoryContract,
  describeAuditLogContract,
  describeInboxRepositoryContract,
  describeRateLimiterContract,
  describeUserDataStoreContract,
  describeVocabularyStoreContract,
} from '@askcalls/domain/contracts/small-stores';
import { describeUserRepositoryContract } from '@askcalls/domain/contracts/user-repository';
import { MemoryDb } from './memory-db';
import {
  MemoryBlobStore,
  MemoryRateLimiter,
  MockLlmProvider,
  MockTranscriptionProvider,
} from './others';

async function twoUsers() {
  const db = new MemoryDb();
  const a = await db.userRepo.create({ email: 'a@example.test' });
  const b = await db.userRepo.create({ email: 'b@example.test' });
  return { db, userA: a.id, userB: b.id };
}

describeBlobStoreContract('memory', { setup: async () => new MemoryBlobStore() });
describeUserRepositoryContract('memory', { setup: async () => new MemoryDb().userRepo });
describeCallRepositoryContract('memory', {
  setup: async () => {
    const { db, userA, userB } = await twoUsers();
    return { calls: db.callRepo, userA, userB };
  },
});
describeSearchIndexContract('memory', {
  setup: async () => {
    const { db, userA, userB } = await twoUsers();
    return { calls: db.callRepo, search: db.searchIndex, userA, userB };
  },
});
describeKeyringRepositoryContract('memory', {
  setup: async () => {
    const { db, userA, userB } = await twoUsers();
    return { keyring: db.keyringRepo, userA, userB };
  },
});
const scoped = <K extends keyof MemoryDb>(key: K) => ({
  setup: async () => {
    const { db, userA, userB } = await twoUsers();
    return { store: db[key], userA, userB };
  },
});
describeVocabularyStoreContract('memory', scoped('vocabStore'));
describeUserDataStoreContract('memory', scoped('userDataStore'));
describeInboxRepositoryContract('memory', scoped('inboxRepo'));
describeApiTokenRepositoryContract('memory', scoped('tokenRepo'));
describeAuditLogContract('memory', scoped('auditLog'));
describeLocalCredentialRepositoryContract('memory', scoped('localCredentialRepo'));
describeRateLimiterContract('memory', { setup: async () => new MemoryRateLimiter() });
describeTranscriptionProviderContract('mock', {
  setup: async () => ({
    provider: new MockTranscriptionProvider(),
    sampleAudio: new Uint8Array(160_000),
    mimeType: 'audio/ogg',
  }),
});
describeLlmProviderContract('mock', { setup: async () => new MockLlmProvider() });
