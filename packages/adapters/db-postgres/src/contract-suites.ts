import { describeCallRepositoryContract } from '@askcalls/domain/contracts/call-repository';
import { describeKeyringRepositoryContract } from '@askcalls/domain/contracts/keyring-repository';
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
import { afterAll } from 'vitest';
import type { PostgresDatabase } from './index';
import type { TestDatabase } from './test-support';

/**
 * Registers every domain contract suite against one database per test file, emptied before
 * each test. Used by the PGlite unit run and the real-Postgres integration run alike.
 */
export function describePostgresContracts(name: string, open: () => Promise<TestDatabase>) {
  let shared: Promise<TestDatabase> | null = null;
  const fresh = async () => {
    shared ??= open();
    const t = await shared;
    await t.reset();
    return t;
  };
  afterAll(async () => {
    if (shared) await (await shared).db.close();
  });

  const withUsers = async () => {
    const t = await fresh();
    return { db: t.db, ...(await t.twoUsers()) };
  };
  const scoped = <K extends keyof PostgresDatabase>(key: K) => ({
    setup: async () => {
      const { db, userA, userB } = await withUsers();
      return { store: db[key], userA, userB };
    },
  });

  describeUserRepositoryContract(name, { setup: async () => (await fresh()).db.users });
  describeCallRepositoryContract(name, {
    setup: async () => {
      const { db, userA, userB } = await withUsers();
      return { calls: db.calls, userA, userB };
    },
  });
  describeSearchIndexContract(name, {
    setup: async () => {
      const { db, userA, userB } = await withUsers();
      return { calls: db.calls, search: db.search, userA, userB };
    },
  });
  describeKeyringRepositoryContract(name, {
    setup: async () => {
      const { db, userA, userB } = await withUsers();
      return { keyring: db.keyring, userA, userB };
    },
  });
  describeVocabularyStoreContract(name, scoped('vocab'));
  describeUserDataStoreContract(name, scoped('userData'));
  describeInboxRepositoryContract(name, scoped('inbox'));
  describeApiTokenRepositoryContract(name, scoped('apiTokens'));
  describeAuditLogContract(name, scoped('audit'));
  describeRateLimiterContract(name, { setup: async () => (await fresh()).db.rateLimiter });
}
