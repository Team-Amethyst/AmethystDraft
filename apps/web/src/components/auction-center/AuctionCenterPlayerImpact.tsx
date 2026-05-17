import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
import { getProjStat } from "../../pages/command-center-utils/standings";
import { normalizeCatName } from "../../pages/command-center-utils/categories";
import { impactLabelParts } from "../../domain/rotoCategoryDisplay";

function rotoLineClass(roto: string | null | undefined): string {
  if (!roto) return "";
  return roto.startsWith("+0") ? " pac-impact-roto-line--zero" : "";
}

interface AuctionCenterPlayerImpactProps {
  selectedPlayer: Player;
  statView: "hitting" | "pitching";
  onStatViewChange: (view: "hitting" | "pitching") => void;
  catImpactRows: AuctionCenterCategoryImpactRow[];
  pitchingCats: { name: string; type: "batting" | "pitching" }[];
  hittingCats: { name: string; type: "batting" | "pitching" }[];
}

export function AuctionCenterPlayerImpact({
  selectedPlayer,
  statView,
  onStatViewChange,
  catImpactRows,
  pitchingCats,
  hittingCats,
}: AuctionCenterPlayerImpactProps) {
  const sp = selectedPlayer.stats?.pitching;
  const sb = selectedPlayer.stats?.batting;
  const k9 = sp
    ? (() => {
        const ip = parseFloat(sp.innings);
        return ip > 0 ? ((sp.strikeouts / ip) * 9).toFixed(1) : "--";
      })()
    : "--";

  return (
    <div className="pac-impact-wrap">
      <div className="pac-snapshot-header cc-panel-controls">
        <span className="pac-section-label">CATEGORY IMPACT</span>
        <div className="stat-view-toggle">
          <button
            className={"svt-btn " + (statView === "hitting" ? "active" : "")}
            onClick={() => onStatViewChange("hitting")}
            type="button"
          >
            Hitting
          </button>
          <button
            className={"svt-btn " + (statView === "pitching" ? "active" : "")}
            onClick={() => onStatViewChange("pitching")}
            type="button"
          >
            Pitching
          </button>
        </div>
      </div>
      {statView === "pitching" ? (
        pitchingCats.length > 0 ? (
          <div className="pac-impact-grid command-center-impact-grid">
            {pitchingCats.map((cat) => {
              const labels = impactLabelParts(cat.name);
              const catKey = normalizeCatName(cat.name).trim().toUpperCase();
              const raw = getProjStat(selectedPlayer, cat.name, "pitching");
              const isRate = ["ERA", "WHIP", "WALKS + HITS PER IP", "W+H/IP"].some(
                (k) => catKey === k || catKey.includes(k),
              );
              const display =
                raw === 0
                  ? "—"
                  : isRate
                    ? raw.toFixed(2)
                    : String(Math.round(raw));
              const imp = catImpactRows.find((r) => r.name === cat.name);
              const dTone = imp
                ? imp.neutral
                  ? "neutral"
                  : imp.improved
                    ? "green"
                    : "red"
                : "muted";
              return (
                <div
                  key={cat.name}
                  className="pac-impact-mini command-center-impact-card"
                >
                  <div className="pac-impact-mini-label">{labels.primary}</div>
                  {labels.secondary ? (
                    <div className="pac-impact-mini-label-sub">
                      {labels.secondary}
                    </div>
                  ) : null}
                  <div className="pac-impact-mini-stat">{display}</div>
                  <div className="pac-impact-team-move">
                    {imp?.teamMovementLine ?? "\u2014"}
                  </div>
                  {imp?.playerContributionStr ? (
                    <div
                      className="pac-impact-player-add"
                      title="Projected add from this player"
                    >
                      {imp.playerContributionStr}
                    </div>
                  ) : null}
                  <div
                    className={`pac-impact-mini-delta-pill pac-impact-mini-delta--${dTone}`}
                  >
                    {imp?.categoryEffectLabel ?? "\u2014"}
                  </div>
                  {imp?.rotoPtsLine != null ? (
                    <div
                      className={"pac-impact-roto-line" + rotoLineClass(imp.rotoPtsLine)}
                    >
                      {imp.rotoPtsLine}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pac-impact-grid pac-impact-grid--fixed command-center-impact-grid">
            {(
              [
                ["ERA", sp?.era ?? "—"],
                ["K/9", k9],
                ["WHIP", sp?.whip ?? "—"],
                ["Wins", sp?.wins ?? "—"],
                ["Saves", sp?.saves ?? "—"],
              ] as const
            ).map(([catLabel, val]) => {
              const labels = impactLabelParts(catLabel);
              return (
                <div
                  key={catLabel}
                  className="pac-impact-mini command-center-impact-card"
                >
                  <div className="pac-impact-mini-label">{labels.primary}</div>
                  {labels.secondary ? (
                    <div className="pac-impact-mini-label-sub">
                      {labels.secondary}
                    </div>
                  ) : null}
                  <div className="pac-impact-mini-stat">{val}</div>
                  <div className="pac-impact-mini-delta-pill pac-impact-mini-delta--muted">
                    —
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : hittingCats.length > 0 ? (
        <div className="pac-impact-grid command-center-impact-grid">
          {hittingCats.map((cat) => {
            const labels = impactLabelParts(cat.name);
            const catKey = normalizeCatName(cat.name).trim().toUpperCase();
            const raw = getProjStat(selectedPlayer, cat.name, "batting");
            const isRate = ["AVG", "OBP", "SLG"].includes(catKey);
            const display =
              raw === 0
                ? "—"
                : isRate
                  ? raw.toFixed(3)
                  : String(Math.round(raw));
            const imp = catImpactRows.find((r) => r.name === cat.name);
            const dTone = imp
              ? imp.neutral
                ? "neutral"
                : imp.improved
                  ? "green"
                  : "red"
              : "muted";
            return (
              <div
                key={cat.name}
                className="pac-impact-mini command-center-impact-card"
              >
                <div className="pac-impact-mini-label">{labels.primary}</div>
                {labels.secondary ? (
                  <div className="pac-impact-mini-label-sub">
                    {labels.secondary}
                  </div>
                ) : null}
                <div className="pac-impact-mini-stat">{display}</div>
                <div className="pac-impact-team-move">
                  {imp?.teamMovementLine ?? "\u2014"}
                </div>
                {imp?.playerContributionStr ? (
                  <div
                    className="pac-impact-player-add"
                    title="Projected add from this player"
                  >
                    {imp.playerContributionStr}
                  </div>
                ) : null}
                <div
                  className={`pac-impact-mini-delta-pill pac-impact-mini-delta--${dTone}`}
                >
                  {imp?.categoryEffectLabel ?? "\u2014"}
                </div>
                {imp?.rotoPtsLine != null ? (
                  <div
                    className={"pac-impact-roto-line" + rotoLineClass(imp.rotoPtsLine)}
                  >
                    {imp.rotoPtsLine}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pac-impact-grid pac-impact-grid--fixed command-center-impact-grid">
          {(
            [
              ["Batting Avg", sb?.avg ?? ".---"],
              ["Home Runs", sb?.hr ?? "—"],
              ["Runs Batted In", sb?.rbi ?? "—"],
              ["Runs", sb?.runs ?? "—"],
              ["Stolen Bases", sb?.sb ?? "—"],
            ] as const
          ).map(([catLabel, val]) => {
            const labels = impactLabelParts(catLabel);
            return (
              <div
                key={catLabel}
                className="pac-impact-mini command-center-impact-card"
              >
                <div className="pac-impact-mini-label">{labels.primary}</div>
                {labels.secondary ? (
                  <div className="pac-impact-mini-label-sub">
                    {labels.secondary}
                  </div>
                ) : null}
                <div className="pac-impact-mini-stat">{val}</div>
                <div className="pac-impact-mini-delta-pill pac-impact-mini-delta--muted">
                  —
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
