import { listCalls } from '@askcalls/api-contract/routes/calls';
import { getCall } from '@askcalls/client-core/calls';
import { ingestCall } from '@askcalls/client-core/ingest';
import { Onboarding } from '@askcalls/client-core/keys';
import { createTag } from '@askcalls/client-core/tags';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ClientDevice,
  type ClientHarness,
  startClientHarness,
} from '../../../../../../server/testing/client';
import { newDraft, toRule } from './rule-draft';
import { applyRule, countMatches, FactsCache } from './rule-run';

let h: ClientHarness;
let device: ClientDevice;

beforeAll(async () => {
  h = await startClientHarness();
  device = h.browser();
  const o = await Onboarding.begin(h.userId);
  await o.addPasskey(h.passkeys, { userName: 'owner', label: 'Laptop' });
  const [a, b] = o.confirmationGroups;
  o.confirmRecovery({ [a]: o.recoveryGroups[a]!, [b]: o.recoveryGroups[b]! });
  await o.finish({
    api: device.ctx.api,
    session: device.session,
    deviceKeys: device.deviceKeys,
    deviceLabel: 'Laptop',
  });
  const calls = [
    ['Please send the invoice for March.', '+972525550134'],
    ['Thanks, see you on Sunday.', '+972545550000'],
    ['The invoices were paid yesterday.', '+972525550134'],
  ];
  for (const [text, phone] of calls) {
    const r = await ingestCall(device.ctx, {
      source: 'app',
      transcript: { segments: [{ start: 0, end: 30, text: text! }] },
      meta: { phone: phone!, direction: 'in' },
    });
    expect(r.status).toBe('done');
  }
});

afterAll(() => h.app.close());

describe('applying a rule to existing calls on the device', () => {
  it('counts matches, adds the tag where it matches and leaves the rest', async () => {
    const tag = await createTag(device.ctx.userData, { name: 'Billing' });
    const draft = newDraft('r1', 'Invoices');
    draft.conditions = [
      { key: 'k', type: 'keyword', match: 'any', terms: ['invoice'], fuzzy: true },
    ];
    draft.actions = [{ key: 'a', type: 'add_tag', tagId: tag.id }];
    const rule = toRule(draft, []);
    const cache = new FactsCache();
    const progress: number[] = [];

    expect(await countMatches(device.ctx, rule, { cache })).toBe(2);
    const result = await applyRule(device.ctx, rule, {
      cache,
      onProgress: (n) => progress.push(n),
    });
    expect(result).toEqual({ matched: 2, changed: 2, finished: true });
    expect(progress.at(-1)).toBe(3);

    const tagged = await device.ctx.api.request(listCalls, { query: { limit: 10 } });
    const names = await Promise.all(
      tagged.items.map(async (i) => {
        const call = await getCall(device.ctx, i.id);
        return [
          call.transcript.text,
          call.tags.flatMap((t) => (t.kind === 'tag' ? [t.tag.name] : [])),
        ] as const;
      }),
    );
    expect(Object.fromEntries(names.map(([text, tags]) => [text.trim(), tags]))).toEqual({
      'Please send the invoice for March.': ['Billing'],
      'Thanks, see you on Sunday.': [],
      'The invoices were paid yesterday.': ['Billing'],
    });

    expect(await applyRule(device.ctx, rule, { cache })).toEqual({
      matched: 2,
      changed: 0,
      finished: true,
    });
  });

  it('matches by contact number and stops when aborted', async () => {
    const rule = toRule(
      {
        ...newDraft('r2', ''),
        conditions: [{ key: 'c', type: 'contact', op: 'in', contact: 'all' }],
        actions: [{ key: 'a', type: 'star' }],
      },
      [],
    );
    const cache = new FactsCache();
    await device.ctx.userData.update('contacts', (d) => ({ ...d, contacts: [] }));
    expect(await countMatches(device.ctx, rule, { cache })).toBe(0);
    await device.ctx.userData.update('contacts', (d) => ({
      ...d,
      contacts: [{ id: 'c1', name: 'Dana', phones: ['+972525550134'], aliases: [] }],
    }));
    expect(await countMatches(device.ctx, rule, { cache })).toBe(2);

    const abort = new AbortController();
    abort.abort();
    expect(await applyRule(device.ctx, rule, { cache, signal: abort.signal })).toEqual({
      matched: 0,
      changed: 0,
      finished: false,
    });
  });
});
