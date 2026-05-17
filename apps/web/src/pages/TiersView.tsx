import { useMemo, useState, type CSSProperties } from "react";
import type { StatBasis } from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import "./Research.css";
import "./TiersView.css";
import "../components/PlayerTable.css";
import { TierBadge as EngineTierBadge } from "../components/PlayerTableParts";
import PosBadge from "../components/PosBadge";
import { TierExpandedPlayerRow } from "../components/research/TierExpandedPlayerRow";
import {
  buildFullTierView,
  formatCliffToNextTierLabel,
  formatCurrency,
  formatTierBandDisplay,
  isDeemphasizedTier,
  sortPlayersInTierWithDraftedDisplay,
  type TierSortField,
  type TierStats,
} from "../utils/tiers";
import { poolHasAuctionTier, poolHasMarketAdp } from "../domain/playerRankTier";
import {
  auctionTierSemanticLabel,
  AUCTION_RANK_TOOLTIP,
  AUCTION_TIER_TOOLTIP,
  MARKET_ADP_COLUMN_TOOLTIP,
  MODEL_TIER_FALLBACK_TOOLTIP,
  TIERS_ROUNDING_TOOLTIP,
} from "../domain/rankTierLabels";
import {
  RESEARCH_TABLE_HEADER_AUCTION_VALUE_HINT,
  RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
  valuationSortLabel,
} from "../utils/valuation";
import {
  researchPlayerTableColSpan,
  researchPlayerTableStatLayout,
} from "../domain/researchPlayerTableLayout";
import { RESEARCH_POSITION_DISPLAY_ORDER } from "../domain/playerTablePositions";
import type { AppSelectOption } from "../components/AppSelect";
import { ResearchViewSelectField } from "../components/research/ResearchViewSelectField";

type Props = {
  players: Player[];
  draftedIds: ReadonlySet<string>;
  draftedByTeam?: ReadonlyMap<string, string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  draftedContractByPlayerId?: ReadonlyMap<string, string>;
  onPlayerClick: (p: Player) => void;
  isInWatchlist: (id: string) => boolean;
  addToWatchlist: (p: Player) => void;
  removeFromWatchlist: (id: string) => void;
  isCustomPlayer?: (id: string) => boolean;
  draftDisplaySlotKeys?: string[];
  statBasis?: StatBasis;
  scoringCategories?: { name: string; type: string }[];
  getNote?: (playerId: string) => string;
  onNoteChange?: (playerId: string, note: string) => void;
};

function tierBadgeNumber(tier: string | number): number | null {
  const n = typeof tier === "number" ? tier : Number(tier);
  return Number.isFinite(n) ? n : null;
}

/** Fixed Research position order so mix badges align across every tier row (no DH). */
function tierMixPositionOrder(): string[] {
  return RESEARCH_POSITION_DISPLAY_ORDER.filter((pos) => pos !== "DH");
}

function TierSummaryColumnHeader({ showMix }: { showMix: boolean }) {
  return (
    <div
      className={
        "tier-summary-columns tier-summary-columns--header" +
        (showMix ? "" : " tier-summary-columns--no-mix")
      }
      aria-hidden
    >
      <div className="tier-summary-columns__lead" />
      <div className="tier-summary-columns__metrics">
        <span className="tier-summary-columns__metric-label">Pool</span>
        <span className="tier-summary-columns__metric-label">Value</span>
        <span className="tier-summary-columns__metric-label">Avg</span>
        <span className="tier-summary-columns__metric-label">Cliff</span>
      </div>
      {showMix ? (
        <div className="tier-summary-columns__mix">
          <span className="tier-summary-columns__metric-label">Mix</span>
        </div>
      ) : null}
      <div className="tier-summary-columns__action" />
    </div>
  );
}

function TierPositionMixGrid({
  positionCounts,
  positions,
}: {
  positionCounts: Record<string, number>;
  positions: readonly string[];
}) {
  return (
    <ul className="tier-group__mix-grid" aria-label="Position mix in tier">
      {positions.map((pos) => {
        const count = positionCounts[pos] ?? 0;
        const empty = count <= 0;
        return (
          <li
            key={pos}
            className={
              "tier-group__mix-slot" + (empty ? " tier-group__mix-slot--empty" : "")
            }
            title={empty ? `${pos}: none in tier` : `${count} ${pos} in tier`}
          >
            <PosBadge pos={pos} className="tier-group__pos-badge" />
            <span className="tier-group__mix-count">{empty ? "—" : count}</span>
          </li>
        );
      })}
    </ul>
  );
}

function renderTierSection(
  tierStat: TierStats,
  tierIndex: number,
  totalTiers: number,
  args: {
    poolUsesAuctionTier: boolean;
    tierBadgeTitle: string;
    expanded: Record<string, boolean>;
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    showPositionMix: boolean;
    mixPositionOrder: string[];
    showMarketAdp: boolean;
    sortDisplayOptions: Parameters<typeof sortPlayersInTierWithDraftedDisplay>[2];
    deemphasized?: boolean;
    sectionClassName?: string;
    summaryTitle?: string;
    semanticOverride?: string | null;
    draftedIds: ReadonlySet<string>;
    draftedByTeam?: ReadonlyMap<string, string>;
    draftedPriceByPlayerId?: ReadonlyMap<string, number>;
    draftedContractByPlayerId?: ReadonlyMap<string, string>;
    onPlayerClick: (p: Player) => void;
    isInWatchlist: (id: string) => boolean;
    addToWatchlist: (p: Player) => void;
    removeFromWatchlist: (id: string) => void;
    isCustomPlayer?: (id: string) => boolean;
    draftDisplaySlotKeys?: string[];
    statBasis: StatBasis;
    sortBy: TierSortField;
    showAuctionRank: boolean;
    tableColSpan: number;
    statHeaders: string[];
    batCols: readonly string[];
    pitCols: readonly string[];
    focusedCols: readonly string[] | null;
    focusedType: "batting" | "pitching" | null;
    numStatCols: number;
    getNote?: (playerId: string) => string;
    onNoteChange?: (playerId: string, note: string) => void;
  },
) {
  const tierKey = String(tierStat.tier);
  const tierNum = tierBadgeNumber(tierStat.tier);
  const semantic =
    args.semanticOverride ??
    auctionTierSemanticLabel(tierStat.tier, args.poolUsesAuctionTier);
  const bandDisplay = formatTierBandDisplay(tierStat);
  const avgDisplay =
    tierStat.valuedPlayerCount > 0
      ? formatCurrency(Math.round(tierStat.averageValueRaw))
      : "—";
  const cliffLabel = formatCliffToNextTierLabel({
    cliffRaw: tierStat.cliffToNextTierRaw,
    isMinBidStyleTier: tierStat.isMinBidStyleTier,
    isFlatValueBand: tierStat.isFlatValueBand,
    hasNextTier: tierIndex < totalTiers - 1,
    tierNumber: tierStat.tier,
  });
  const deemphasized = args.deemphasized ?? isDeemphasizedTier(tierStat);
  const isExpanded = args.expanded[tierKey] ?? false;
  const sortedAvailable = sortPlayersInTierWithDraftedDisplay(
    tierStat.availablePlayers,
    args.sortBy,
    args.sortDisplayOptions,
  );
  const sortedDrafted =
    tierStat.draftedPlayers.length > 0
      ? sortPlayersInTierWithDraftedDisplay(
          tierStat.draftedPlayers,
          args.sortBy,
          args.sortDisplayOptions,
        )
      : [];
  const tableColSpan = args.tableColSpan;

  return (
    <section
      key={tierKey}
      className={
        "tier-group pt-container" +
        (args.sectionClassName ? ` ${args.sectionClassName}` : "") +
        (deemphasized ? " tier-group--muted" : "")
      }
    >
      <button
        type="button"
        className="tier-group__summary"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} tier ${tierStat.tier}${semantic ? `, ${semantic}` : ""}`}
        onClick={() =>
          args.setExpanded((s) => ({ ...s, [tierKey]: !s[tierKey] }))
        }
      >
        <div
          className={
            "tier-summary-columns" +
            (args.showPositionMix ? "" : " tier-summary-columns--no-mix")
          }
        >
          <div className="tier-summary-columns__lead tier-group__summary-lead">
            {tierNum != null ? (
              <EngineTierBadge tier={tierNum} title={args.tierBadgeTitle} />
            ) : (
              <span className="tier-badge tier-unassigned">—</span>
            )}
            <span className="tier-group__summary-title-block">
              <span className="tier-group__summary-title">
                {args.summaryTitle ?? `Tier ${tierStat.tier}`}
              </span>
              {semantic ? (
                <span className="tier-group__semantic" title={semantic}>
                  {semantic}
                </span>
              ) : null}
            </span>
          </div>

          <ul
            className="tier-summary-columns__metrics tier-group__summary-metrics"
            aria-label="Tier summary"
          >
            <li className="tier-group__metric tier-group__metric--pool">
              <span className="sr-only">Pool</span>
              <span className="tier-group__metric-value">
                {tierStat.players.length} players ·{" "}
                <strong>{tierStat.availableCount} left</strong>
                {tierStat.draftedCount > 0 ? (
                  <span className="tier-group__drafted-note">
                    {" "}
                    · {tierStat.draftedCount} drafted
                  </span>
                ) : null}
              </span>
            </li>
            <li className="tier-group__metric tier-group__metric--value">
              <span className="sr-only">Value</span>
              <span
                className="tier-group__metric-value tier-group__range"
                title={TIERS_ROUNDING_TOOLTIP}
              >
                {bandDisplay.rangeLabel}
                {bandDisplay.shelfNote ? (
                  <span className="tier-group__shelf-note">
                    {" "}
                    ({bandDisplay.shelfNote})
                  </span>
                ) : null}
              </span>
            </li>
            <li className="tier-group__metric tier-group__metric--avg">
              <span className="sr-only">Avg</span>
              <span className="tier-group__metric-value">{avgDisplay}</span>
            </li>
            <li className="tier-group__metric tier-group__metric--cliff">
              <span className="sr-only">Cliff</span>
              <span
                className={
                  "tier-group__metric-value tier-group__cliff" +
                  (tierStat.cliffToNextTierRaw != null &&
                  tierStat.cliffToNextTierRaw >= 3
                    ? " tier-group__cliff--strong"
                    : "") +
                  (cliffLabel === "No meaningful drop" ||
                  cliffLabel === "Replacement pool"
                    ? " tier-group__cliff--muted"
                    : "")
                }
                title={cliffLabel}
              >
                {cliffLabel}
              </span>
            </li>
          </ul>

          {args.showPositionMix ? (
            <div
              className="tier-summary-columns__mix"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="sr-only">Mix</span>
              <TierPositionMixGrid
                positionCounts={tierStat.positionCounts}
                positions={args.mixPositionOrder}
              />
            </div>
          ) : null}

          <span className="tier-summary-columns__action tier-group__summary-toggle">
            {isExpanded ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>

      {isExpanded ? (
        <div className="tier-table-scroll">
          <table className="tier-table pt-table pt-table--research">
            <thead>
              <tr>
                <th className="th-rank" scope="col">
                  Rank
                </th>
                <th className="th-star" scope="col" />
                <th className="th-player" scope="col">
                  Player
                </th>
                <th className="th-pos" scope="col">
                  Pos
                </th>
                <th className="th-team" scope="col">
                  Team
                </th>
                {args.showMarketAdp ? (
                  <th
                    className="th-rank-metric"
                    scope="col"
                    title={MARKET_ADP_COLUMN_TOOLTIP}
                  >
                    Market ADP
                  </th>
                ) : null}
                {args.showAuctionRank ? (
                  <th
                    className="th-auction-rank th-rank-metric"
                    scope="col"
                    title={AUCTION_RANK_TOOLTIP}
                  >
                    Auction rank
                  </th>
                ) : null}
                <th
                  className="th-value"
                  scope="col"
                  title={`${RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE} ${RESEARCH_TABLE_HEADER_AUCTION_VALUE_HINT}`}
                >
                  {valuationSortLabel("auction_value")}
                </th>
                {args.statHeaders.map((label, i) => (
                  <th
                    key={`${label}-${i}`}
                    className={i === 0 ? "th-avg" : "th-stat"}
                    scope="col"
                  >
                    {label}
                  </th>
                ))}
                <th className="th-notes" scope="col">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="tier-table__body-available">
              {sortedAvailable.map((player, index) => (
                <TierExpandedPlayerRow
                  key={player.id}
                  player={player}
                  listRank={index + 1}
                  statBasis={args.statBasis}
                  draftDisplaySlotKeys={args.draftDisplaySlotKeys}
                  isCustomPlayer={args.isCustomPlayer?.(player.id)}
                  draftedIds={args.draftedIds}
                  draftedByTeam={args.draftedByTeam}
                  draftedPriceByPlayerId={args.draftedPriceByPlayerId}
                  draftedContractByPlayerId={args.draftedContractByPlayerId}
                  isStarred={args.isInWatchlist(player.id)}
                  onPlayerClick={args.onPlayerClick}
                  onToggleWatchlist={(p) => {
                    if (args.isInWatchlist(p.id)) {
                      args.removeFromWatchlist(p.id);
                    } else {
                      args.addToWatchlist(p);
                    }
                  }}
                  showMarketAdp={args.showMarketAdp}
                  showAuctionRank={args.showAuctionRank}
                  batCols={args.batCols}
                  pitCols={args.pitCols}
                  focusedCols={args.focusedCols}
                  focusedType={args.focusedType}
                  numStatCols={args.numStatCols}
                  getNote={args.getNote}
                  onNoteChange={args.onNoteChange}
                />
              ))}
            </tbody>
            {sortedDrafted.length > 0 ? (
              <tbody className="tier-table__body-drafted">
                <tr className="tier-table__drafted-divider">
                  <td colSpan={tableColSpan}>
                    <span className="tier-table__drafted-heading">
                      Drafted from this tier
                    </span>
                  </td>
                </tr>
                {sortedDrafted.map((player, index) => (
                  <TierExpandedPlayerRow
                    key={`drafted-${player.id}`}
                    player={player}
                    listRank={index + 1}
                    statBasis={args.statBasis}
                    draftDisplaySlotKeys={args.draftDisplaySlotKeys}
                    isCustomPlayer={args.isCustomPlayer?.(player.id)}
                    draftedIds={args.draftedIds}
                    draftedByTeam={args.draftedByTeam}
                    draftedPriceByPlayerId={args.draftedPriceByPlayerId}
                    draftedContractByPlayerId={args.draftedContractByPlayerId}
                    isStarred={args.isInWatchlist(player.id)}
                    onPlayerClick={args.onPlayerClick}
                    onToggleWatchlist={(p) => {
                      if (args.isInWatchlist(p.id)) {
                        args.removeFromWatchlist(p.id);
                      } else {
                        args.addToWatchlist(p);
                      }
                    }}
                    showMarketAdp={args.showMarketAdp}
                    showAuctionRank={args.showAuctionRank}
                    batCols={args.batCols}
                    pitCols={args.pitCols}
                    focusedCols={args.focusedCols}
                    focusedType={args.focusedType}
                    numStatCols={args.numStatCols}
                    getNote={args.getNote}
                    onNoteChange={args.onNoteChange}
                  />
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function TiersView({
  players,
  draftedIds,
  draftedByTeam,
  draftedPriceByPlayerId,
  draftedContractByPlayerId,
  onPlayerClick,
  isInWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isCustomPlayer,
  draftDisplaySlotKeys,
  statBasis = "projections",
  scoringCategories,
  getNote,
  onNoteChange,
}: Props) {
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState<TierSortField>("auction_value");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({}));

  const poolUsesAuctionTier = useMemo(
    () => poolHasAuctionTier(players),
    [players],
  );
  const showMarketAdp = useMemo(() => poolHasMarketAdp(players), [players]);
  const showAuctionRank = useMemo(
    () =>
      players.some(
        (p) =>
          typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank),
      ),
    [players],
  );

  const statLayout = useMemo(
    () => researchPlayerTableStatLayout(scoringCategories, "all"),
    [scoringCategories],
  );

  const tableColSpan = useMemo(
    () =>
      researchPlayerTableColSpan({
        showMarketAdp,
        showAuctionRank,
        numActiveStatCols: statLayout.numActiveStatCols,
      }),
    [showMarketAdp, showAuctionRank, statLayout.numActiveStatCols],
  );

  const { tiers: tierStats, outsideModel } = useMemo(
    () =>
      buildFullTierView(
        players,
        draftedIds,
        positionFilter,
        draftDisplaySlotKeys,
      ),
    [players, draftedIds, positionFilter, draftDisplaySlotKeys],
  );

  const sortDisplayOptions = useMemo(
    () => ({
      draftedIds,
      draftedPriceByPlayerId,
      draftedContractByPlayerId,
    }),
    [draftedIds, draftedPriceByPlayerId, draftedContractByPlayerId],
  );

  const mixPositionOrder = useMemo(() => tierMixPositionOrder(), []);
  const showPositionMix =
    positionFilter === "all" && mixPositionOrder.length > 0;
  const mixTrackWidth = useMemo(() => {
    if (!showPositionMix) return undefined;
    const slots = mixPositionOrder.length;
    const slotRem = 2.35;
    const gapRem = 0.12;
    return `calc(${slots} * ${slotRem}rem + ${Math.max(0, slots - 1)} * ${gapRem}rem)`;
  }, [showPositionMix, mixPositionOrder.length]);

  const uniquePositions = useMemo(() => {
    const pos = new Set<string>();
    for (const p of players) {
      if (p.position) pos.add(p.position);
    }
    return Array.from(pos).sort();
  }, [players]);

  const positionFilterOptions = useMemo((): AppSelectOption[] => {
    return [
      { value: "all", label: "All Positions" },
      ...uniquePositions.map((pos) => ({ value: pos, label: pos })),
    ];
  }, [uniquePositions]);

  const sortOptions = useMemo((): AppSelectOption[] => {
    const options: AppSelectOption[] = [
      { value: "auction_value", label: valuationSortLabel("auction_value") },
      { value: "auction_rank", label: "Auction rank" },
    ];
    if (showMarketAdp) {
      options.push({ value: "market_adp", label: "Market ADP" });
    }
    options.push(
      { value: "position", label: "Position" },
      { value: "recommended_bid", label: valuationSortLabel("recommended_bid") },
      { value: "team_value", label: valuationSortLabel("team_value") },
    );
    return options;
  }, [showMarketAdp]);

  const tierBadgeTitle = poolUsesAuctionTier
    ? AUCTION_TIER_TOOLTIP
    : MODEL_TIER_FALLBACK_TOOLTIP;

  const sectionArgs = {
    poolUsesAuctionTier,
    tierBadgeTitle,
    expanded,
    setExpanded,
    showPositionMix,
    mixPositionOrder,
    showMarketAdp,
    sortDisplayOptions,
    draftedIds,
    draftedByTeam,
    draftedPriceByPlayerId,
    draftedContractByPlayerId,
    onPlayerClick,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isCustomPlayer,
    draftDisplaySlotKeys,
    statBasis,
    sortBy,
    showAuctionRank,
    tableColSpan,
    statHeaders: statLayout.statHeaders,
    batCols: statLayout.batCols,
    pitCols: statLayout.pitCols,
    focusedCols: statLayout.focusedCols,
    focusedType: statLayout.focusedType,
    numStatCols: statLayout.numStatCols,
    getNote,
    onNoteChange,
  };

  const hasMainTiers = tierStats.length > 0;

  return (
    <div className="tiers-view depth-chart-wrapper">
      <header className="depth-chart-page-header cc-surface-inset tiers-page-header">
        <div className="depth-chart-page-header__top">
          <div className="depth-chart-page-header__intro">
            <h2
              title={
                poolUsesAuctionTier ? undefined : MODEL_TIER_FALLBACK_TOOLTIP
              }
            >
              Auction tiers
            </h2>
            <p>
              Model-generated auction tiers for this league. {TIERS_ROUNDING_TOOLTIP}
            </p>
          </div>

          <div className="depth-chart-page-header__controls">
            <ResearchViewSelectField
              id="tiers-position-filter"
              label="Position"
              selectClassName="research-view-select--position"
              value={positionFilter}
              onChange={setPositionFilter}
              options={positionFilterOptions}
              aria-label="Filter tiers by position"
            />
            <ResearchViewSelectField
              id="tiers-sort-by"
              label="Sort within tier"
              selectClassName="research-view-select--sort"
              value={sortBy}
              onChange={(value) => setSortBy(value as TierSortField)}
              options={sortOptions}
              aria-label="Sort players within each tier"
            />
          </div>
        </div>
      </header>

      <div
        className="tiers-list"
        style={
          mixTrackWidth
            ? ({
                "--tier-mix-track-width": mixTrackWidth,
                "--tier-mix-slot-count": mixPositionOrder.length,
              } as CSSProperties)
            : undefined
        }
      >
        {showPositionMix ? <TierSummaryColumnHeader showMix /> : null}

        {!hasMainTiers && !outsideModel ? (
          <p className="depth-chart-empty-search">No players match this filter.</p>
        ) : null}

        {tierStats.map((tierStat, tierIndex) =>
          renderTierSection(tierStat, tierIndex, tierStats.length, sectionArgs),
        )}

        {outsideModel
          ? renderTierSection(
              outsideModel,
              tierStats.length,
              tierStats.length + 1,
              {
                ...sectionArgs,
                deemphasized: true,
                sectionClassName: "tier-group--outside-model",
                summaryTitle: "Not in valuation model",
                semanticOverride: null,
              },
            )
          : null}
      </div>
    </div>
  );
}
