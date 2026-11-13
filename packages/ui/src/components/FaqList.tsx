import type { ReactNode } from 'react';

export type FaqListProps = {
  items: { key: string; question: string; answer: ReactNode }[];
  /** The item open on load. */
  open?: string;
};

/** Questions and answers on hairlines. Native `<details>`: keyboard and screen readers for free. */
export function FaqList({ items, open }: FaqListProps) {
  return (
    <div data-component="FaqList" className="faq">
      {items.map((it) => (
        <details key={it.key} open={it.key === open}>
          <summary>
            <span>{it.question}</span>
            <span className="pm" aria-hidden />
          </summary>
          <div className="ans-b">{it.answer}</div>
        </details>
      ))}
    </div>
  );
}
