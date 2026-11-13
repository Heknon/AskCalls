export type UseCaseCardProps = {
  /** What someone in this role types into search. User-language text: rendered `dir="auto"`. */
  query: string;
  /** "Sales follow-up". */
  role: string;
  /** What the search finds: "14 calls, by meaning". */
  result: string;
};

/**
 * One use case as the search someone in that role would type, set like a search field row.
 * Render inside a `<ul className="qs">`.
 */
export function UseCaseCard({ query, role, result }: UseCaseCardProps) {
  return (
    <li data-component="UseCaseCard">
      <div className="row">
        <svg
          className="ic"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="qt" dir="auto">
          {query}
        </span>
        <span className="role">
          <b>{role}</b>
          {result}
        </span>
      </div>
    </li>
  );
}
