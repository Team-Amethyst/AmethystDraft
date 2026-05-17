import type { Player } from "../types/player";
import {
  catalogPlayerIdInStringSet,
  lookupRosterMapForCatalogPlayer,
} from "./catalogPlayerKeys";
import {
  formatDollar,
  leagueWideAuctionDollarsForDisplay,
} from "../utils/valuation";

export type ResearchTableAuctionDollarsOptions = {
  draftedIds?: ReadonlySet<string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
};

function parseDraftedPriceFromContract(
  contractLabel: string | undefined,
): number | undefined {
  if (!contractLabel?.trim()) return undefined;
  const match = contractLabel.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** Auction dollars for Research sort/display — price paid when drafted, else model value. */
export function researchTableAuctionDollars(
  player: Player,
  options?: ResearchTableAuctionDollarsOptions,
): number | undefined {
  if (
    options?.draftedIds &&
    catalogPlayerIdInStringSet(options.draftedIds, player)
  ) {
    const fromMap = options.draftedPriceByPlayerId
      ? lookupDraftedPrice(options.draftedPriceByPlayerId, player)
      : undefined;
    if (fromMap !== undefined) return fromMap;
    const contract = options.draftedContractByPlayerId
      ? lookupRosterMapForCatalogPlayer(
          options.draftedContractByPlayerId,
          player,
        )
      : undefined;
    const fromContract = parseDraftedPriceFromContract(contract);
    if (fromContract !== undefined) return fromContract;
  }
  return leagueWideAuctionDollarsForDisplay(player);
}

export type ResearchDraftedRowDisplay = {
  teamName: string;
  formattedPrice: string;
  title: string;
};

function lookupDraftedPrice(
  map: ReadonlyMap<string, number>,
  player: Pick<Player, "id" | "mlbId">,
): number | undefined {
  const price = map.get(player.id) ?? map.get(String(player.mlbId));
  return typeof price === "number" && Number.isFinite(price) ? price : undefined;
}

/** Team + price paid for Research rows when the player is already drafted. */
export function resolveResearchDraftedRowDisplay(
  player: Player,
  draftedIds: ReadonlySet<string> | undefined,
  draftedByTeam: ReadonlyMap<string, string> | undefined,
  draftedPriceByPlayerId: ReadonlyMap<string, number> | undefined,
): ResearchDraftedRowDisplay | null {
  if (!draftedIds || !catalogPlayerIdInStringSet(draftedIds, player)) {
    return null;
  }

  const teamName =
    (draftedByTeam
      ? lookupRosterMapForCatalogPlayer(draftedByTeam, player)?.trim()
      : undefined) || "Drafted";

  const paid = draftedPriceByPlayerId
    ? lookupDraftedPrice(draftedPriceByPlayerId, player)
    : undefined;
  const formattedPrice =
    paid != null ? formatDollar(Math.round(paid)) : "";

  return {
    teamName,
    formattedPrice,
    title: formattedPrice
      ? `Drafted by ${teamName} for ${formattedPrice} (not our valuation)`
      : `Drafted by ${teamName} (sale price unknown)`,
  };
}
