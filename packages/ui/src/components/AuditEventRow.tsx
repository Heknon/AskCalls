import { TableCell, TableRow } from '../primitives/table';

export type AuditEventRowProps = {
  /** When, formatted ("Today, 14:32") and as ISO for `<time>`. */
  at: { label: string; iso: string };
  /** Who: a device or token label ("Chrome on MacBook Air", "token claude-desktop"). */
  actor: string;
  /** What: "Read call", "Deleted call", "Signed in". */
  action: string;
  /** The call's id prefix, for support; never content. */
  callRef?: string;
};

/** One audit log entry. Ids, actors and actions only. */
export function AuditEventRow({ at, actor, action, callRef }: AuditEventRowProps) {
  return (
    <TableRow data-component="AuditEventRow">
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <time dateTime={at.iso}>{at.label}</time>
      </TableCell>
      <TableCell>
        <bdi dir="auto">{actor}</bdi>
      </TableCell>
      <TableCell>{action}</TableCell>
      <TableCell>
        {callRef ? (
          <bdi dir="ltr" className="ltr-island font-mono text-muted-foreground">
            {callRef}
          </bdi>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
