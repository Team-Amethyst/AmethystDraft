import type { ReactNode } from "react";

export function AuctionMetricTile({
  label,
  value,
  delta,
  variant = "default",
  title,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  variant?: "default" | "primary";
  title?: string;
}) {
  return (
    <div
      className={
        "bdc-metric-tile" +
        (variant === "primary" ? " bdc-metric-tile--primary" : "")
      }
      title={title}
    >
      <span className="bdc-metric-tile-label">{label}</span>
      <div className="bdc-metric-tile-value">{value}</div>
      {delta != null ? (
        <div className="bdc-metric-tile-delta">{delta}</div>
      ) : null}
    </div>
  );
}
