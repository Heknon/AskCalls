import { isInteractive, openBrowser, readLine } from './terminal';

/** What commands print and ask; tests pass their own. */
export interface Io {
  out(line: string): void;
  err(line: string): void;
  openBrowser(url: string): Promise<boolean>;
  readLine(prompt: string, signal?: AbortSignal): Promise<string | null>;
  interactive: boolean;
}

export const terminalIo = (): Io => ({
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  openBrowser,
  readLine,
  interactive: isInteractive(),
});
