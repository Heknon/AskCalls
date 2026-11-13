import type { LimitField } from '@askcalls/domain';

export const GB = 1024 ** 3;

type Unit = 'calls' | 'min' | 'gb' | 'tokens' | 'fetches' | 'asks' | 'chars';

/** How each limit is edited: the unit shown and how many stored units one shown unit is. */
export const LIMIT_UNITS: Record<LimitField, { unit: Unit; scale: number }> = {
  maxCalls: { unit: 'calls', scale: 1 },
  transcriptionMinutesPerMonth: { unit: 'min', scale: 1 },
  recordingBytes: { unit: 'gb', scale: GB },
  maxApiTokens: { unit: 'tokens', scale: 1 },
  mcpFetchesPerTokenPerHour: { unit: 'fetches', scale: 1 },
  asksPerDay: { unit: 'asks', scale: 1 },
  translationCharsPerMonth: { unit: 'chars', scale: 1 },
};

/** The stored value as typed in the field: GB keep up to two decimals. */
export function toField(field: LimitField, value: number | undefined): string {
  if (value === undefined) return '';
  const { scale } = LIMIT_UNITS[field];
  return String(scale === 1 ? value : Math.round((value / scale) * 100) / 100);
}

/** `null` for an empty field (use the instance limit), `undefined` when the text is invalid. */
export function fromField(field: LimitField, text: string): number | null | undefined {
  const s = text.trim();
  if (s === '') return null;
  const { scale } = LIMIT_UNITS[field];
  const ok = scale === 1 ? /^\d{1,15}$/.test(s) : /^\d{1,7}(\.\d{1,2})?$/.test(s);
  return ok ? Math.round(Number(s) * scale) : undefined;
}
