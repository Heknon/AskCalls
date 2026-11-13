import type { ElementType } from 'react';
import { Logo } from './Logo';

export type MarketingFooterProps = {
  brand: string;
  /** One line under the logo. */
  tagline?: string;
  columns: { title: string; links: { href: string; label: string }[] }[];
  linkAs?: ElementType;
};

/** The legal and trust links at the foot of every marketing page. */
export function MarketingFooter({
  brand,
  tagline,
  columns,
  linkAs: Link = 'a',
}: MarketingFooterProps) {
  return (
    <footer data-component="MarketingFooter" className="border-border border-t py-12 text-sm">
      <div className="mx-auto grid max-w-280 grid-cols-2 gap-8 px-4 md:grid-cols-[2fr_repeat(3,1fr)] md:px-6">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <Logo name={brand} />
          {tagline ? <p className="text-muted-foreground">{tagline}</p> : null}
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <h4 className="mb-3 font-semibold">{c.title}</h4>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted-foreground no-underline hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
