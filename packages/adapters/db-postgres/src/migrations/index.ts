import { sql as m0001 } from './0001_init';
import { sql as m0002 } from './0002_local_credentials';
import { sql as m0003 } from './0003_chunk_lang';

export interface Migration {
  /** Sortable, unique, never renamed. */
  id: string;
  sql: string;
}

/**
 * Every migration, in order. Append only: never edit or reorder one that has reached `dev`.
 * Migrations must stay backward compatible with the release still serving (spec 14.1): add
 * columns nullable or with defaults, rename or drop across two releases.
 */
export const MIGRATIONS: readonly Migration[] = [
  { id: '0001_init', sql: m0001 },
  { id: '0002_local_credentials', sql: m0002 },
  { id: '0003_chunk_lang', sql: m0003 },
];
