/** Waits between attempts of a presigned transfer. */
export const TRANSFER_BACKOFF_MS = [1_000, 3_000, 7_000] as const;

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Sends a request that is safe to repeat (a presigned PUT or GET) until it gets a response that
 * isn't transient: dropped connections, timeouts and storage 5xx are retried with backoff.
 */
export async function sendWithRetry(
  send: () => Promise<Response>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= TRANSFER_BACKOFF_MS.length;
    try {
      const res = await send();
      if (last || !TRANSIENT.has(res.status)) return res;
      await res.body?.cancel().catch(() => {});
    } catch (e) {
      if (last || (e as Error)?.name === 'AbortError') throw e;
    }
    await sleep(TRANSFER_BACKOFF_MS[attempt]!);
  }
}
