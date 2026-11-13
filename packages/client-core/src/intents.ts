import {
  BUILT_IN_INTENTS,
  buildIntentPrototypes,
  type IntentDefinition,
  type IntentPrototype,
} from '@askcalls/indexing';
import type { Embedder } from './ports/index';
import type { KeySession } from './session';

/**
 * Intent prototypes (spec 7.10), embedded once per unlocked session from the built-ins and the
 * user's own intents. Rebuilt when the custom intents change; dropped on lock.
 */
export class IntentCache {
  #key: string | null = null;
  #prototypes: Promise<IntentPrototype[]> | null = null;

  constructor(
    private readonly embedder: Embedder,
    session: KeySession,
  ) {
    session.onWipe(() => {
      this.#key = null;
      this.#prototypes = null;
    });
  }

  get(custom: readonly IntentDefinition[]): Promise<IntentPrototype[]> {
    const key = JSON.stringify(custom);
    if (this.#prototypes && this.#key === key) return this.#prototypes;
    this.#key = key;
    const all = [
      ...BUILT_IN_INTENTS,
      ...custom.filter((c) => !BUILT_IN_INTENTS.some((b) => b.id === c.id)),
    ];
    this.#prototypes = buildIntentPrototypes(all, (texts) => this.embedder.embed(texts)).catch(
      (e) => {
        this.#prototypes = null;
        throw e;
      },
    );
    return this.#prototypes;
  }
}
