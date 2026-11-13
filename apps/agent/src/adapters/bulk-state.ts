import { readFile, rm } from 'node:fs/promises';
import type { BulkState, BulkStateStore } from '@askcalls/client-core';
import { writePrivateFile } from '../config';

/** The agent's bulk queue state (spec 8): file paths and statuses only, never content. */
export class JsonFileBulkStateStore implements BulkStateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<BulkState | null> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as BulkState;
    } catch {
      return null;
    }
  }

  async save(state: BulkState): Promise<void> {
    await writePrivateFile(this.path, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
