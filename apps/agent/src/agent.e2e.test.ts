import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTokens } from '@askcalls/api-contract/routes/tokens';
import {
  checkDeviceLink,
  confirmDeviceLink,
  Onboarding,
  randomId,
  startDeviceLink,
} from '@askcalls/client-core';
import { FakeAudioCodec, MemorySecretStore } from '@askcalls/client-core/testing/fakes';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as cliLogin from '../../web/src/app/(cli)/cli/login/route';
import {
  blobTransport,
  type ClientDevice,
  type ClientHarness,
  startClientHarness,
} from '../../web/src/server/testing/client';
import { dispatch as dispatchApi } from '../../web/src/server/testing/http';
import { ENGLISH_CALL, HEBREW_CALL, TAG_NAME } from '../../web/src/server/testing/samples';
import { type AgentDeps, API_TOKEN_SECRET } from './agent';
import { runIngest } from './commands/ingest';
import { runLink } from './commands/link';
import { runLogin } from './commands/login';
import { startAgentState } from './commands/mcp';
import { loadConfig } from './config';
import type { Io } from './io';
import { createAgentMcpServer } from './mcp/server';

/** The web app's configured APP_URL in the test container. */
const SERVER = 'http://localhost:3000';

/** The API route handlers plus the CLI login page. */
/** Requests the agent sent to the server. */
let sent = 0;

function dispatch(req: Request): Promise<Response> {
  sent++;
  if (new URL(req.url).pathname !== '/cli/login') return dispatchApi(req);
  return req.method === 'POST' ? cliLogin.POST(req) : cliLogin.GET(req);
}

let h: ClientHarness;
let browser: ClientDevice;
let dir: string;
let deps: AgentDeps;
let client: Client;
const lines: string[] = [];

const io = (openBrowser: Io['openBrowser'] = async () => false): Io => ({
  out: (l) => lines.push(l),
  err: (l) => lines.push(l),
  openBrowser,
  readLine: async () => null,
  interactive: false,
});

async function onboard(device: ClientDevice) {
  const o = await Onboarding.begin(h.userId);
  await o.addPasskey(h.passkeys, { userName: 'owner', label: 'Laptop passkey' });
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({
    api: device.ctx.api,
    session: device.session,
    deviceKeys: device.deviceKeys,
    deviceLabel: 'Laptop',
  });
}

/** What the browser does for `askcalls login`: consent page, consent POST, hand-off form. */
async function browserLogin(authorizeUrl: string): Promise<boolean> {
  const url = new URL(authorizeUrl);
  const page = await dispatch(new Request(url, { headers: { cookie: h.cookie } }));
  expect(page.status).toBe(200);
  const consent = await dispatch(
    new Request(new URL('/cli/login', SERVER), {
      method: 'POST',
      headers: {
        cookie: h.cookie,
        origin: SERVER,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        port: url.searchParams.get('port')!,
        state: url.searchParams.get('state')!,
      }).toString(),
    }),
  );
  const html = await consent.text();
  const action = html.match(/action="(http:\/\/127\.0\.0\.1:\d+\/callback)"/)![1]!;
  const field = (name: string) => html.match(new RegExp(`name="${name}" value="([^"]+)"`))![1]!;
  const res = await fetch(action, {
    method: 'POST',
    headers: { origin: SERVER, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: field('state'), token: field('token') }).toString(),
  });
  expect(res.status).toBe(200);
  return true;
}

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = r.content[0]!.text;
  // biome-ignore lint/suspicious/noExplicitAny: tool results are JSON documents read by tests
  return { isError: r.isError === true, text, json: (r.isError ? null : JSON.parse(text)) as any };
}

const ids = { en: '', he: '' };

beforeAll(async () => {
  h = await startClientHarness();
  browser = h.browser();
  await onboard(browser);
  await browser.ctx.userData.update('contacts', (d) => ({
    ...d,
    contacts: [
      { id: randomId(), name: HEBREW_CALL.contactName, phones: [HEBREW_CALL.phone], aliases: [] },
    ],
  }));
  dir = await mkdtemp(join(tmpdir(), 'askcalls-agent-'));
  deps = {
    dir,
    secrets: { store: new MemorySecretStore(), kind: 'keychain' },
    fetch: (url, init) => dispatch(new Request(url, init)),
    api: { maxPerMinute: 0, sleep: async () => {} },
    embedder: h.embedder,
    audio: new FakeAudioCodec(),
    blobs: {
      ...blobTransport(h.app.ports.blobStore).uploader,
      ...blobTransport(h.app.ports.blobStore).fetcher,
    },
    clock: h.app.ports.clock,
  };
});

afterAll(async () => {
  await client?.close();
  h.app.close();
  await rm(dir, { recursive: true, force: true });
});

describe('askcalls agent against the route handlers', () => {
  it('serves only an explanation before login', async () => {
    const { state } = await startAgentState(deps, () => {});
    const server = createAgentMcpServer({
      state,
      decryptBudget: 10,
      configPath: 'x',
      version: '0',
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'test', version: '0' });
    await Promise.all([server.connect(a), c.connect(b)]);
    const r = (await c.callTool({ name: 'search_calls', arguments: { query: 'x' } })) as ToolResult;
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/not logged in.*askcalls login/);
    await c.close();
  });

  it('explains the import format and dry-runs a folder before login, sending nothing', async () => {
    const { state } = await startAgentState(deps, () => {});
    const server = createAgentMcpServer({
      state,
      decryptBudget: 10,
      configPath: 'x',
      version: '0',
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'test', version: '0' });
    await Promise.all([server.connect(a), c.connect(b)]);
    const guide = (await c.callTool({ name: 'import_format', arguments: {} })) as ToolResult;
    expect(guide.isError).toBeFalsy();
    expect(guide.content[0]!.text).toContain('| started_at |');

    const folder = join(dir, 'dry');
    await mkdir(folder);
    await writeFile(join(folder, 'a.mp3'), 'not really audio');
    await writeFile(join(folder, 'a.transcript.txt'), 'Dana: The Okapix order is ready.');
    await writeFile(join(folder, 'notes.pdf'), 'x');
    await writeFile(
      join(folder, 'manifest.csv'),
      'file,phone,started_at,direction,contact_name\na.mp3,+972501234567,2026-03-01 10:00,sideways,Dana\nmissing.mp3,,,,\n',
    );
    const sentBefore = sent;
    const r = (await c.callTool({
      name: 'ingest_batch',
      arguments: { folder_path: folder, dry_run: true },
    })) as ToolResult;
    expect(r.isError).toBeFalsy();
    const plan = JSON.parse(r.content[0]!.text);
    expect(plan.summary).toMatchObject({
      calls: 1,
      with_audio: 1,
      with_transcript: 1,
      skipped_files: 1,
      manifest_issues: 1,
      manifest_rows_without_file: 1,
      calls_without_manifest_row: 0,
    });
    expect(plan.calls[0]).toMatchObject({
      audio: 'a.mp3',
      transcript: 'a.transcript.txt',
      manifest_line: 2,
      phone: '+972501234567',
      started_at: '2026-03-01T10:00:00.000Z',
      direction: null,
      contact_name: 'Dana',
    });
    expect(plan.skipped).toEqual([{ file: 'notes.pdf', reason: 'unsupported' }]);
    expect(plan.manifest.issues).toEqual([{ line: 2, code: 'bad_direction' }]);
    expect(plan.manifest.rows_without_file).toEqual([{ line: 3, file: 'missing.mp3' }]);

    lines.length = 0;
    await runIngest(
      folder,
      { transcribe: 'auto', dryRun: true },
      { ...deps, io: io(), tty: false },
    );
    expect(lines[0]).toBe('Would import 1 call: 1 with a recording, 1 with a transcript.');
    expect(lines).toContain('  notes.pdf: not audio or a transcript');
    expect(lines).toContain('  line 2: bad_direction');
    expect(lines).toContain('  line 3: missing.mp3 matches no file');
    expect(lines.at(-1)).toBe('Nothing was imported. Run again without --dry-run to import.');
    expect(sent).toBe(sentBefore);
    await c.close();
  });

  it('logs in through the browser loopback and stores the token in the keychain', async () => {
    await runLogin({ url: SERVER }, { ...deps, io: io(browserLogin) });
    expect((await loadConfig(dir)).server).toBe(SERVER);
    const token = new TextDecoder().decode((await deps.secrets!.store.get(API_TOKEN_SECRET))!);
    expect(token).toMatch(/^ac_/);
    const { items } = await h.app.client({ cookie: h.cookie }).request(listTokens, {});
    expect(items.map((t) => [t.name, [...t.scopes].sort()])).toEqual([
      ['askcalls CLI', ['ask', 'keys', 'read', 'write']],
    ]);
    expect(lines.some((l) => l.includes('askcalls link'))).toBe(true);
  });

  it('links: shows the fingerprint the trusted device shows, then unlocks from the keychain', async () => {
    const started = await startDeviceLink(browser.ctx);
    const linking = runLink({ code: started.code }, { ...deps, io: io(), pollMs: 50 });
    let status = await checkDeviceLink(browser.ctx.api, started);
    while (status.state === 'waiting_for_device') {
      await new Promise((r) => setTimeout(r, 50));
      status = await checkDeviceLink(browser.ctx.api, started);
    }
    if (status.state !== 'waiting_for_confirmation') throw new Error(status.state);
    const shown = lines.find((l) => l.includes('Fingerprint:'))!.replace(/\D/g, '');
    expect(shown).toBe(status.fingerprint);
    await confirmDeviceLink(browser.ctx, started, status.devicePublicKey);
    expect((await linking).deviceKeyId).toBeTruthy();
    await expect(runLink({ code: started.code }, { ...deps, io: io() })).rejects.toThrow(
      /already linked/,
    );

    const { state } = await startAgentState(deps, () => {});
    expect('ctx' in state).toBe(true);
    const server = createAgentMcpServer({
      state,
      decryptBudget: 10,
      configPath: join(dir, 'config.json'),
      version: '0',
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
  });

  it('exposes exactly the spec tools, each warning that transcripts are untrusted', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_call',
      'import_format',
      'ingest_batch',
      'ingest_call',
      'list_contacts',
      'list_recent_calls',
      'list_tags',
      'search_calls',
      'star_call',
      'tag_call',
    ]);
    for (const t of tools) expect(t.description).toMatch(/untrusted/);
  });

  it('ingests English text and a Hebrew SRT file', async () => {
    const en = await call('ingest_call', {
      transcript_text: ENGLISH_CALL.text,
      phone: ENGLISH_CALL.phone,
      started_at: ENGLISH_CALL.startedAt,
      direction: 'out',
    });
    expect(en.json.status).toBe('done');
    ids.en = en.json.call_id;
    const srt = join(dir, HEBREW_CALL.fileName);
    await writeFile(srt, HEBREW_CALL.text);
    const he = await call('ingest_call', {
      transcript_path: srt,
      phone: HEBREW_CALL.phone,
      started_at: HEBREW_CALL.startedAt,
      direction: 'in',
    });
    expect(he.json.status).toBe('done');
    ids.he = he.json.call_id;
    expect((await call('ingest_call', { transcript_text: ENGLISH_CALL.text })).json).toEqual({
      status: 'duplicate',
      existing_call_id: ids.en,
      matched_by: 'content',
    });
    expect((await call('ingest_call', { transcript_path: 'relative.txt' })).isError).toBe(true);
  });

  it('searches by keyword, typo, Hebrew form, phone and contact name', async () => {
    const found = async (args: Record<string, unknown>) =>
      (await call('search_calls', args)).json.results.map((r: { id: string }) => r.id);
    expect(await found({ query: 'photovoltaic' })).toEqual([ids.en]);
    const typo = await call('search_calls', { query: 'contrakt' });
    expect(typo.json.results.map((r: { id: string }) => r.id)).toEqual([ids.en]);
    expect(typo.json.also_matched).toContain('contract');
    const semantic = await call('search_calls', {
      query: 'solar panels on the roof',
      semantic: true,
    });
    expect(semantic.json.results[0].id).toBe(ids.en);
    expect(semantic.json.results[0].excerpt).toMatch(/^<transcript>\n[\s\S]*\n<\/transcript>$/);
    expect(typo.json.results[0].phone).toBe(ENGLISH_CALL.e164);
    expect(await found({ query: 'ולמקררים' })).toEqual([ids.he]);
    expect(await found({ contact: '054-765-4321' })).toEqual([ids.en]);
    expect(await found({ contact: 'גלבועי' })).toEqual([ids.he]);
    expect(await found({ query: 'photovoltaic', date_from: '2026-06-11' })).toEqual([]);
  });

  it('tags, stars and lists the catalogs', async () => {
    const tagged = await call('tag_call', { id: ids.en, add: [TAG_NAME, 'Solar'] });
    expect(tagged.json.tags.sort()).toEqual([TAG_NAME, 'Solar'].sort());
    const removed = await call('tag_call', { id: ids.en, remove: ['Solar', 'Nope'] });
    expect(removed.json).toMatchObject({ tags: [TAG_NAME], not_found: ['Nope'] });
    const byTag = await call('search_calls', { tags: [TAG_NAME] });
    expect(byTag.json.results.map((r: { id: string }) => r.id)).toEqual([ids.en]);
    expect((await call('search_calls', { tags: ['Unknown'] })).json.results).toEqual([]);

    expect((await call('star_call', { id: ids.he, starred: true })).json.starred).toBe(true);
    const starred = await call('search_calls', { starred: true });
    expect(starred.json.results.map((r: { id: string }) => r.id)).toEqual([ids.he]);

    const tags = (await call('list_tags')).json;
    expect(tags.tags.map((t: { name: string }) => t.name).sort()).toEqual(
      [TAG_NAME, 'Solar'].sort(),
    );
    expect(tags.intents).toContain('intent:complaint');
    expect((await call('list_contacts')).json.contacts).toEqual([
      { name: HEBREW_CALL.contactName, phones: [HEBREW_CALL.phone] },
      { name: ENGLISH_CALL.e164, phones: [ENGLISH_CALL.e164] },
    ]);

    const recent = (await call('list_recent_calls', { days: 3650 })).json.calls;
    expect(recent.map((c: { id: string }) => c.id).sort()).toEqual([ids.en, ids.he].sort());
    const he = recent.find((c: { id: string }) => c.id === ids.he);
    expect(he).toMatchObject({ phone: HEBREW_CALL.e164, starred: true, direction: 'in' });
    expect(JSON.stringify(recent)).not.toContain('<transcript>');
  });

  it('reads a call inside transcript delimiters, within a decrypt budget of 10', async () => {
    const first = await call('get_call', { id: ids.en });
    expect(first.json.transcript).toMatch(/^<transcript>\n/);
    expect(first.json.transcript).toContain('photovoltaic panels');
    expect(first.json.signature).toBe('signed by askcalls agent');
    expect(first.json.tags).toEqual([TAG_NAME]);
    expect(first.json.decrypt_budget_left).toBe(9);
    expect((await call('get_call', { id: 'no-such-call' })).isError).toBe(true);
    for (let i = 2; i <= 10; i++)
      expect((await call('get_call', { id: ids.he })).isError).toBe(false);
    const over = await call('get_call', { id: ids.en });
    expect(over.isError).toBe(true);
    expect(over.text).toMatch(/decrypt budget.*\(10 calls\).*decryptBudget/);
  });

  it('ingests a folder with a manifest, pairing and duplicates', async () => {
    const folder = join(dir, 'calls');
    await mkdir(folder);
    await writeFile(join(folder, 'one.txt'), 'Speaker: Calling about the Quokkaville franchise.');
    await writeFile(
      join(folder, 'two.vtt'),
      'WEBVTT\n\n00:00.000 --> 00:02.000\nThe Narwhalix order shipped.\n',
    );
    await writeFile(join(folder, 'again.txt'), ENGLISH_CALL.text);
    const manifest = join(dir, 'manifest.csv');
    await writeFile(
      manifest,
      'file,phone,started_at,direction,contact_name,tags\none.txt,0521234567,2026-07-01T10:00:00Z,in,,Batch\ntwo.vtt,,2026-07-02T10:00:00Z,out,,Batch\n',
    );
    const r = await call('ingest_batch', { folder_path: folder, manifest_path: manifest });
    expect(r.json.summary).toMatchObject({ total: 3, done: 2, duplicate: 1, failed: 0 });
    expect(r.json.files.find((f: { file: string }) => f.file === 'again.txt')).toMatchObject({
      status: 'duplicate',
      existing_call_id: ids.en,
    });
    const batch = await call('search_calls', { tags: ['Batch'] });
    expect(batch.json.results).toHaveLength(2);
    const quokka = await call('search_calls', { query: 'quokkaville', contact: '0521234567' });
    expect(quokka.json.results).toHaveLength(1);
  });

  it('ingests from the command line with a final summary and keeps no queue when done', async () => {
    const folder = join(dir, 'cli');
    await mkdir(folder);
    await writeFile(join(folder, 'a.txt'), 'The Brontosaurix invoice was approved.');
    await writeFile(join(folder, 'b.txt'), '');
    lines.length = 0;
    const { counts } = await runIngest(
      folder,
      { transcribe: 'never' },
      { ...deps, io: io(), tty: false },
    );
    expect(counts).toMatchObject({ total: 2, done: 1, failed: 1 });
    expect(lines).toContain('Imported 1, duplicates 0, failed 1 (of 2).');
    expect(lines).toContain('  1 with a transcript that cannot be read');
    expect(lines).toContain('  1 failed: transcript_unreadable');
    const queue = await readFile(join(dir, 'ingest-queue.json'), 'utf8');
    expect(queue).not.toContain('Brontosaurix');

    await writeFile(join(folder, 'b.txt'), 'Now the Stegosaurix quote has text.');
    lines.length = 0;
    const again = await runIngest(
      folder,
      { transcribe: 'never' },
      { ...deps, io: io(), tty: false },
    );
    expect(lines[0]).toMatch(/^Resuming/);
    expect(again.counts).toMatchObject({ total: 2, done: 2, failed: 0 });
    await expect(readFile(join(dir, 'ingest-queue.json'))).rejects.toThrow();
  });
});
