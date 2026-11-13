import { Pencil } from 'lucide-react';
import type { ElementType } from 'react';
import { Button } from '../primitives/button';
import { ContactLabel } from './ContactLabel';
import { PhoneNumber } from './PhoneNumber';

export type ContactRowProps = {
  name: string;
  /** E.164 numbers saved under this name. */
  phones: string[];
  /** "12 calls · last today". */
  detail?: string;
  href: string;
  linkAs?: ElementType;
  onEdit: () => void;
  labels: { edit: string };
  /** Decrypting: placeholders instead of name and numbers. */
  locked?: boolean;
};

/** One saved contact name for one or more numbers. */
export function ContactRow({
  name,
  phones,
  detail,
  href,
  linkAs: Link = 'a',
  onEdit,
  labels,
  locked = false,
}: ContactRowProps) {
  return (
    <li
      data-component="ContactRow"
      className="relative flex items-center gap-3 border-border border-b px-4 py-3 last:border-b-0 hover:bg-accent/60"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {locked ? (
          <ContactLabel name={name} show="name" locked />
        ) : (
          <Link
            href={href}
            className="min-w-0 text-foreground no-underline after:absolute after:inset-0 after:content-['']"
          >
            <ContactLabel name={name} show="name" />
          </Link>
        )}
        {locked ? null : (
          <span className="flex flex-wrap gap-x-3 text-muted-foreground text-sm">
            {phones.map((p) => (
              <PhoneNumber key={p} e164={p} />
            ))}
          </span>
        )}
      </div>
      {detail ? (
        <span className="tabular text-muted-foreground text-sm max-sm:hidden">{detail}</span>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${labels.edit} ${name}`}
        onClick={onEdit}
        className="relative z-10"
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
