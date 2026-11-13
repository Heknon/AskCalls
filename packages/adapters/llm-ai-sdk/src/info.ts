import type { ProviderInfo } from '@askcalls/domain';

/** One entry per `LLM_PROVIDER_IDS`, default model first (`DEFAULT_MODELS`). */
export const LLM_PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    // Needs the `anthropic-dangerous-direct-browser-access` header from a browser.
    browserDirect: true,
    baseUrl: 'fixed',
    keyRequired: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }],
    browserDirect: true,
    baseUrl: 'fixed',
    keyRequired: true,
  },
  {
    id: 'google',
    name: 'Google',
    models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
    browserDirect: true,
    baseUrl: 'fixed',
    keyRequired: true,
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    models: [],
    browserDirect: true,
    baseUrl: 'required',
    keyRequired: false,
  },
];
