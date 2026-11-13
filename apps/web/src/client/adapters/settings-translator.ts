import type { ApiClient } from '@askcalls/api-contract';
import { getMe } from '@askcalls/api-contract/routes/account';
import type { Translator } from '@askcalls/client-core/ports/index';
import type { KeySession } from '@askcalls/client-core/session';
import type { UserDataStore } from '@askcalls/client-core/userdata';
import { type OwnLlmKey, ownKeyLlm } from './own-key-llm';

/**
 * Follows Settings → Providers on every call: translation (which languages, by the user's rules)
 * uses the "Ask about a call" provider. Managed goes through `/api/translate`; an own key goes
 * straight from this browser to the provider; with the LLM off nothing is translated. The
 * direct provider (which holds the decrypted key) is cached until the session locks.
 */
export class SettingsTranslator implements Translator {
  readonly id = 'settings';
  #direct: { fingerprint: string; translator: Promise<Translator> } | null = null;
  #managedOn: Promise<boolean> | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly userData: () => UserDataStore,
    private readonly managed: Translator,
    session: KeySession,
  ) {
    session.onWipe(() => {
      this.#direct = null;
      this.#managedOn = null;
    });
  }

  async enabled(): Promise<boolean> {
    const { llm } = await this.userData().get('providers');
    if (llm.mode === 'off') return false;
    if (llm.mode === 'own') return true;
    this.#managedOn ??= this.api.request(getMe, {}).then(
      (me) => me.features.translation.enabled,
      () => {
        this.#managedOn = null;
        return false;
      },
    );
    return this.#managedOn;
  }

  async translate(...args: Parameters<Translator['translate']>) {
    const { llm } = await this.userData().get('providers');
    if (llm.mode !== 'own') return this.managed.translate(...args);
    return (await this.#ownKey(llm.key)).translate(...args);
  }

  #ownKey(key: OwnLlmKey): Promise<Translator> {
    const fingerprint = JSON.stringify([key.provider, key.apiKey, key.baseUrl, key.model]);
    if (this.#direct?.fingerprint !== fingerprint) {
      const translator = ownKeyLlm(key).then(
        (llm): Translator => ({
          id: llm.id,
          async translate(segments, { source, target, signal }) {
            const out = await llm.translate({
              segments: [...segments],
              source,
              target,
              ...(signal && { signal }),
            });
            return { segments: out, provider: llm.id, model: llm.model };
          },
        }),
      );
      translator.catch(() => {
        if (this.#direct?.translator === translator) this.#direct = null;
      });
      this.#direct = { fingerprint, translator };
    }
    return this.#direct.translator;
  }
}
