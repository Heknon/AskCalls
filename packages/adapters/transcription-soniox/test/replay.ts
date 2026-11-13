/**
 * Minimal fetch replay for provider tests (spec 13: recorded fixtures, no live keys).
 * Each recording answers one request that matches its method and URL; unmatched requests throw.
 */
export interface Recording {
  method: string;
  /** Exact URL, or a pattern matched against the full URL. */
  url: string | RegExp;
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}

export interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: BodyInit | null | undefined;
}

export function replay(recordings: Recording[]) {
  const pending = [...recordings];
  const calls: CapturedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, url, headers: new Headers(init?.headers), body: init?.body });
    const i = pending.findIndex(
      (r) =>
        r.method.toUpperCase() === method &&
        (typeof r.url === 'string' ? r.url === url.toString() : r.url.test(url.toString())),
    );
    if (i === -1)
      throw new Error(`replay: no recording for ${method} ${url.origin}${url.pathname}`);
    const [rec] = pending.splice(i, 1);
    const status = rec!.status ?? 200;
    const body = rec!.json === undefined || status === 204 ? null : JSON.stringify(rec!.json);
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', ...rec!.headers },
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, pending };
}

/** Reads a multipart field captured from a FormData body. */
export function formField(req: CapturedRequest, name: string): FormDataEntryValue | null {
  if (!(req.body instanceof FormData)) throw new Error('replay: body is not FormData');
  return req.body.get(name);
}
