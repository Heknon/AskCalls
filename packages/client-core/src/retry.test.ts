import { describe, expect, it } from 'vitest';
import { sendWithRetry } from './retry';

const noWait = async () => {};

describe('sendWithRetry', () => {
  it('retries dropped connections and storage errors, then returns the response', async () => {
    let n = 0;
    const res = await sendWithRetry(async () => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return new Response('', { status: 503 });
      return new Response('', { status: 200 });
    }, noWait);
    expect(res.status).toBe(200);
    expect(n).toBe(3);
  });

  it('returns a final error response after the last attempt', async () => {
    let n = 0;
    const res = await sendWithRetry(async () => {
      n++;
      return new Response('', { status: 500 });
    }, noWait);
    expect(res.status).toBe(500);
    expect(n).toBe(4);
  });

  it('does not retry a refusal or an abort', async () => {
    let n = 0;
    const res = await sendWithRetry(async () => {
      n++;
      return new Response('', { status: 403 });
    }, noWait);
    expect(res.status).toBe(403);
    expect(n).toBe(1);
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(
      sendWithRetry(async () => {
        throw abort;
      }, noWait),
    ).rejects.toBe(abort);
  });
});
