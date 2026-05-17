import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/commandCenterUtils";
import { getProjStat } from "../../pages/command-center-utils/standings";
import { normalizeCatName } from "../../pages/command-center-utils/categories";
import { impactLabelParts } from "../../domain/rotoCategoryDisplay";
import { CategoryImpactCard } from "./CategoryImpactCard";

type ScoringCat = { name: string; type: "batting" | "pitching" };

interface AuctionCenterPlayerImpactProps {
  selectedPlayer: Player;
  statView: "hitting" | "pitching";
  onStatViewChange: (view: "hitting" | "pitching") => void;
  catImpactRows: AuctionCenterCategoryImpactRow[];
  pitchingCats: ScoringCat[];
  hittingCats: ScoringCat[];
}

function formatPlayerStatDisplay(
  raw: number,
  catKey: string,
  isRate: boolean,
): string {
  if (raw === 0) return "—";
  return isRate ? raw.toFixed(catKey === "AVG" || catKey === "OBP" || catKey === "SLG" ? 3 : 2) : String(Math.round(raw));
}

function playerStatForCategory(
  player: Player,
  cat: ScoringCat,
): string {
  const catKey = normalizeCatName(cat.name).trim().toUpperCase();
  const raw = getProjStat(player, cat.name, cat.type);
  const isRate =
    cat.type === "batting"
      ? ["AVG", "OBP", "SLG"].includes(catKey)
      : ["ERA", "WHIP", "WALKS + HITS PER IP", "W+H/IP"].some(
          (k) => catKey === k || catKey.includes(k),
        );
  return formatPlayerStatDisplay(raw, catKey, isRate);
}

function CategoryImpactGrid({
  cats,
  selectedPlayer,
  catImpactRows,
}: {
  cats: ScoringCat[];
  selectedPlayer: Player;
  catImpactRows: AuctionCenterCategoryImpactRow[];
}) {
  return (
    <div className="pac-impact-grid command-center-impact-grid">
      {cats.map((cat) => {
        const labels = impactLabelParts(cat.name);
        const imp = catImpactRows.find((r) => r.name === cat.name);
        return (
          <CategoryImpactCard
            key={cat.name}
            primaryLabel={labels.primary}
            secondaryLabel={labels.secondary ?? null}
            playerStat={playerStatForCategory(selectedPlayer, cat)}
            impact={imp}
          />
        );
      })}
    </div>
  );
}

function FixedFallbackGrid({
  items,
}: {
  items: readonly { catLabel: string; val: string }[];
}) {
  return (
    <div className="pac-impact-grid pac-impact-grid--fixed command-center-impact-grid">
      {items.map(({ catLabel, val }) => {
        const labels = impactLabelParts(catLabel);
        return (
          <CategoryImpactCard
            key={catLabel}
            primaryLabel={labels.primary}
            secondaryLabel={labels.secondary ?? null}
            playerStat={val}
          />
        );
      })}
    </div>
  );
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
        return ip > 0 ? ((sp.strikeouts / ip) * 9).toFixed(1) : "—";
      })()
    : "—";

  return (
    <div className="pac-impact-wrap">
      <div className="pac-snapshot-header cc-panel-controls">
        <span className="pac-section-label">CATEGORY IMPACT</span>
        <div className="stat-view-toggle" role="tablist" aria-label="Hitting or pitching categories">
          <button
            className={"svt-btn " + (statView === "hitting" ? "active" : "")}
            onClick={() => onStatViewChange("hitting")}
            type="button"
            role="tab"
            aria-selected={statView === "hitting"}
          >
            Hitting
          </button>
          <button
            className={"svt-btn " + (statView === "pitching" ? "active" : "")}
            onClick={() => onStatViewChange("pitching")}
            type="button"
            role="tab"
            aria-selected={statView === "pitching"}
          >
            Pitching
          </button>
        </div>
      </div>
      {statView === "pitching" ? (
        pitchingCats.length > 0 ? (
          <CategoryImpactGrid
            cats={pitchingCats}
            selectedPlayer={selectedPlayer}
            catImpactRows={catImpactRows}
          />
        ) : (
          <FixedFallbackGrid
            items={[
              { catLabel: "ERA", val: String(sp?.era ?? "—") },
              { catLabel: "K/9", val: k9 },
              { catLabel: "WHIP", val: String(sp?.whip ?? "—") },
              { catLabel: "Wins", val: String(sp?.wins ?? "—") },
              { catLabel: "Saves", val: String(sp?.saves ?? "—") },
            ]}
          />
        )
      ) : hittingCats.length > 0 ? (
        <CategoryImpactGrid
          cats={hittingCats}
          selectedPlayer={selectedPlayer}
          catImpactRows={catImpactRows}
        />
      ) : (
        <FixedFallbackGrid
          items={[
            { catLabel: "Batting Avg", val: String(sb?.avg ?? ".---") },
            { catLabel: "Home Runs", val: String(sb?.hr ?? "—") },
            { catLabel: "Runs Batted In", val: String(sb?.rbi ?? "—") },
            { catLabel: "Runs", val: String(sb?.runs ?? "—") },
            { catLabel: "Stolen Bases", val: String(sb?.sb ?? "—") },
          ]}
        />
      )}
    </div>
  );
}
