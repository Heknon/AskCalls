import type { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const GUARD: unique symbol;
export declare function isLoopbackAddress(address: string | undefined): boolean;
export declare function isAllowedHost(host: string | undefined, port: number): boolean;
export declare function guarded(
  handle: (req: IncomingMessage, res: ServerResponse) => unknown,
  port: number,
  storage: AsyncLocalStorage<{ loopback: true }>,
): (req: IncomingMessage, res: ServerResponse) => void;
