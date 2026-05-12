/**
 * Maps league scoring category names to compact primary (and optional secondary) labels
 * for Command Center / Auction Center impact tiles. Heuristics are documented in
 * `docs/business-heuristics.md`.
 */
export function impactLabelParts(catName: string): {
  primary: string;
  secondary?: string;
} {
  const shortFromParen = catName.match(/\(([^)]+)\)$/)?.[1];
  const fullByAbbrev: Record<string, string> = {
    W: "Wins",
    SV: "Saves",
    R: "Runs",
    SO: "Strikeouts",
    "K/9": "Strikeouts/9",
    WHIP: "Walks + Hits / IP",
    RBI: "Runs Batted In",
    HR: "Home Runs",
    SB: "Stolen Bases",
    AVG: "Batting Average",
    OBP: "On-Base Pct",
    SLG: "Slugging Pct",
    ERA: "Earned Run Average",
  };
  const abbrevByFull = new Map(
    Object.entries(fullByAbbrev).map(([abbr, full]) => [full.toUpperCase(), abbr]),
  );
  const canonical = catName === "Walks + Hits per IP" ? "WHIP" : catName.trim();
  const canonicalUpper = canonical.toUpperCase();
  /* League scoring sometimes uses "K" for strikeouts — align with SO map */
  const abbrevLookupUpper = canonicalUpper === "K" ? "SO" : canonicalUpper;
  const knownAbbrev = Object.prototype.hasOwnProperty.call(
    fullByAbbrev,
    abbrevLookupUpper,
  )
    ? abbrevLookupUpper
    : undefined;
  const full =
    (knownAbbrev ? fullByAbbrev[knownAbbrev] : undefined) ??
    fullByAbbrev[canonical] ??
    canonical;
  const inferredAbbrev =
    knownAbbrev ??
    abbrevByFull.get(canonicalUpper) ??
    abbrevByFull.get(full.toUpperCase()) ??
    shortFromParen ??
    canonical;

  /* WHIP: prefer compact abbrev only (full "Walks + Hits / IP" + abbrev was redundant). */
  if (knownAbbrev === "WHIP" && full === fullByAbbrev.WHIP) {
    return { primary: "WHIP" };
  }

  /* Prefer a single readable title for common stat names (fits impact tiles on desktop). */
  if (full.length <= 22) return { primary: full };
  if (inferredAbbrev.length <= 10) return { primary: inferredAbbrev, secondary: full };

  const compact = full
    .replace("Percentage", "Pct")
    .replace("Strikeouts", "Ks")
    .replace("Runs Batted In", "RBI");
  return compact.length <= 14
    ? { primary: compact, secondary: full }
    : { primary: full.slice(0, 14).trim() };
}
