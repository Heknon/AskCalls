export type LimitsTableProps = {
  /** Names the list: "Free beta limits". */
  label: string;
  /** `value` "2" + `unit` "GB" + `label` "of recording backups"; `detail` for the sheet. */
  limits: { key: string; value: string; unit?: string; label: string; detail?: string }[];
  /** `teaser`: five numerals on one rule (home). `sheet`: the pricing page, with details. */
  variant?: 'teaser' | 'sheet';
};

/** The free-tier limits as big numerals on hairlines. */
export function LimitsTable({ label, limits, variant = 'teaser' }: LimitsTableProps) {
  const value = (l: LimitsTableProps['limits'][number]) => (
    <>
      {l.value}
      {l.unit ? <small>{l.unit}</small> : null}
    </>
  );
  if (variant === 'sheet') {
    return (
      <dl data-component="LimitsTable" aria-label={label} className="sheet">
        {limits.map((l) => (
          <div key={l.key}>
            <dt>{l.label}</dt>
            <dd className="v">{value(l)}</dd>
            {l.detail ? <dd className="d">{l.detail}</dd> : null}
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl data-component="LimitsTable" aria-label={label} className="nums">
      {limits.map((l) => (
        <div key={l.key}>
          <dt>{l.label}</dt>
          <dd>{value(l)}</dd>
        </div>
      ))}
    </dl>
  );
}
