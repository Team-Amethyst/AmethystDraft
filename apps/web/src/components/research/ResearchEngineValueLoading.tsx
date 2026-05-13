import { Loader2 } from "lucide-react";
import "./ResearchEngineValueLoading.css";

/** Inline spinner for Research table / player modal while Engine board valuation is loading. */
export function ResearchEngineValueLoading({
  label = "Loading Engine valuation",
}: {
  label?: string;
}) {
  return (
    <span className="rev-engine-val-loading" aria-busy="true" aria-label={label}>
      <Loader2 className="rev-engine-val-loading__icon" size={18} strokeWidth={2.25} />
    </span>
  );
}
