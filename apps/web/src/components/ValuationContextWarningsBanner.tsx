import "./ValuationContextWarningsBanner.css";

export function ValuationContextWarningsBanner({
  warnings,
  className = "",
}: {
  warnings: readonly string[] | undefined;
  className?: string;
}) {
  if (!warnings?.length) return null;
  return (
    <div
      className={`vcw-banner${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="vcw-banner__title">Valuation notice</div>
      <ul className="vcw-banner__list">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
