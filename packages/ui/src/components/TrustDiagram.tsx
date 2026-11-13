import type { ReactNode } from 'react';

export type TrustDiagramItem = {
  /** The field: `transcript` on the device side, the column name (`transcriptCt`) on the server. */
  field: string;
  value: ReactNode;
};

export type TrustDiagramProps = {
  /** "The same call on your device and on our server". */
  label: string;
  /** The line between the zones: "Encrypted here". */
  boundary: string;
  device: { title: string; items: TrustDiagramItem[] };
  server: { title: string; items: TrustDiagramItem[] };
};

/**
 * The whole privacy model in one figure: the same call readable on the device, and as the
 * server really stores it, split by the one line where encryption happens. Server values are
 * bytes and integers: always LTR. On phones the line turns horizontal and the zones stack.
 */
export function TrustDiagram({ label, boundary, device, server }: TrustDiagramProps) {
  return (
    <figure data-component="TrustDiagram" className="dia" aria-label={label}>
      <div className="side dev">
        <p className="lab">{device.title}</p>
        {device.items.map((it) => (
          <div key={it.field} className="item">
            <span className="k">{it.field}</span>
            <span className="v" dir="auto">
              {it.value}
            </span>
          </div>
        ))}
      </div>
      <div className="line" aria-hidden>
        <span>{boundary}</span>
      </div>
      <div className="side srv">
        <p className="lab">{server.title}</p>
        {server.items.map((it) => (
          <div key={it.field} className="item">
            <span className="k">{it.field}</span>
            <span className="v">{it.value}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
