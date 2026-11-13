'use client';

import { ApiError } from '@askcalls/api-contract';
import { ask } from '@askcalls/api-contract/routes/providers';
import type { ClientContext } from '@askcalls/client-core/context';
import type { UserDataDocs } from '@askcalls/client-core/userdata';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ownKeyLlm } from '../../../../../../../client/adapters/own-key-llm';
import type { Me } from '../../../../../../../client/session/session';

type OwnKey = Extract<UserDataDocs['providers']['llm'], { mode: 'own' }>['key'];

export type AskRoute =
  | { kind: 'off' }
  | { kind: 'managed' | 'direct'; provider: string; model: string; key?: OwnKey };

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  mock: 'Mock',
};

/** The provider as people know it; an OpenAI-compatible server by its host. */
export function providerName(route: Exclude<AskRoute, { kind: 'off' }>): string {
  if (route.provider === 'openai-compatible' && route.key?.baseUrl) {
    try {
      return new URL(route.key.baseUrl).host;
    } catch {
      return route.provider;
    }
  }
  return PROVIDER_NAMES[route.provider] ?? route.provider;
}

export const consentKeyOf = (route: AskRoute) =>
  route.kind === 'off' ? 'off' : `${route.kind}:${route.provider}:${route.model}`;

/** Settings → Providers decides: off, own key (straight from this browser) or managed. */
export function useAskRoute(ctx: ClientContext, me: Me): AskRoute | null {
  const [route, setRoute] = useState<AskRoute | null>(null);
  useEffect(() => {
    let stale = false;
    ctx.userData.get('providers').then(
      (p) => {
        if (stale) return;
        const llm = p.llm;
        if (llm.mode === 'off') return setRoute({ kind: 'off' });
        if (llm.mode === 'own') {
          const key = llm.key;
          // The adapter's default model, so the consent names what will answer.
          import('@askcalls/adapter-llm-ai-sdk').then(
            ({ DEFAULT_MODELS }) =>
              !stale &&
              setRoute({
                kind: 'direct',
                provider: key.provider,
                model:
                  key.model ??
                  DEFAULT_MODELS[key.provider as keyof typeof DEFAULT_MODELS] ??
                  key.provider,
                key,
              }),
            () => !stale && setRoute({ kind: 'off' }),
          );
          return;
        }
        const f = me.features.llm;
        setRoute(
          f.enabled
            ? { kind: 'managed', provider: f.provider ?? '', model: f.model ?? '' }
            : { kind: 'off' },
        );
      },
      () => !stale && setRoute({ kind: 'off' }),
    );
    return () => {
      stale = true;
    };
  }, [ctx, me]);
  return route;
}

export type AskMessageState = {
  id: string;
  kind: 'question' | 'answer';
  text: string;
  streaming?: boolean;
};

export type AskState = 'idle' | 'sending' | 'error' | 'quota';

const MAX_HISTORY = 20;

async function* askDirect(
  key: OwnKey,
  req: {
    question: string;
    transcriptText: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    signal: AbortSignal;
  },
): AsyncIterable<string> {
  yield* (await ownKeyLlm(key)).ask(req);
}

type Conversation = {
  messages: AskMessageState[];
  state: AskState;
  lastQuestion: string | null;
  abort: AbortController | null;
};

/**
 * Ask conversations by call id, kept while the session stays unlocked so closing the panel
 * (the phone sheet unmounts it) neither erases one nor stops an answer. Memory only: a lock
 * aborts every answer and drops them all.
 */
class AskStore {
  readonly #byCall = new Map<string, Conversation>();
  readonly #listeners = new Set<() => void>();

  get(callId: string): Conversation | undefined {
    return this.#byCall.get(callId);
  }

  update(callId: string, initial: AskState, change: (c: Conversation) => Partial<Conversation>) {
    const c = this.#byCall.get(callId) ?? {
      messages: [],
      state: initial,
      lastQuestion: null,
      abort: null,
    };
    this.#byCall.set(callId, { ...c, ...change(c) });
    for (const l of this.#listeners) l();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  clear() {
    for (const c of this.#byCall.values()) c.abort?.abort();
    this.#byCall.clear();
    for (const l of this.#listeners) l();
  }
}

const stores = new WeakMap<ClientContext['session'], AskStore>();

function storeOf(session: ClientContext['session']): AskStore {
  let store = stores.get(session);
  if (!store) {
    const created = new AskStore();
    session.onWipe(() => created.clear());
    stores.set(session, created);
    store = created;
  }
  return store;
}

/** One call's ask conversation: streams each answer from AskCalls or the user's own provider. */
export function useAsk(
  ctx: ClientContext,
  callId: string,
  /** The transcript as timed lines (`[00:00:48] Dana: …`), so answers can cite times. */
  transcriptText: string,
  route: AskRoute | null,
  quotaReached: boolean,
) {
  const store = storeOf(ctx.session);
  const initial: AskState = quotaReached ? 'quota' : 'idle';
  const conversation = useSyncExternalStore(
    store.subscribe,
    () => store.get(callId),
    () => undefined,
  );
  const messages = conversation?.messages ?? EMPTY;
  const state = conversation?.state ?? initial;

  const send = useCallback(
    async (question: string) => {
      if (!route || route.kind === 'off') return;
      const update = (change: (c: Conversation) => Partial<Conversation>) =>
        store.update(callId, initial, change);
      const history = (store.get(callId)?.messages ?? [])
        .filter((m) => !m.streaming && m.text)
        .slice(-MAX_HISTORY)
        .map((m) => ({
          role: m.kind === 'question' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));
      const qid = `q${Date.now()}`;
      const aid = `a${Date.now()}`;
      const controller = new AbortController();
      update((c) => ({
        messages: [
          ...c.messages,
          { id: qid, kind: 'question', text: question },
          { id: aid, kind: 'answer', text: '', streaming: true },
        ],
        state: 'sending',
        lastQuestion: question,
        abort: controller,
      }));
      const answer = (change: Partial<AskMessageState>) =>
        update((c) => ({
          messages: c.messages.map((m) => (m.id === aid ? { ...m, ...change } : m)),
        }));
      try {
        const stream =
          route.kind === 'direct' && route.key
            ? askDirect(route.key, { question, transcriptText, history, signal: controller.signal })
            : ctx.api.stream(ask, { body: { question, transcriptText, history, consent: true } });
        let text = '';
        for await (const chunk of stream) {
          if (controller.signal.aborted) return;
          text += chunk;
          update(() => ({ state: 'idle' }));
          answer({ text });
        }
        if (controller.signal.aborted) return;
        answer({ streaming: false });
        update(() => ({ state: 'idle', abort: null }));
        ctx.session.touch();
      } catch (e) {
        if (controller.signal.aborted) return;
        const quota =
          e instanceof ApiError && e.code === 'rate_limited' && e.details.quota === 'asks';
        update((c) => ({
          messages: c.messages.filter((m) => m.id !== aid && m.id !== qid),
          state: quota ? 'quota' : 'error',
          abort: null,
        }));
      }
    },
    [ctx, store, callId, initial, transcriptText, route],
  );

  const retry = useCallback(() => {
    const question = store.get(callId)?.lastQuestion;
    if (question) void send(question);
  }, [store, callId, send]);

  return { messages, state, send, retry };
}

const EMPTY: AskMessageState[] = [];
