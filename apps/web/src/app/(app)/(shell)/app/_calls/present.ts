import type { ResolvedTag } from '@askcalls/client-core/tags';
import type { Contact } from '@askcalls/client-core/userdata';
import type { CallDirection, CallMeta } from '@askcalls/domain';
import type { CallDirectionValue } from '@askcalls/ui/components/CallDirection';
import type { TagChipProps } from '@askcalls/ui/components/TagChip';
import { TAG_COLOURS, type TagColour } from '@askcalls/ui/lib/tag-colour';

export const DIRECTION: Record<CallDirection, CallDirectionValue> = {
  in: 'incoming',
  out: 'outgoing',
  unknown: 'unknown',
};

/** A tag's stored colour, or a stable one picked from its id. */
export function tagColour(id: string, color: string | null): TagColour {
  if (color && (TAG_COLOURS as readonly string[]).includes(color)) return color as TagColour;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TAG_COLOURS[Math.abs(h) % TAG_COLOURS.length]!;
}

export type IntentLabel = (intentId: string) => string;

/** The chips of a call: catalog tags, then intents; the star is its own control. */
export function tagChips(
  tags: readonly ResolvedTag[],
  intentLabel: IntentLabel,
): (TagChipProps & { id: string })[] {
  const out: (TagChipProps & { id: string })[] = [];
  for (const t of tags) {
    if (t.kind === 'tag')
      out.push({ id: t.id, name: t.tag.name, colour: tagColour(t.id, t.tag.color) });
  }
  for (const t of tags) {
    if (t.kind === 'intent') {
      out.push({ id: t.id, name: intentLabel(t.intentId), colour: 'gray', source: 'intent' });
    }
  }
  return out;
}

/** The name a call shows: its own contact name, else the contact list's name for the number. */
export function contactName(
  meta: Pick<CallMeta, 'contactName' | 'phoneE164'>,
  contacts: readonly Contact[],
): string | undefined {
  if (meta.contactName) return meta.contactName;
  const phone = meta.phoneE164;
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  return contacts.find((c) => c.phones.some((p) => p.replace(/\D/g, '').endsWith(digits.slice(-9))))
    ?.name;
}

/** `https://wa.me/<digits>` for an E.164 number. */
export const whatsappHref = (phone: string | null | undefined) =>
  phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : undefined;

export function downloadText(file: { fileName: string; mimeType: string; content: string }) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
