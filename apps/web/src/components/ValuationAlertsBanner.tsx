import type { ValuationUiAlert, ValuationUiAlertSeverity } from "../domain/valuationAlerts";
import "./ValuationAlertsBanner.css";

function severityClass(sev: ValuationUiAlertSeverity): string {
  if (sev === "critical") return "vab--critical";
  if (sev === "warning") return "vab--warning";
  return "vab--info";
}

function AlertRow({ alert }: { alert: ValuationUiAlert }) {
  return (
    <div className="vab__item">
      <div className="vab__row-title">{alert.title}</div>
      <div className="vab__row-msg">{alert.message}</div>
    </div>
  );
}

/**
 * Compact valuation notices from the latest Engine response (normalized upstream).
 */
export function ValuationAlertsBanner({
  alerts,
  className = "",
}: {
  alerts: readonly ValuationUiAlert[];
  className?: string;
}) {
  if (!alerts.length) return null;

  const peak: ValuationUiAlertSeverity = alerts.some(
    (a) => a.severity === "critical",
  )
    ? "critical"
    : alerts.some((a) => a.severity === "warning")
      ? "warning"
      : "info";

  const outer = `vab ${severityClass(peak)}${className ? ` ${className}` : ""}`;

  if (alerts.length === 1) {
    const a = alerts[0]!;
    return (
      <div className={outer} role="status" aria-live="polite">
        <div className="vab__single">
          <div className="vab__row-title">{a.title}</div>
          <div className="vab__row-msg">{a.message}</div>
        </div>
      </div>
    );
  }

  return (
    <details className={outer} role="group">
      <summary className="vab__summary">
        {alerts.length} valuation alerts
      </summary>
      <div className="vab__list">
        {alerts.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </div>
    </details>
  );
}
