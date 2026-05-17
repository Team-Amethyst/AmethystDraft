import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
import {
  categoryImpactRotoAriaLabel,
  categoryImpactStatusTone,
  formatRotoPointsDelta,
} from "./categoryImpactDisplay";

export function CategoryImpactCard({
  primaryLabel,
  secondaryLabel,
  playerStat,
  impact,
}: {
  primaryLabel: string;
  secondaryLabel: string | null;
  playerStat: string;
  impact?: AuctionCenterCategoryImpactRow;
}) {
  const tone = categoryImpactStatusTone(impact);
  const rotoDelta = formatRotoPointsDelta(impact?.rotoPtsLine);
  const rotoAriaLabel = categoryImpactRotoAriaLabel(
    impact
      ? {
          categoryEffectLabel: impact.categoryEffectLabel,
          rotoPtsLine: impact.rotoPtsLine,
          name: impact.name,
        }
      : undefined,
  );

  return (
    <div className="pac-impact-mini command-center-impact-card">
      <div className="pac-impact-card__top">
        <div className="pac-impact-mini-label">{primaryLabel}</div>
        {secondaryLabel ? (
          <div className="pac-impact-mini-label-sub">{secondaryLabel}</div>
        ) : null}
      </div>
      <div className="pac-impact-card__center">
        <div className="pac-impact-mini-stat">{playerStat}</div>
      </div>
      <div className="pac-impact-team-move">
        {impact?.teamMovementLine ?? "—"}
      </div>
      <div
        className={
          "pac-impact-roto-footer" +
          (tone === "plain" ? "" : ` pac-impact-roto-footer--${tone}`)
        }
        aria-label={rotoAriaLabel}
      >
        {rotoDelta}
      </div>
    </div>
  );
}
