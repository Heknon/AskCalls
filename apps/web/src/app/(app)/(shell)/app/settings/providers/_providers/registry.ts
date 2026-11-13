import { LLM_PROVIDERS } from '@askcalls/adapter-llm-ai-sdk/info';
import { DEEPGRAM_INFO } from '@askcalls/adapter-transcription-deepgram/info';
import { ELEVENLABS_INFO } from '@askcalls/adapter-transcription-elevenlabs/info';
import { OPENAI_TRANSCRIPTION_INFO } from '@askcalls/adapter-transcription-openai/info';
import { OPENAI_COMPATIBLE_TRANSCRIPTION_INFO } from '@askcalls/adapter-transcription-openai-compatible/info';
import { SONIOX_INFO } from '@askcalls/adapter-transcription-soniox/info';
import type { ProviderInfo } from '@askcalls/domain';

/**
 * Own-key options per capability, from each adapter's `info` module (no SDK is loaded). An
 * adapter added here appears as a provider option with its models; the card needs no change.
 */
export const OWN_KEY_PROVIDERS = {
  transcription: [
    ELEVENLABS_INFO,
    OPENAI_TRANSCRIPTION_INFO,
    DEEPGRAM_INFO,
    SONIOX_INFO,
    OPENAI_COMPATIBLE_TRANSCRIPTION_INFO,
  ],
  llm: LLM_PROVIDERS,
} as const satisfies Record<string, readonly ProviderInfo[]>;

export type KeyCapability = keyof typeof OWN_KEY_PROVIDERS;

const ALL: readonly ProviderInfo[] = [...OWN_KEY_PROVIDERS.transcription, ...OWN_KEY_PROVIDERS.llm];

export function providerInfo(cap: KeyCapability, id: string): ProviderInfo | undefined {
  return OWN_KEY_PROVIDERS[cap].find((p) => p.id === id);
}

/** "ElevenLabs" for an id the instance or the user chose; the id itself when unknown. */
export function providerName(id: string | null): string {
  if (!id) return '';
  return ALL.find((p) => p.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** The model's display name, or its id. */
export function modelName(info: ProviderInfo | undefined, model: string | null): string {
  if (!model) return info?.models[0]?.name ?? '';
  return info?.models.find((m) => m.id === model)?.name ?? model;
}
