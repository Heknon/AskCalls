export const GROUPS = [
  { key: 'frame', title: 'App frame' },
  { key: 'list', title: 'Call identity and list' },
  { key: 'search', title: 'Search and filters' },
  { key: 'call', title: 'Call view' },
  { key: 'trust', title: 'Trust, keys and devices' },
  { key: 'upload', title: 'Upload and jobs' },
  { key: 'organise', title: 'Organising' },
  { key: 'settings', title: 'Settings, providers and admin' },
  { key: 'feedback', title: 'Feedback' },
  { key: 'marketing', title: 'Marketing' },
  { key: 'primitives', title: 'Primitives' },
] as const;

export type GroupKey = (typeof GROUPS)[number]['key'];
