import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

export type AppTopBarProps = {
  /** Shortcut hints on wide screens: "/ Search", "j k Move", "? All shortcuts". */
  hints?: { keys: string[]; label: string }[];
  /** Page actions at the end edge (Upload on Calls). */
  actions?: ReactNode;
  /** The start of the bar: a back link on the call view. */
  start?: ReactNode;
};

/**
 * The 56 px bar above a page's content from `md` up: page actions at the end, shortcut hints
 * before them on wide screens. Phones use `MobileTopBar`.
 */
export function AppTopBar({ hints, actions, start }: AppTopBarProps) {
  return (
    <div
      data-component="AppTopBar"
      className="sticky top-0 z-10 hidden h-(--header-height) items-center gap-3 border-border border-b bg-card px-6 md:flex"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{start}</div>
      {hints?.length ? (
        <ul
          aria-hidden
          className="m-0 hidden list-none items-center gap-4 p-0 text-muted-foreground text-xs xl:flex"
        >
          {hints.map((h) => (
            <li key={h.label} className="inline-flex items-center gap-1">
              {h.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
              <span className="ms-0.5">{h.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
