import {
  battingStatColumnLabels,
  pitchingStatColumnLabels,
} from "./playerTableColumns";

export type ResearchTableStatView = "all" | "hitting" | "pitching";

export type ScoringCategoryRef = { name: string; type: string };

export function researchPlayerTableStatLayout(
  scoringCategories: ScoringCategoryRef[] | undefined,
  statView: ResearchTableStatView = "all",
) {
  const batCols = battingStatColumnLabels(scoringCategories);
  const pitCols = pitchingStatColumnLabels(scoringCategories);
  const numStatCols = Math.max(batCols.length, pitCols.length);
  const focusedCols =
    statView === "hitting" ? batCols : statView === "pitching" ? pitCols : null;
  const focusedType: "batting" | "pitching" | null =
    statView === "hitting"
      ? "batting"
      : statView === "pitching"
        ? "pitching"
        : null;
  const statHeaders = focusedCols
    ? focusedCols
    : Array.from({ length: numStatCols }, (_, i) => {
        const b = batCols[i];
        const p = pitCols[i];
        return b && p ? `${b}/${p}` : (b ?? p ?? "");
      });

  return {
    batCols,
    pitCols,
    numStatCols,
    focusedCols,
    focusedType,
    statHeaders,
    numActiveStatCols: focusedCols ? focusedCols.length : numStatCols,
  };
}

const RESEARCH_TABLE_EMPTY_MARKERS = new Set(["", "-", "—"]);

/** Omit placeholder dashes in Research table cells when a value is missing. */
export function researchTableNumericCell(
  value: number | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export function researchTableTextCell(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (RESEARCH_TABLE_EMPTY_MARKERS.has(trimmed)) return null;
  return raw;
}

export function researchPlayerTableColSpan(args: {
  showMarketAdp: boolean;
  showAuctionRank: boolean;
  numActiveStatCols: number;
}): number {
  return (
    5 +
    (args.showMarketAdp ? 1 : 0) +
    (args.showAuctionRank ? 1 : 0) +
    1 +
    args.numActiveStatCols +
    1
  );
}
