export type LimitsTableProps = {
  /** Names the list: "Free beta limits". */
  label: string;
  /** "500" + "calls", "300 min" + "transcription a month". */
  limits: { key: string; value: string; label: string }[];
};

/** The free-tier limits. */
export function LimitsTable({ label, limits }: LimitsTableProps) {
  return (
    <dl
      data-component="LimitsTable"
      aria-label={label}
      className="m-0 grid grid-cols-2 gap-4 md:grid-cols-5"
    >
      {limits.map((l) => (
        <div
          key={l.key}
          className="flex flex-col-reverse rounded-lg border border-border bg-card p-5"
        >
          <dt className="text-muted-foreground text-sm">{l.label}</dt>
          <dd className="m-0 font-semibold text-2xl tabular tracking-tight">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}
