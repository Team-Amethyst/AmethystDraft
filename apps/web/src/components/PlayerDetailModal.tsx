import { type StatBasis, statBasisFooterDescription } from "@repo/player-stat-basis";
import type { Player } from "../types/player";
import {
  formatCurrencyWhole,
  formatExplainRiskMultiplier,
  formatInflationFactorMultiple,
  formatMaybeDollar,
  formatPoolToSlotRatio,
  formatValuationExplainAgeDepthComponent,
  isMeaningfulExplainMultiplier,
  BID_EDGE_TOOLTIP,
  formatSignedDollarWhole,
  RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE,
  RESEARCH_TABLE_TOOLTIP_MAX_BID,
  BASELINE_STRENGTH_TOOLTIP,
  REPLACEMENT_COMPARISON_SLOT_TOOLTIP,
  RESEARCH_TABLE_TOOLTIP_TEAM_VALUE,
  valuationExplainHasRiskRoleContent,
  valuationTooltip,
} from "../utils/valuation";
import { buildPlayerDetailValuationLadder } from "../domain/playerDetailValuationLadder";
import {
  formatSignedWhole,
  summarizeDriverReason,
  truncateExplainText,
} from "../utils/explainV2Ui";
import { useEffect } from "react";
import PosBadge from "./PosBadge";
import { playerIdentityPositionPresentation } from "../utils/eligibility";
import "./PlayerDetailModal.css";
import type { BoardValuationUiPhase } from "../domain/boardValuationFetchPhase";
import { shouldMaskResearchEngineColumns } from "../domain/boardValuationFetchPhase";
import { ResearchEngineValueLoading } from "./research/ResearchEngineValueLoading";
import {
  AUCTION_RANK_TOOLTIP,
  AUCTION_TIER_TOOLTIP,
  marketAdpDetailTooltip,
  MODEL_RANK_TOOLTIP,
  MODEL_TIER_TOOLTIP,
  STRENGTH_RANK_TOOLTIP,
  STRENGTH_TIER_TOOLTIP,
} from "../domain/rankTierLabels";
import type { DepthChartModalContext } from "../domain/depthChartPlayerProfile";
import {
  COMMAND_CENTER_REQUIRES_CATALOG_TOOLTIP,
  WATCHLIST_REQUIRES_CATALOG_TOOLTIP,
  NO_VALUATION_DEPTH_CHART_DETAIL,
  NO_VALUATION_INELIGIBLE_DETAIL,
  NO_VALUATION_LABEL,
} from "../domain/playerValuationCopy";

/** Must match `isValuationContextDebugEnabled` in Research.tsx (`valuationContextDev` prop). */
function isValuationContextDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("showValuationDebug") === "1";
  } catch {
    return false;
  }
}

interface PlayerDetailModalProps {
  isOpen: boolean;
  player: Player | null;
  /** Active research table stat lens (footer copy aligns with PlayerTable). */
  statBasis?: StatBasis;
  draftedByTeam?: string;
  draftedContract?: string;
  note?: string;
  onNoteChange?: (playerId: string, note: string) => void;
  isCustomPlayer?: boolean;
  onClose: () => void;
  onMoveToCommandCenter: (player: Player) => void;
  /** Latest board valuation response warnings (same payload as Command Center). */
  valuationContextWarnings?: readonly string[];
  /** True while focused `/valuation/player` explain payload is loading (Why this value). */
  valuationExplainLoading?: boolean;
  /**
   * Opaque `valuation_context` JSON when present.
   * Shown only when `import.meta.env.DEV` and `localStorage.getItem("showValuationDebug") === "1"`.
   */
  valuationContextDev?: Record<string, unknown> | null;
  /** Research: Engine board phase — loading masks auction / ladder dollars until first board. */
  researchEngineBoardPhase?: BoardValuationUiPhase;
  /** Opened from Research: auction-first rail; strength tier/rank omitted. */
  researchSurface?: boolean;
  /**
   * When `researchSurface`, show model rank / model tier only if the Research table has
   * “Model rank & tiers” enabled.
   */
  researchShowModelMetrics?: boolean;
  /** League roster keys for header position chips (hides DH / UTIL / BN). */
  draftDisplaySlotKeys?: string[];
  /**
   * Depth chart row without a Research catalog match — show identity only, no Engine metrics.
   */
  depthChartOnly?: boolean;
  depthChartContext?: DepthChartModalContext | null;
}

function valueOrDash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

/** Prefer breaking before the surname; keep Jr./Sr./numerals glued to the prior word. */
function gluePlayerNameSuffixForDisplay(name: string): string {
  return name.replace(/\s+(Jr\.?|Sr\.?|III|II|IV)\s*$/i, "\u00a0$1");
}

function formatInjurySeverityExplain(
  v: string | number | undefined,
): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  return undefined;
}

type ValuationExplain = NonNullable<Player["valuation_explain"]>;

function explainSectionAHasContent(explain: ValuationExplain | null | undefined): boolean {
  if (!explain) return false;
  return Boolean(
    explain.replacement_key_used ||
      explain.replacement_value_used != null ||
      explain.surplus_basis ||
      explain.inflation_factor != null ||
      explain.pool_to_slot_ratio != null,
  );
}

function explainSectionBHasContent(explain: ValuationExplain | null | undefined): boolean {
  return Boolean(explain && valuationExplainHasRiskRoleContent(explain));
}

function explainSectionCHasContent(
  explain: ValuationExplain | null | undefined,
  boardWarnings: readonly string[] | undefined,
): boolean {
  const scoring = (explain?.scoring_category_warnings?.length ?? 0) > 0;
  const board = (boardWarnings?.length ?? 0) > 0;
  return scoring || board;
}

/** Drives visibility of the “Why this value?” `<details>` (collapsed by default). */
function whyThisValueHasExpandableContent(
  explain: ValuationExplain | null | undefined,
  boardWarnings: readonly string[] | undefined,
  baselineValue?: number | null,
): boolean {
  const hasBaseline =
    typeof baselineValue === "number" && Number.isFinite(baselineValue);
  return (
    explainSectionAHasContent(explain) ||
    explainSectionBHasContent(explain) ||
    explainSectionCHasContent(explain, boardWarnings) ||
    hasBaseline
  );
}

function ValuationExplainSections({
  explain,
  boardWarnings,
}: {
  explain: ValuationExplain | null | undefined;
  boardWarnings?: readonly string[];
}) {
  const hasA = explainSectionAHasContent(explain);
  const hasB = explainSectionBHasContent(explain);
  const hasC = explainSectionCHasContent(explain, boardWarnings);
  const splitColumns = hasA && hasB;

  if (!hasA && !hasB && !hasC) return null;

  return (
    <div className="pdm-explain-layout">
      {hasA || hasB ? (
        <div
          className={
            "pdm-explain-columns" + (splitColumns ? " pdm-explain-columns--split" : "")
          }
        >
          {hasA && explain ? (
            <section className="pdm-explain-col" aria-label="Auction context">
              <h4 className="pdm-explain-block-title">Auction context</h4>
              <dl className="pdm-explain-kv-dl">
                {explain.replacement_key_used ? (
                  <>
                    <dt title={REPLACEMENT_COMPARISON_SLOT_TOOLTIP}>
                      Replacement comparison slot
                    </dt>
                    <dd>{explain.replacement_key_used}</dd>
                  </>
                ) : null}
                {explain.replacement_value_used != null ? (
                  <>
                    <dt>Replacement value</dt>
                    <dd>{formatMaybeDollar(explain.replacement_value_used)}</dd>
                  </>
                ) : null}
                {explain.surplus_basis ? (
                  <>
                    <dt>Surplus basis</dt>
                    <dd>{explain.surplus_basis}</dd>
                  </>
                ) : null}
                {explain.inflation_factor != null ? (
                  <>
                    <dt>Inflation factor</dt>
                    <dd>{formatInflationFactorMultiple(explain.inflation_factor)}</dd>
                  </>
                ) : null}
                {explain.pool_to_slot_ratio != null ? (
                  <>
                    <dt>Pool / slot ratio</dt>
                    <dd>{formatPoolToSlotRatio(explain.pool_to_slot_ratio)}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}
          {hasB && explain ? (
            <section className="pdm-explain-col" aria-label="Risk and role">
              <h4 className="pdm-explain-block-title">Risk / role</h4>
              <dl className="pdm-explain-kv-dl">
                {typeof explain.age_years === "number" &&
                Number.isFinite(explain.age_years) &&
                explain.age_years > 0 ? (
                  <>
                    <dt>Age</dt>
                    <dd>{String(Math.round(explain.age_years))}</dd>
                  </>
                ) : null}
                {isMeaningfulExplainMultiplier(explain.age_multiplier) ? (
                  <>
                    <dt>Age multiplier</dt>
                    <dd>{formatExplainRiskMultiplier(explain.age_multiplier)}</dd>
                  </>
                ) : null}
                {explain.depth_chart_position_resolved ? (
                  <>
                    <dt>Depth slot</dt>
                    <dd>{explain.depth_chart_position_resolved}</dd>
                  </>
                ) : null}
                {isMeaningfulExplainMultiplier(explain.depth_multiplier) ? (
                  <>
                    <dt>Depth multiplier</dt>
                    <dd>{formatExplainRiskMultiplier(explain.depth_multiplier)}</dd>
                  </>
                ) : null}
                {isMeaningfulExplainMultiplier(explain.age_depth_combined_multiplier) ? (
                  <>
                    <dt>Age + role multiplier</dt>
                    <dd>{formatExplainRiskMultiplier(explain.age_depth_combined_multiplier)}</dd>
                  </>
                ) : null}
                {formatInjurySeverityExplain(explain.injury_severity) ? (
                  <>
                    <dt>Injury severity</dt>
                    <dd>{formatInjurySeverityExplain(explain.injury_severity)}</dd>
                  </>
                ) : null}
                {isMeaningfulExplainMultiplier(explain.injury_multiplier) ? (
                  <>
                    <dt>Injury multiplier</dt>
                    <dd>{formatExplainRiskMultiplier(explain.injury_multiplier)}</dd>
                  </>
                ) : null}
                {formatValuationExplainAgeDepthComponent(explain.age_component) ? (
                  <>
                    <dt>Age adjustment</dt>
                    <dd>{formatValuationExplainAgeDepthComponent(explain.age_component)}</dd>
                  </>
                ) : null}
                {formatValuationExplainAgeDepthComponent(explain.depth_component) ? (
                  <>
                    <dt>Depth adjustment</dt>
                    <dd>{formatValuationExplainAgeDepthComponent(explain.depth_component)}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      ) : null}
      {hasC ? (
        <section className="pdm-explain-col pdm-explain-col--full" aria-label="Notes and warnings">
          <h4 className="pdm-explain-block-title">Notes / Warnings</h4>
          <dl className="pdm-explain-kv-dl pdm-explain-kv-dl--warnings">
            {explain?.scoring_category_warnings?.length ? (
              <>
                <dt>Scoring category warnings</dt>
                <dd>
                  <ul className="pdm-explain-warnings pdm-explain-warnings--compact">
                    {explain.scoring_category_warnings.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
            {boardWarnings && boardWarnings.length > 0 ? (
              <>
                <dt>Valuation context</dt>
                <dd>
                  <ul className="pdm-explain-warnings pdm-explain-warnings--compact">
                    {boardWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

export default function PlayerDetailModal({
  isOpen,
  player,
  statBasis = "projections",
  draftedByTeam,
  draftedContract,
  note,
  onNoteChange,
  isCustomPlayer = false,
  onClose,
  onMoveToCommandCenter,
  valuationContextWarnings,
  valuationContextDev,
  valuationExplainLoading = false,
  researchEngineBoardPhase = "ready",
  researchSurface = false,
  researchShowModelMetrics = false,
  draftDisplaySlotKeys,
  depthChartOnly = false,
  depthChartContext = null,
}: PlayerDetailModalProps) {
  useEffect(() => {
    if (!isOpen || !player) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, player, onClose]);

  if (!isOpen || !player) return null;

  const maskEngineMetrics =
    !depthChartOnly &&
    shouldMaskResearchEngineColumns(researchEngineBoardPhase, player);

  const showResearchModelRail =
    !researchSurface || researchShowModelMetrics;
  const hideStrengthRail = researchSurface;

  const {
    primaryTags: positionPrimaryTags,
    draftableSlots: positionDraftableSlots,
  } = playerIdentityPositionPresentation(player, draftDisplaySlotKeys);
  const batting = player.stats.batting;
  const pitching = player.stats.pitching;
  const projectionBat = player.projection.batting;
  const projectionPit = player.projection.pitching;
  const stats3yrBat = player.stats3yr?.batting;
  const stats3yrPit = player.stats3yr?.pitching;
  const valuationLadder = buildPlayerDetailValuationLadder(player);
  const {
    auctionValue: marketValue,
    recommendedBid,
    teamValue: yourValue,
    maxBid,
    bidEdge,
    maxBidEqualsRecommended,
  } = valuationLadder;

  const showValuationContextDebug =
    isValuationContextDebugEnabled() &&
    valuationContextDev != null &&
    Object.keys(valuationContextDev).length > 0;

  const showModelNotesBody =
    Boolean(player.outlook?.trim()) ||
    Boolean(player.why?.length) ||
    Boolean(player.market_notes?.length) ||
    Boolean(player.explain_v2);

  const showWhyThisValue =
    valuationExplainLoading ||
    whyThisValueHasExpandableContent(
      player.valuation_explain ?? null,
      valuationContextWarnings,
      player.baseline_value,
    );

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div
        className="pdm-modal cc-modal-shell"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} details`}
      >
        <div className="pdm-body">
        {depthChartOnly ? (
          <div className="pdm-depth-only-notice" role="status">
            <strong>{NO_VALUATION_LABEL}</strong>
            <p>{NO_VALUATION_DEPTH_CHART_DETAIL}</p>
            {depthChartContext ? (
              <p className="pdm-depth-only-notice__meta">
                Depth chart: {depthChartContext.chartPosition} · rank #
                {depthChartContext.depthRank} · {depthChartContext.status}
              </p>
            ) : null}
          </div>
        ) : null}

        {valuationContextWarnings && valuationContextWarnings.length > 0 ? (
          <div className="pdm-inline-warnings" role="status">
            <strong>Valuation notice</strong>
            <ul>
              {valuationContextWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="pdm-split">
          <aside className="pdm-rail" aria-label="Player profile">
            <div className="pdm-rail__group">
              <div className="pdm-rail__head">
                <div className="pdm-rail__identity">
                  {player.headshot ? (
                    <img
                      className="pdm-headshot"
                      src={player.headshot}
                      alt={player.name}
                    />
                  ) : (
                    <div
                      className="pdm-headshot pdm-headshot--placeholder"
                      aria-hidden
                    />
                  )}
                  <div className="pdm-identity-text">
                    <div className="pdm-rail-name-row">
                      <h2 className="pdm-title pdm-title--rail">
                        {gluePlayerNameSuffixForDisplay(player.name)}
                      </h2>
                      {positionPrimaryTags.length > 0 ? (
                        <span
                          className="pdm-rail-name-pos"
                          title="Primary positions"
                          aria-label="Primary positions"
                        >
                          {positionPrimaryTags.map((pos) => (
                            <PosBadge key={pos} pos={pos} />
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <div className="pdm-rail-team-row">
                      <span className="pdm-meta-team-abbr">{player.team}</span>
                    </div>
                    {positionDraftableSlots.length > 0 ? (
                      <div
                        className="pdm-slot-elig-line"
                        title="Roster slots you can draft this player into"
                      >
                        <span className="pdm-slot-elig-label">Slots:</span>
                        <span className="pdm-slot-elig-badges">
                          {positionDraftableSlots.map((s) => (
                            <PosBadge key={s} pos={s} className="pdm-slot-elig-badge" />
                          ))}
                        </span>
                      </div>
                    ) : null}
                    <div className="pdm-header-context">
                      {player.injuryStatus && <span className="pdm-chip pdm-chip--inj">{player.injuryStatus}</span>}
                      {isCustomPlayer && <span className="pdm-chip">Custom</span>}
                      {draftedByTeam && <span className="pdm-chip pdm-chip--drafted">Drafted by {draftedByTeam}</span>}
                      {draftedContract && <span className="pdm-chip">{draftedContract}</span>}
                    </div>
                    <div className="pdm-rail-kv-stack">
                      <dl className="pdm-rail-kv-dl" aria-label="Ranks and tiers">
                        {showResearchModelRail ? (
                          <>
                            <dt title={MODEL_RANK_TOOLTIP}>Model rank</dt>
                            <dd>{valueOrDash(player.catalog_rank)}</dd>
                          </>
                        ) : null}
                        {maskEngineMetrics ? (
                          <>
                            <dt title={AUCTION_RANK_TOOLTIP}>Auction rank</dt>
                            <dd>
                              {typeof player.auction_rank === "number" &&
                              Number.isFinite(player.auction_rank) ? (
                                player.auction_rank
                              ) : (
                                <ResearchEngineValueLoading label="Loading auction rank" />
                              )}
                            </dd>
                          </>
                        ) : typeof player.auction_rank === "number" &&
                          Number.isFinite(player.auction_rank) ? (
                          <>
                            <dt title={AUCTION_RANK_TOOLTIP}>Auction rank</dt>
                            <dd>{player.auction_rank}</dd>
                          </>
                        ) : null}
                        {!hideStrengthRail &&
                        typeof player.baseline_rank === "number" &&
                        Number.isFinite(player.baseline_rank) ? (
                          <>
                            <dt title={STRENGTH_RANK_TOOLTIP}>Strength rank</dt>
                            <dd>{player.baseline_rank}</dd>
                          </>
                        ) : null}
                        {typeof player.market_adp === "number" &&
                        Number.isFinite(player.market_adp) ? (
                          <>
                            <dt title={marketAdpDetailTooltip(player)}>
                              Market ADP
                            </dt>
                            <dd>{player.market_adp}</dd>
                          </>
                        ) : null}
                        {showResearchModelRail ? (
                          <>
                            <dt title={MODEL_TIER_TOOLTIP}>Model tier</dt>
                            <dd>{valueOrDash(player.catalog_tier)}</dd>
                          </>
                        ) : null}
                        {typeof player.auction_tier === "number" &&
                        Number.isFinite(player.auction_tier) ? (
                          <>
                            <dt title={AUCTION_TIER_TOOLTIP}>Auction tier</dt>
                            <dd>{player.auction_tier}</dd>
                          </>
                        ) : null}
                        {!hideStrengthRail &&
                        typeof player.baseline_tier === "number" &&
                        Number.isFinite(player.baseline_tier) ? (
                          <>
                            <dt title={STRENGTH_TIER_TOOLTIP}>Strength tier</dt>
                            <dd>{player.baseline_tier}</dd>
                          </>
                        ) : null}
                      </dl>
                      <h3 className="pdm-rail-section-title">Profile</h3>
                      <dl className="pdm-rail-kv-dl" aria-label="Profile">
                        <dt>Age</dt>
                        <dd>
                          {typeof player.age === "number" && Number.isFinite(player.age)
                            ? String(player.age)
                            : "—"}
                        </dd>
                        <dt>MLB ID</dt>
                        <dd>
                          {typeof player.mlbId === "number" && Number.isFinite(player.mlbId)
                            ? String(player.mlbId)
                            : "—"}
                        </dd>
                        <dt>Indicator</dt>
                        <dd>{valueOrDash(player.indicator)}</dd>
                        <dt>Drafted</dt>
                        <dd>{draftedByTeam ? `Yes - ${draftedByTeam}` : "Available"}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="pdm-main">
            <section className="pdm-valuation-card" aria-label="Valuation summary">
              {depthChartOnly ? null : player.valuation_eligible === false ? (
                <div className="pdm-valuation-unavailable" role="status">
                  <p className="pdm-valuation-unavailable__title">{NO_VALUATION_LABEL}</p>
                  <p className="pdm-valuation-unavailable__detail">
                    {NO_VALUATION_INELIGIBLE_DETAIL}
                  </p>
                </div>
              ) : (
              <>
              <div className="pdm-valuation-metric-grid pdm-valuation-strip__metrics" role="list">
                <div className="pdm-metric" role="listitem">
                  <span className="pdm-metric-label" title={RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE}>
                    Auction Value
                  </span>
                  <span className="pdm-metric-value">
                    {maskEngineMetrics && marketValue == null ? (
                      <ResearchEngineValueLoading label="Loading auction value" />
                    ) : (
                      formatCurrencyWhole(marketValue)
                    )}
                  </span>
                </div>
                <div className="pdm-metric" role="listitem">
                  <span
                    className="pdm-metric-label"
                    title={valuationTooltip("recommended_bid")}
                  >
                    Recommended Bid
                  </span>
                  <span className="pdm-metric-value">
                    {maskEngineMetrics && recommendedBid == null ? (
                      <ResearchEngineValueLoading label="Loading recommended bid" />
                    ) : (
                      formatCurrencyWhole(recommendedBid)
                    )}
                  </span>
                </div>
                <div className="pdm-metric" role="listitem">
                  <span className="pdm-metric-label" title={RESEARCH_TABLE_TOOLTIP_TEAM_VALUE}>
                    Team Value
                  </span>
                  <span className="pdm-metric-value">
                    {maskEngineMetrics && yourValue == null ? (
                      <ResearchEngineValueLoading label="Loading team value" />
                    ) : (
                      formatCurrencyWhole(yourValue)
                    )}
                  </span>
                </div>
                <div className="pdm-metric" role="listitem">
                  <span className="pdm-metric-label" title={BID_EDGE_TOOLTIP}>
                    Bid Edge
                  </span>
                  <span className="pdm-metric-value">
                    {maskEngineMetrics && bidEdge === undefined ? (
                      <ResearchEngineValueLoading label="Loading bid edge" />
                    ) : (
                      formatSignedDollarWhole(bidEdge)
                    )}
                  </span>
                </div>
                {!maxBidEqualsRecommended && maxBid != null ? (
                  <div className="pdm-metric pdm-metric--secondary" role="listitem">
                    <span className="pdm-metric-label" title={RESEARCH_TABLE_TOOLTIP_MAX_BID}>
                      Max Bid
                    </span>
                    <span className="pdm-metric-value">
                      {maskEngineMetrics ? (
                        <ResearchEngineValueLoading label="Loading max bid" />
                      ) : (
                        formatCurrencyWhole(maxBid)
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
              {player.recommended_bid_note?.trim() ? (
                <p className="pdm-engine-note">{player.recommended_bid_note.trim()}</p>
              ) : null}
              {player.edge_note?.trim() ? (
                <p className="pdm-engine-note">{player.edge_note.trim()}</p>
              ) : null}
              </>
              )}
            </section>

            <section className="pdm-snapshot-section" aria-label="Performance snapshot">
              {batting || pitching ? (
                <div
                  className={
                    batting && pitching ? "pdm-snapshot-split" : "pdm-snapshot-single"
                  }
                >
                  {batting ? (
                    <div className="pdm-stat-group">
                      <h4>Batting</h4>
                      <div className="pdm-compare">
                        <div className="pdm-compare-head">
                          <span className="pdm-compare-corner">Stat</span>
                          <span>PROJ</span>
                          <span>1Y</span>
                          <span>3Y</span>
                        </div>
                        <div className="pdm-compare-row"><span>AVG</span><span>{valueOrDash(projectionBat?.avg)}</span><span>{valueOrDash(batting.avg)}</span><span>{valueOrDash(stats3yrBat?.avg)}</span></div>
                        <div className="pdm-compare-row"><span>HR</span><span>{valueOrDash(projectionBat?.hr)}</span><span>{valueOrDash(batting.hr)}</span><span>{valueOrDash(stats3yrBat?.hr)}</span></div>
                        <div className="pdm-compare-row"><span>RBI</span><span>{valueOrDash(projectionBat?.rbi)}</span><span>{valueOrDash(batting.rbi)}</span><span>{valueOrDash(stats3yrBat?.rbi)}</span></div>
                        <div className="pdm-compare-row"><span>R</span><span>{valueOrDash(projectionBat?.runs)}</span><span>{valueOrDash(batting.runs)}</span><span>{valueOrDash(stats3yrBat?.runs)}</span></div>
                        <div className="pdm-compare-row"><span>SB</span><span>{valueOrDash(projectionBat?.sb)}</span><span>{valueOrDash(batting.sb)}</span><span>{valueOrDash(stats3yrBat?.sb)}</span></div>
                      </div>
                    </div>
                  ) : null}
                  {pitching ? (
                    <div className="pdm-stat-group">
                      <h4>Pitching</h4>
                      <div className="pdm-compare">
                        <div className="pdm-compare-head">
                          <span className="pdm-compare-corner">Stat</span>
                          <span>PROJ</span>
                          <span>1Y</span>
                          <span>3Y</span>
                        </div>
                        <div className="pdm-compare-row"><span>ERA</span><span>{valueOrDash(projectionPit?.era)}</span><span>{valueOrDash(pitching.era)}</span><span>{valueOrDash(stats3yrPit?.era)}</span></div>
                        <div className="pdm-compare-row"><span>WHIP</span><span>{valueOrDash(projectionPit?.whip)}</span><span>{valueOrDash(pitching.whip)}</span><span>{valueOrDash(stats3yrPit?.whip)}</span></div>
                        <div className="pdm-compare-row"><span>W</span><span>{valueOrDash(projectionPit?.wins)}</span><span>{valueOrDash(pitching.wins)}</span><span>{valueOrDash(stats3yrPit?.wins)}</span></div>
                        <div className="pdm-compare-row"><span>SV</span><span>{valueOrDash(projectionPit?.saves)}</span><span>{valueOrDash(pitching.saves)}</span><span>{valueOrDash(stats3yrPit?.saves)}</span></div>
                        <div className="pdm-compare-row"><span>K</span><span>{valueOrDash(projectionPit?.strikeouts)}</span><span>{valueOrDash(pitching.strikeouts)}</span><span>{valueOrDash(stats3yrPit?.strikeouts)}</span></div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="pdm-empty">No stat lines available for this player.</p>
              )}
            </section>

            <div className="pdm-lower-disclosures">
              {showWhyThisValue ? (
                <details className="pdm-lower-details pdm-valuation-explain">
                  <summary className="pdm-lower-summary">Why this value?</summary>
                  {valuationExplainLoading ? (
                    <p className="pdm-explain-loading" role="status">
                      Loading explanation…
                    </p>
                  ) : null}
                  {typeof player.baseline_value === "number" &&
                  Number.isFinite(player.baseline_value) ? (
                    <dl className="pdm-explain-kv-dl pdm-baseline-strength-dl">
                      <dt title={BASELINE_STRENGTH_TOOLTIP}>Baseline Strength</dt>
                      <dd>{formatCurrencyWhole(player.baseline_value)}</dd>
                    </dl>
                  ) : null}
                  {maxBid != null ? (
                    <p className="pdm-max-bid-explain">
                      <strong title={RESEARCH_TABLE_TOOLTIP_MAX_BID}>Max Bid:</strong>{" "}
                      {formatCurrencyWhole(maxBid)} hard stop
                      {maxBidEqualsRecommended ? (
                        <span className="pdm-max-bid-explain-note">
                          {" "}
                          (same as Recommended Bid)
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <ValuationExplainSections
                    explain={player.valuation_explain ?? null}
                    boardWarnings={valuationContextWarnings}
                  />
                </details>
              ) : null}
              {showValuationContextDebug ? (
                <details className="pdm-lower-details pdm-valuation-context-dev">
                  <summary className="pdm-lower-summary">valuation_context (debug)</summary>
                  <pre className="pdm-valuation-context-pre">
                    {JSON.stringify(valuationContextDev, null, 2)}
                  </pre>
                </details>
              ) : null}
              {showModelNotesBody ? (
                <details className="pdm-lower-details pdm-model-details">
                  <summary className="pdm-lower-summary">Model notes</summary>
                    {player.outlook?.trim() ? (
                      <div className="pdm-note-block">
                        <h4>Outlook</h4>
                        <p className="pdm-outlook pdm-outlook--expanded">{player.outlook.trim()}</p>
                      </div>
                    ) : null}
                    {player.why?.length ? (
                      <div className="pdm-note-block">
                        <ul className="pdm-why-lines">
                          {player.why.map((line, i) => (
                            <li key={i}>{truncateExplainText(line, 220)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {player.explain_v2 ? (
                      <div className="pdm-note-block pdm-note-block--explain-v2">
                        <div className="pdm-explain-v2-head">
                          <h4 className="pdm-explain-v2-title">Model read</h4>
                          <div className="pdm-explain-v2-badges">
                            <span className="pdm-explain-v2-indicator">{player.explain_v2.indicator}</span>
                            {typeof player.explain_v2.confidence === "number" &&
                            Number.isFinite(player.explain_v2.confidence) ? (
                              <span className="pdm-explain-v2-confidence">
                                {Math.round(player.explain_v2.confidence * 100)}% confidence
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {player.explain_v2.adjustments ? (
                          <div className="pdm-explain-v2-adjustments" aria-label="Model adjustment totals">
                            <span className="pdm-explain-v2-adj">
                              <span className="pdm-explain-v2-adj__k">League inflation</span>
                              <span className="pdm-explain-v2-adj__v">
                                {formatSignedWhole(player.explain_v2.adjustments.inflation)}
                              </span>
                            </span>
                            <span className="pdm-explain-v2-adj">
                              <span className="pdm-explain-v2-adj__k">Scarcity</span>
                              <span className="pdm-explain-v2-adj__v">
                                {formatSignedWhole(player.explain_v2.adjustments.scarcity)}
                              </span>
                            </span>
                            <span className="pdm-explain-v2-adj">
                              <span className="pdm-explain-v2-adj__k">Other</span>
                              <span className="pdm-explain-v2-adj__v">
                                {formatSignedWhole(player.explain_v2.adjustments.other)}
                              </span>
                            </span>
                          </div>
                        ) : null}
                        {player.explain_v2.drivers?.length ? (
                          <div className="pdm-explain-v2-drivers">
                            {player.explain_v2.drivers.slice(0, 4).map((d, i) => {
                              const { preview, full } = summarizeDriverReason(d.reason);
                              const showMore = preview !== full;
                              const tone = d.impact > 0 ? "pos" : d.impact < 0 ? "neg" : "neutral";
                              return (
                                <div
                                  key={`${i}-${d.label}`}
                                  className={`pdm-explain-v2-driver pdm-explain-v2-driver--${tone}`}
                                >
                                  <div className="pdm-explain-v2-driver__top">
                                    <span className="pdm-explain-v2-driver-name">{d.label}</span>
                                    <span className={`pdm-explain-v2-impact pdm-explain-v2-impact--${tone}`}>
                                      {formatSignedWhole(d.impact)}
                                    </span>
                                  </div>
                                  <p className="pdm-explain-v2-preview">{preview}</p>
                                  {showMore ? (
                                    <details className="pdm-explain-v2-expand">
                                      <summary className="pdm-explain-v2-expand__summary">Full engine note</summary>
                                      <p className="pdm-explain-v2-full">
                                        {truncateExplainText(full, 520)}
                                      </p>
                                    </details>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {player.market_notes?.length ? (
                      <div className="pdm-note-block">
                        <h4>Market notes</h4>
                        <ul>
                          {player.market_notes.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                </details>
              ) : null}
            </div>
          </div>
        </div>

        <section className="pdm-player-notes" aria-labelledby="pdm-player-notes-heading">
          <h3 id="pdm-player-notes-heading" className="pdm-section-heading">
            Player notes
          </h3>
          <div className="pdm-draft-notes-field">
            <textarea
              className="pdm-draft-notes__textarea"
              aria-labelledby="pdm-player-notes-heading"
              value={note ?? ""}
              placeholder={
                depthChartOnly
                  ? "Notes require a catalog player record."
                  : "Capture target bid, fallback options, roster fit, and risk notes…"
              }
              disabled={depthChartOnly}
              title={
                depthChartOnly ? WATCHLIST_REQUIRES_CATALOG_TOOLTIP : undefined
              }
              onChange={(event) => {
                onNoteChange?.(player.id, event.target.value);
              }}
            />
          </div>
        </section>

        <footer className="pdm-modal-footer">
          <p className="pdm-basis-foot">{statBasisFooterDescription(statBasis)}</p>
          <div className="pdm-actions">
            <button type="button" className="pdm-btn pdm-btn--secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="pdm-btn pdm-btn--primary"
              disabled={depthChartOnly}
              title={depthChartOnly ? COMMAND_CENTER_REQUIRES_CATALOG_TOOLTIP : undefined}
              onClick={() => onMoveToCommandCenter(player)}
            >
              Draft in Command Center
            </button>
          </div>
        </footer>
      </div>
      </div>
    </div>
  );
}
