import { cn } from '../lib/cn';
import { Badge } from '../primitives/badge';

export type RuleListItemProps = {
  /** The rule's name, or "New rule" while it has none. */
  name: string;
  /** One line of what it does: "invoice, bill → tag Billing, star". */
  summary: string;
  /** Off rules don't run at import; the badge says so ("Off"). */
  enabled: boolean;
  offLabel: string;
  /** The rule open in the builder. */
  selected?: boolean;
  onSelect: () => void;
};

/** One rule in the rule list beside the `RuleBuilder`: its name, what it does and whether it is on. */
export function RuleListItem({
  name,
  summary,
  enabled,
  offLabel,
  selected = false,
  onSelect,
}: RuleListItemProps) {
  return (
    <li data-component="RuleListItem" className="list-none">
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        className={cn(
          'flex w-full cursor-pointer flex-col gap-1 rounded-md px-4 py-3 text-start transition-colors duration-(--duration-fast) hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          selected && 'bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle',
        )}
      >
        <span className="flex items-center gap-2">
          <span dir="auto" className="min-w-0 truncate font-semibold">
            {name}
          </span>
          {enabled ? null : <Badge>{offLabel}</Badge>}
        </span>
        <span
          dir="auto"
          className={cn('line-clamp-2 text-sm', selected ? undefined : 'text-muted-foreground')}
        >
          {summary}
        </span>
      </button>
    </li>
  );
}
