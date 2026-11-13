import { cn } from '../lib/cn';

export type StepListProps = {
  steps: { key: string; title: string; note: string }[];
  /** `display`: the home page's three lines at chapter size. `compact`: reading pages. */
  size?: 'display' | 'compact';
};

/** A numbered sequence of how something works, as lines of type on hairlines. */
export function StepList({ steps, size = 'display' }: StepListProps) {
  return (
    <ol data-component="StepList" className={cn('lines', size === 'compact' && 'compact')}>
      {steps.map((s, i) => (
        <li key={s.key}>
          <span className="n" aria-hidden>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="t">{s.title}</span>
          <span className="a">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}
