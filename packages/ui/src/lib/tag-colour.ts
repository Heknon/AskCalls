export const TAG_COLOURS = [
  'gray',
  'blue',
  'violet',
  'rose',
  'amber',
  'green',
  'orange',
  'cyan',
] as const;

export type TagColour = (typeof TAG_COLOURS)[number];

/** Tint and text for a chip. Written out in full so Tailwind sees every class. */
export const tagChipClass: Record<TagColour, string> = {
  gray: 'bg-tag-gray text-tag-gray-foreground',
  blue: 'bg-tag-blue text-tag-blue-foreground',
  violet: 'bg-tag-violet text-tag-violet-foreground',
  rose: 'bg-tag-rose text-tag-rose-foreground',
  amber: 'bg-tag-amber text-tag-amber-foreground',
  green: 'bg-tag-green text-tag-green-foreground',
  orange: 'bg-tag-orange text-tag-orange-foreground',
  cyan: 'bg-tag-cyan text-tag-cyan-foreground',
};

export const tagDotClass: Record<TagColour, string> = {
  gray: 'bg-tag-gray-dot',
  blue: 'bg-tag-blue-dot',
  violet: 'bg-tag-violet-dot',
  rose: 'bg-tag-rose-dot',
  amber: 'bg-tag-amber-dot',
  green: 'bg-tag-green-dot',
  orange: 'bg-tag-orange-dot',
  cyan: 'bg-tag-cyan-dot',
};
