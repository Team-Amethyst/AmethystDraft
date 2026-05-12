/**
 * Engine draftable pool metadata (Research / portal parity).
 * Does not change valuation math — only classification + UI copy.
 */

export const TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID =
  "This player is outside the current draftable pool and is priced at the minimum bid.";

export type ResearchDraftableState = "draftable" | "outside" | "unknown";

export type NormalizedDraftablePoolMeta =
  | { kind: "unknown" }
  | { kind: "valid"; draftableIds: ReadonlySet<string>; poolSize: number | undefined };

function readFiniteInt(n: unknown): number | undefined {
  if (typeof n === "number" && Number.isFinite(n)) return Math.trunc(n);
  if (typeof n === "string" && n.trim() !== "") {
    const x = Number(n.trim());
    if (Number.isFinite(x)) return Math.trunc(x);
  }
  return undefined;
}

function readIdArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "number" && Number.isFinite(x)) {
      out.push(String(Math.trunc(x)));
      continue;
    }
    if (typeof x === "string") {
      const t = x.trim();
      if (t !== "") out.push(t);
    }
  }
  return out;
}

/**
 * Normalize Engine `draftable_player_ids` + `draftable_pool_size`.
 * Invalid shapes, missing ids, or size mismatch → unknown (UI must not imply precision).
 */
export function normalizeDraftablePoolMeta(
  raw: Record<string, unknown> | null | undefined,
): NormalizedDraftablePoolMeta {
  if (!raw || typeof raw !== "object") return { kind: "unknown" };
  const idsRaw =
    raw.draftable_player_ids ??
    raw.draftablePlayerIds ??
    raw["draftable-player-ids"];
  const ids = readIdArray(idsRaw);
  if (!ids || ids.length === 0) return { kind: "unknown" };

  const poolSize = readFiniteInt(
    raw.draftable_pool_size ?? raw.draftablePoolSize,
  );
  if (
    poolSize !== undefined &&
    poolSize >= 0 &&
    poolSize !== ids.length
  ) {
    return { kind: "unknown" };
  }

  const draftableIds = new Set(ids.map((s) => s.trim()).filter(Boolean));
  if (draftableIds.size !== ids.length) {
    return { kind: "unknown" };
  }

  return { kind: "valid", draftableIds, poolSize };
}

export function isPlayerInDraftablePool(
  meta: NormalizedDraftablePoolMeta,
  playerId: string,
): boolean | null {
  if (meta.kind !== "valid") return null;
  return meta.draftableIds.has(String(playerId).trim());
}

export function researchDraftableStateForPlayer(
  meta: NormalizedDraftablePoolMeta,
  player: { id: string; valuation_eligible?: boolean },
  isCustomPlayer: boolean,
): ResearchDraftableState {
  if (meta.kind !== "valid") return "unknown";
  if (isCustomPlayer) return "unknown";
  if (player.valuation_eligible === false) return "unknown";
  return meta.draftableIds.has(String(player.id).trim())
    ? "draftable"
    : "outside";
}

export function isNearMinimumAuctionBid(
  auctionDollars: number | null | undefined,
): boolean {
  if (typeof auctionDollars !== "number" || !Number.isFinite(auctionDollars)) {
    return false;
  }
  return auctionDollars <= 1.05;
}

export function shouldShowOutsideDraftableMinBidTooltip(args: {
  draftable: ResearchDraftableState;
  auctionDollars: number | null | undefined;
  valuationEligible?: boolean;
}): boolean {
  if (args.valuationEligible === false) return false;
  if (args.draftable !== "outside") return false;
  return isNearMinimumAuctionBid(args.auctionDollars);
}

export type ResearchDraftablePoolFilter = "all" | "draftable" | "replacement";

/** `localStorage` key for Research draftable-pool table filter. */
export const RESEARCH_DRAFTABLE_POOL_FILTER_STORAGE_KEY =
  "amethyst-research-draftable-pool";

export function filterPlayersByResearchDraftablePool<T extends { research_draftable?: ResearchDraftableState }>(
  players: readonly T[],
  filter: ResearchDraftablePoolFilter,
): T[] {
  if (filter === "all") return [...players];
  return players.filter((p) => {
    const d = p.research_draftable ?? "unknown";
    if (filter === "draftable") return d === "draftable";
    return d === "outside";
  });
}

export function attachResearchDraftableFlags<
  T extends { id: string; valuation_eligible?: boolean },
>(
  players: readonly T[],
  meta: NormalizedDraftablePoolMeta,
  isCustomPlayer: (id: string) => boolean,
): Array<T & { research_draftable: ResearchDraftableState }> {
  return players.map((p) => ({
    ...p,
    research_draftable: researchDraftableStateForPlayer(
      meta,
      p,
      isCustomPlayer(p.id),
    ),
  }));
}
