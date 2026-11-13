/** A file or snippet from the README, verbatim. Always LTR. */
export function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="term" dir="ltr">
      <div className="bar">{title}</div>
      <pre>{children}</pre>
    </div>
  );
}
