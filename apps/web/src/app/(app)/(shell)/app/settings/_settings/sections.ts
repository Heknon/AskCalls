/** Settings sections in order (screens.md S1–S8); each is /app/settings/<key>. */
export const SETTINGS_SECTIONS = [
  'security',
  'recordings',
  'retention',
  'api',
  'providers',
  'privacy',
  'audit',
  'data',
] as const;
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number];

export const sectionHref = (key: SettingsSectionKey) => `/app/settings/${key}`;
