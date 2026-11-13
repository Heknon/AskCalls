import { describe, expect, it } from 'vitest';
import { InProcessScheduler, systemIds } from './index';

describe('runtime adapters', () => {
  it('generates distinct ids', () => {
    const a = systemIds.randomId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(systemIds.uuidv7()).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(systemIds.randomId());
  });

  it('runs registered jobs on demand', async () => {
    const s = new InProcessScheduler();
    let ran = 0;
    s.register('retention', async () => {
      ran++;
    });
    await s.run('retention');
    expect(ran).toBe(1);
    await expect(s.run('inbox-expiry')).rejects.toMatchObject({ code: 'not_found' });
  });
});
