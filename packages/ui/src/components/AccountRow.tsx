import type { ElementType } from 'react';
import { Badge } from '../primitives/badge';
import { TableCell, TableRow } from '../primitives/table';

export type AccountRowProps = {
  href: string;
  /** The sign-in email, or a fallback such as "No email". */
  email: string;
  name: string | null;
  /** "Free", "Pro". */
  plan: string;
  /** "Admin" for admins; nothing for members. */
  admin?: string;
  /** "Custom limits" when an admin overrode at least one limit. */
  custom?: string;
  created: { label: string; iso: string };
  /** Formatted usage, one per column, in the order of the table header. */
  usage: string[];
  linkAs?: ElementType;
};

/** One account in the admin list: who it is, its plan and role, and its usage. Never content. */
export function AccountRow({
  href,
  email,
  name,
  plan,
  admin,
  custom,
  created,
  usage,
  linkAs: Link = 'a',
}: AccountRowProps) {
  return (
    <TableRow data-component="AccountRow" className="relative hover:bg-accent">
      <TableCell className="max-w-72">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={href}
            className="truncate font-medium text-foreground no-underline after:absolute after:inset-0 focus-visible:outline-offset-2"
          >
            <bdi dir="ltr">{email}</bdi>
          </Link>
          {name ? (
            <span dir="auto" className="truncate text-muted-foreground text-sm">
              {name}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap gap-1">
          <Badge variant="outline">{plan}</Badge>
          {admin ? <Badge variant="accent">{admin}</Badge> : null}
          {custom ? <Badge variant="warning">{custom}</Badge> : null}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <time dateTime={created.iso}>{created.label}</time>
      </TableCell>
      {usage.map((u, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns in header order
        <TableCell key={i} className="tabular whitespace-nowrap text-end">
          <bdi dir="ltr">{u}</bdi>
        </TableCell>
      ))}
    </TableRow>
  );
}
