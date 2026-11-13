import { describePostgresContracts } from './contract-suites';
import { openTestDatabase } from './test-support';

// Every port contract on PGlite (in-memory, pgvector extension): part of `bun run test`.
describePostgresContracts('pglite', () => openTestDatabase({ driver: 'pglite' }));
