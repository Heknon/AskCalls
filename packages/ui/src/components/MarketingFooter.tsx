import type { ElementType } from 'react';
import { Logo } from './Logo';

export type MarketingFooterProps = {
  brand: string;
  /** The licence and copyright lines under the wordmark. */
  fine: string[];
  columns: { title: string; links: { href: string; label: string }[] }[];
  linkAs?: ElementType;
};

/** The product, trust and legal links on hairlines at the foot of every marketing page. */
export function MarketingFooter({
  brand,
  fine,
  columns,
  linkAs: Link = 'a',
}: MarketingFooterProps) {
  return (
    <footer data-component="MarketingFooter" className="foot">
      <div className="wrap">
        <div>
          <Logo name={brand} variant="bare" size="sm" />
          <p className="fine">
            {fine.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2>{c.title}</h2>
            <ul>
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
