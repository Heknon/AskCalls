/** Requests the server accepts per window, by who is calling. */
export const RATE_LIMITS = {
  perUser: { limit: 600, windowMs: 60_000 },
  perToken: { limit: 300, windowMs: 60_000 },
  perIp: { limit: 60, windowMs: 60_000 },
} as const;

/** Share of the server's limit a client sends at most, leaving room for its other tabs. */
export const CLIENT_SHARE = 0.8;
