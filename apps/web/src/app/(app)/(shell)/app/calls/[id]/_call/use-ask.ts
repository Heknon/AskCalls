'use client';

import { ApiError } from '@askcalls/api-contract';
import { ask } from '@askcalls/api-contract/routes/providers';
import type { ClientContext } from '@askcalls/client-core/context';
import type { UserDataDocs } from '@askcalls/client-core/userdata';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** One call's ask conversation: streams each answer from AskCalls or the user's own provider. */
export function useAsk(
  ctx: ClientContext,
  /** The transcript as timed lines (`[00:00:48] Dana: …`), so answers can cite times. */
  transcriptText: string,
  route: AskRoute | null,
  quotaReached: boolean,
) {
  const [messages, setMessages] = useState<AskMessageState[]>([]);
  const [state, setState] = useState<AskState>(quotaReached ? 'quota' : 'idle');
  const abort = useRef<AbortController | null>(null);
  const lastQuestion = useRef<string | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (question: string) => {
      if (!route || route.kind === 'off') return;
      lastQuestion.current = question;
      const history = messages
        .filter((m) => !m.streaming && m.text)
        .slice(-MAX_HISTORY)
        .map((m) => ({
          role: m.kind === 'question' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));
      const qid = `q${Date.now()}`;
      const aid = `a${Date.now()}`;
      setMessages((list) => [
        ...list,
        { id: qid, kind: 'question', text: question },
        { id: aid, kind: 'answer', text: '', streaming: true },
      ]);
      setState('sending');
      const controller = new AbortController();
      abort.current = controller;
      try {
        const stream =
          route.kind === 'direct' && route.key
            ? askDirect(route.key, { question, transcriptText, history, signal: controller.signal })
            : ctx.api.stream(ask, { body: { question, transcriptText, history, consent: true } });
        let text = '';
        for await (const chunk of stream) {
          if (controller.signal.aborted) return;
          text += chunk;
          setState('idle');
          setMessages((list) => list.map((m) => (m.id === aid ? { ...m, text } : m)));
        }
        setMessages((list) => list.map((m) => (m.id === aid ? { ...m, streaming: false } : m)));
        setState('idle');
        ctx.session.touch();
      } catch (e) {
        if (controller.signal.aborted) return;
        setMessages((list) => list.filter((m) => m.id !== aid && m.id !== qid));
        const quota =
          e instanceof ApiError && e.code === 'rate_limited' && e.details.quota === 'asks';
        setState(quota ? 'quota' : 'error');
      }
    },
    [ctx, transcriptText, route, messages],
  );

  const retry = useCallback(() => {
    if (lastQuestion.current) void send(lastQuestion.current);
  }, [send]);

  return { messages, state, send, retry };
}
