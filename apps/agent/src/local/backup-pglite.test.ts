import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPostgresDatabase } from '../../../../packages/adapters/db-postgres/src/index';
import { createBackup, restoreBackup } from './backup';
import { localPaths } from './layout';

describe('backup of a real PGlite data directory', () => {
  it('restores a database that opens with every row, migrations already applied', async () => {
    const source = await mkdtemp(join(tmpdir(), 'askcalls-pglite-backup-'));
    const first = await createPostgresDatabase({
      driver: 'pglite',
      dataDir: localPaths(source).db,
    });
    await first.migrate();
    const user = await first.users.create({ email: 'local@example.test' });
    await first.users.setRole(user.id, 'admin');
    await first.close();

    const file = join(source, 'backup.tar');
    await createBackup(source, file);
    const target = await mkdtemp(join(tmpdir(), 'askcalls-pglite-restore-'));
    await restoreBackup(target, file);

    const restored = await createPostgresDatabase({
      driver: 'pglite',
      dataDir: localPaths(target).db,
    });
    try {
      expect((await restored.migrate()).applied).toEqual([]);
      expect(await restored.users.findById(user.id)).toMatchObject({
        email: 'local@example.test',
        role: 'admin',
      });
    } finally {
      await restored.close();
    }
  });
});
