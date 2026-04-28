import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { useParams } from "react-router";
import PosBadge from "./PosBadge";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { Player } from "../types/player";
import { addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { getStatByCategory } from "../pages/commandCenterUtils";
import {
  getValuationPlayer,
  type ValuationResponse,
  type ValuationResult,
} from "../api/engine";
import {
  mergeValuationBoardRowIntoPrevious,
  normalizeValuationResultRow,
  valuationRowPipelineSnapshot,
} from "../api/valuationNormalize";
import { resolveUserTeamId } from "../utils/team";
import {
  normalizeValuationPlayerId,
  commandCenterWalletCapsFromMyTeam,
  formatDollar,
} from "../utils/valuation";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
  valuationResultNumbersEqual,
  valuationResultStableKey,
} from "../utils/valuationDeps";

import {
  getEligibleSlotsForPositions,
  hasPitcherEligibility,
} from "../utils/eligibility";
import { UserPlus } from "lucide-react";
import CustomPlayerHeadshot from "./CustomPlayerHeadshot";


const formatEngineMoney = (n: number | undefined) => formatDollar(n);

function formatSuggestedBidLine(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatDollar(Math.round(n));
}

function formatEdgeLine(edge: number | undefined): string {
  if (edge === undefined || !Number.isFinite(edge)) return "—";
  const rounded = Math.round(edge);
  const absText = String(Math.abs(rounded));
  if (rounded > 0) return `+${absText}`;
  if (rounded < 0) return `-${absText}`;
  return "0";
}

function MetricTile({
  label,
  value,
  delta,
  variant = "default",
  title,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  variant?: "default" | "primary";
  title?: string;
}) {
  return (
    <div
      className={
        "bdc-metric-tile" +
        (variant === "primary" ? " bdc-metric-tile--primary" : "")
      }
      title={title}
    >
      <span className="bdc-metric-tile-label">{label}</span>
      <div className="bdc-metric-tile-value">{value}</div>
      {delta != null ? (
        <div className="bdc-metric-tile-delta">{delta}</div>
      ) : null}
    </div>
  );
}

/** Same finite merge as `mergeDisplayValuationRow` for your value and recommended bid only. */
function cleanedYourValueAndRecommendedBid(
  valuationRow: ValuationResult | undefined | null,
  player: Player,
): { yourValue: number; bid: number } | null {
  const yourValue =
    engineFiniteOrNull(valuationRow?.team_adjusted_value) ??
    engineFiniteOrNull(player.team_adjusted_value);
  const bid =
    engineFiniteOrNull(valuationRow?.recommended_bid) ??
    engineFiniteOrNull(player.recommended_bid);
  if (yourValue == null || bid == null) return null;
  return { yourValue, bid };
}

function valueMinusBidDeltaRounded(yourValue: number, bid: number): number {
  return Math.round(yourValue - bid);
}

function verdictFromValueMinusBid(delta: number): {
  tone: "pos" | "neg" | "muted";
  cardTone: "overpay" | "value" | "fair";
  danger: boolean;
  strong: boolean;
  label: string;
} {
  const cardTone =
    delta < -10 ? "overpay" : delta > 5 ? "value" : "fair";
  const danger = delta < -15;
  const strong = delta > 10;
  const tone =
    delta > 2 ? "pos" : delta < -2 ? "neg" : "muted";
  const label =
    delta > 0 ? "Strong Value" : delta < 0 ? "Overpay" : "Fair Price";
  return { tone, cardTone, danger, strong, label };
}

function PlayerIdentityCard({
  selectedPlayer,
  tierValue,
  adpValue,
  adpTitle,
  valueVsBidBadge,
  isInWatchlist,
  playerNote,
  setPlayerNote,
}: {
  selectedPlayer: Player;
  tierValue: number;
  adpValue: number;
  adpTitle: string;
  valueVsBidBadge: {
    deltaText: string;
    label: string;
    tone: "pos" | "neg" | "muted";
  } | null;
  isInWatchlist: (id: string) => boolean;
  playerNote: string;
  setPlayerNote: (value: string) => void;
}) {
  return (
    <div className="player-identity-card command-center-header">
      <div className="pic-layout">
        <div className="pic-player-col">
          <div className="pic-row">
            {selectedPlayer.id.startsWith("custom_") || !selectedPlayer.headshot ? (
                <CustomPlayerHeadshot size={52} className="pac-headshot pac-headshot--identity" />
              ) : (
                <img
                  src={selectedPlayer.headshot}
                  alt=""
                  className="pac-headshot pac-headshot--identity"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            <div className="pic-identity-text">
              <h1 className="pac-name pac-name--identity">
                {selectedPlayer.name}
                {selectedPlayer.injuryStatus && (
                  <span className="pt-il-badge">
                    {selectedPlayer.injuryStatus.replace("DL", "IL")}
                  </span>
                )}
                {isInWatchlist(selectedPlayer.id) && (
                  <span className="pac-wl-badge" title="On your watchlist">
                    ★
                  </span>
                )}
              </h1>
              <div className="pac-meta-inline">
                <span className="pac-meta-inline-badges">
                  {(selectedPlayer.positions?.length
                    ? selectedPlayer.positions
                    : [selectedPlayer.position]
                  ).map((pos) => (
                    <PosBadge key={pos} pos={pos} />
                  ))}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span className="pac-meta-inline-team" title={selectedPlayer.team}>
                  {selectedPlayer.team}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span
                  className="pac-tier-badge pac-tier-badge--inline"
                  style={{
                    background:
                      [
                        "#a855f7",
                        "#6366f1",
                        "#22c55e",
                        "#f59e0b",
                        "#6b7280",
                      ][tierValue - 1] ?? "#6b7280",
                  }}
                >
                  T{tierValue}
                </span>
                <span className="pac-meta-dot" aria-hidden>
                  ·
                </span>
                <span className="pac-meta-inline-adp" title={adpTitle}>
                  ADP {adpValue}
                </span>
                {valueVsBidBadge ? (
                  <>
                    <span className="pac-meta-dot" aria-hidden>
                      ·
                    </span>
                    <span
                      className={
                        "pic-vb-badge pic-vb-badge--inline pic-vb-badge--" +
                        valueVsBidBadge.tone
                      }
                      title="Your Value minus recommended bid (rounded), after finite cleanup"
                    >
                      <span className="pic-vb-badge-delta">
                        {valueVsBidBadge.deltaText}
                      </span>
                      <span className="pic-vb-badge-label">
                        {valueVsBidBadge.label}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="pic-notes-col">
          <label className="pac-notes-col-label" htmlFor="pac-note-player">
            PLAYER NOTES
          </label>
          <textarea
            id="pac-note-player"
            className="pac-notes pac-notes--identity"
            value={playerNote}
            onChange={(e) => setPlayerNote(e.target.value)}
            placeholder="Scouting notes, injury watch, platoon risk…"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

function engineFiniteOrNull(
  n: number | undefined | null,
): number | null {
  if (n == null) return null;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function impactLabelParts(catName: string): { primary: string; secondary?: string } {
  const shortFromParen = catName.match(/\(([^)]+)\)$/)?.[1];
  const map: Record<string, string> = {
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
  };
  const canonical = catName === "Walks + Hits per IP" ? "WHIP" : catName;
  const mapped = map[canonical.toUpperCase()] ?? map[canonical] ?? canonical;
  if (mapped.length <= 14) return { primary: mapped };
  if (shortFromParen && shortFromParen.length <= 8)
    return { primary: shortFromParen, secondary: mapped };
  const compact = mapped
    .replace("Percentage", "Pct")
    .replace("Strikeouts", "Ks")
    .replace("Runs Batted In", "RBI");
  return compact.length <= 14
    ? { primary: compact, secondary: mapped }
    : { primary: mapped.slice(0, 14).trim() };
}

/** `recommended_bid` capped by max bid (wallet); never falls back to other valuation fields. */
function actionableBidFromRecommendedAndMaxBid(
  row: ValuationResult | undefined,
  maxBid: number | undefined | null,
): number | null {
  const r = row ? engineFiniteOrNull(row.recommended_bid) : null;
  if (r == null) return null;
  if (maxBid != null && Number.isFinite(maxBid)) return Math.min(r, maxBid);
  return r;
}

/** Merge engine row with catalog `Player` optional valuation fields when the row omits them. */
function mergeDisplayValuationRow(
  row: ValuationResult | undefined,
  player: Player,
): ValuationResult | undefined {
  if (!row) return undefined;
  return {
    ...row,
    recommended_bid:
      engineFiniteOrNull(row.recommended_bid) ??
      engineFiniteOrNull(player.recommended_bid) ??
      row.recommended_bid,
    team_adjusted_value:
      engineFiniteOrNull(row.team_adjusted_value) ??
      engineFiniteOrNull(player.team_adjusted_value) ??
      row.team_adjusted_value,
    adjusted_value:
      engineFiniteOrNull(row.adjusted_value) ??
      engineFiniteOrNull(player.adjusted_value) ??
      row.adjusted_value,
    baseline_value:
      engineFiniteOrNull(row.baseline_value) ??
      engineFiniteOrNull(player.baseline_value) ??
      row.baseline_value,
    edge: engineFiniteOrNull(row.edge) ?? undefined,
  };
}

function BidDecisionCard({
  valuationRow,
  selectedPlayer,
}: {
  valuationRow: ValuationResult | null | undefined;
  selectedPlayer: Player;
}) {
  const row = valuationRow ?? null;

  const cleanedPair = cleanedYourValueAndRecommendedBid(row, selectedPlayer);
  const computedDelta =
    cleanedPair != null
      ? valueMinusBidDeltaRounded(cleanedPair.yourValue, cleanedPair.bid)
      : null;
  const computedVerdict =
    computedDelta != null ? verdictFromValueMinusBid(computedDelta) : null;

  const decisionData = {
    team_adjusted_value: row ? engineFiniteOrNull(row.team_adjusted_value) : null,
    recommended_bid: row ? engineFiniteOrNull(row.recommended_bid) : null,
    adjusted_value: row ? engineFiniteOrNull(row.adjusted_value) : null,
    baseline_value: row ? engineFiniteOrNull(row.baseline_value) : null,
    edge: row ? engineFiniteOrNull(row.edge) : null,
  };

  useEffect(() => {
    if (row == null) return;
    if (
      decisionData.recommended_bid == null ||
      decisionData.team_adjusted_value == null
    ) {
      const cat = selectedPlayer;
      console.warn(
        "BidDecisionCard missing valuation fields (merge/API gap: no finite value on merged engine+catalog row after catalog fill)",
        {
          player_id: selectedPlayer.id,
          name: selectedPlayer.name,
          finiteRecommendedBid: decisionData.recommended_bid,
          recommended_bid: decisionData.recommended_bid,
          team_adjusted_value: decisionData.team_adjusted_value,
          adjusted_value: decisionData.adjusted_value,
          baseline_value: decisionData.baseline_value,
          edge_api: decisionData.edge,
          value_minus_bid_rounded_ui: computedDelta,
          catalog_had_finite: {
            recommended_bid:
              cat.recommended_bid != null && Number.isFinite(cat.recommended_bid),
            team_adjusted_value:
              cat.team_adjusted_value != null &&
              Number.isFinite(cat.team_adjusted_value),
            adjusted_value:
              cat.adjusted_value != null && Number.isFinite(cat.adjusted_value),
            baseline_value:
              cat.baseline_value != null && Number.isFinite(cat.baseline_value),
            value: cat.value != null && Number.isFinite(cat.value),
          },
          merged_row: row,
        },
      );
    }
  }, [
    row,
    decisionData.recommended_bid,
    decisionData.team_adjusted_value,
    decisionData.adjusted_value,
    decisionData.baseline_value,
    decisionData.edge,
    computedDelta,
    selectedPlayer,
  ]);

  const decisionTone = computedVerdict?.cardTone ?? "fair";
  const decisionDanger = computedVerdict?.danger ?? false;
  const decisionStrong = computedVerdict?.strong ?? false;

  const displayBid = cleanedPair?.bid ?? decisionData.recommended_bid;
  const displayYour = cleanedPair?.yourValue ?? decisionData.team_adjusted_value;
  const displayDraftroomValue =
    decisionData.adjusted_value ??
    engineFiniteOrNull(selectedPlayer.adjusted_value);
  const displayBaseValue =
    decisionData.baseline_value ??
    engineFiniteOrNull(selectedPlayer.baseline_value);

  const recommendedBidDisplay =
    displayBid == null ? null : formatSuggestedBidLine(displayBid);

  const fmtMoney = (n: number | null) =>
    n != null ? formatEngineMoney(n) : "—";

  return (
    <div
      className={"bid-decision-card bdc-tone--" + decisionTone}
      aria-label="Valuation"
    >
      <div className="bdc-grid">
        <div className="bdc-metric-row">
          <div
            className="bdc-metric-grid bdc-metric-grid--focus3 bdc-metric-grid--focus-boxes"
            aria-label="Market price, your value, draftroom value, and base value"
          >
            <MetricTile
              label="Market Price"
              title="Engine recommended_bid (expected auction clearing price)"
              value={
                recommendedBidDisplay != null ? (
                  <span
                    className={
                      "bdc-focus-value bdc-recommended-value" +
                      (decisionDanger ? " bdc-recommended-value--danger" : "") +
                      (decisionStrong ? " bdc-recommended-value--strong" : "")
                    }
                  >
                    {recommendedBidDisplay}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <MetricTile
              label="Your Value"
              title="team_adjusted_value — intrinsic value for your roster (same finite cleanup as edge)"
              value={
                <span className="bdc-focus-value">
                  {fmtMoney(displayYour)}
                </span>
              }
            />
            <MetricTile
              label="Draftroom Value"
              title="adjusted_value — league-wide value in the current draft context"
              value={
                <span className="bdc-focus-value">
                  {fmtMoney(displayDraftroomValue)}
                </span>
              }
            />
            <MetricTile
              label="Base Value"
              title="baseline_value — neutral baseline projection before roster/context adjustments"
              value={
                <span className="bdc-focus-value">{fmtMoney(displayBaseValue)}</span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface AuctionCenterProps {
  rosterEntries: RosterEntry[];
  refreshRoster: () => void;
  allPlayers: Player[];
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  draftedIds: Set<string>;
  myTeamEntries: RosterEntry[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  onAddMissingPlayer?: () => void;
  /** Parent-fetched valuation board (same as Command Center engine snapshot; avoids duplicate getValuation). */
  engineMarket?: ValuationResponse | null;
}

export function AuctionCenter({
  rosterEntries,
  refreshRoster,
  allPlayers,
  selectedPlayer,
  setSelectedPlayer,
  draftedIds,
  myTeamEntries,
  showToast,
  onAddMissingPlayer,
  engineMarket = null,
}: AuctionCenterProps) {
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const { isInWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  const [valuationMap, setValuationMap] = useState<
    Map<string, ValuationResult>
  >(new Map());
  /** True while the active per-player Engine `getValuationPlayer` request is in flight. */
  const [playerEngineFetchPending, setPlayerEngineFetchPending] =
    useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const [wonBy, setWonBy] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  /** True after user edits bid $; avoids overwriting with late Engine payload. */
  const bidPriceTouchedRef = useRef(false);
  const [draftNotesHeight, setDraftNotesHeight] = useState(180);
  const [draftedToSlot, setDraftedToSlot] = useState("");
  const [statView, setStatView] = useState<"hitting" | "pitching">("pitching");
  const [submitting, setSubmitting] = useState(false);
  const [redoStack, setRedoStack] = useState<RosterEntry[]>([]);

  const onDraftNotesResizeStart = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = draftNotesHeight;
      const onMove = (evt: MouseEvent) => {
        const maxAllowedHeight = Math.max(
          120,
          (contentScrollRef.current?.clientHeight ?? startHeight) - 8,
        );
        const next = Math.max(
          120,
          Math.min(maxAllowedHeight, startHeight + (startY - evt.clientY)),
        );
        setDraftNotesHeight(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [draftNotesHeight],
  );

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  const userTeamId = useMemo(
    () => resolveUserTeamId(league ?? null, user?.id),
    [league?.id, league?.memberIds?.join(","), user?.id],
  );

  const selectedPlayerNormId = useMemo(
    () => (selectedPlayer?.id ? normalizeValuationPlayerId(selectedPlayer.id) : ""),
    [selectedPlayer?.id],
  );

  const selectedPlayerValuationKey = useMemo(() => {
    if (!selectedPlayerNormId) return "";
    const v = valuationMap.get(selectedPlayerNormId);
    if (!v) return `missing:${selectedPlayerNormId}`;
    return valuationResultStableKey(v);
  }, [selectedPlayerNormId, valuationMap]);

  const activeValuationRow = useMemo(() => {
    if (!selectedPlayerNormId) return undefined;
    return valuationMap.get(selectedPlayerNormId);
  }, [selectedPlayerNormId, selectedPlayerValuationKey, valuationMap]);

  const displayValuationRow = useMemo(() => {
    if (!selectedPlayer) return undefined;
    return mergeDisplayValuationRow(activeValuationRow, selectedPlayer);
  }, [activeValuationRow, selectedPlayer]);

  /** Single row for card, bid default, and actionable math (catalog fills engine gaps). */
  const mergedValuationRow = useMemo(
    () => displayValuationRow ?? activeValuationRow ?? undefined,
    [displayValuationRow, activeValuationRow],
  );

  useLayoutEffect(() => {
    if (!leagueId || !token || !selectedPlayer) {
      setPlayerEngineFetchPending(false);
      return;
    }
    setPlayerEngineFetchPending(true);
  }, [
    leagueId,
    token,
    selectedPlayer?.id,
    leagueValuationKey,
    rosterValuationKey,
    userTeamId,
  ]);

  /** Hide merged/catalog numbers until the latest player valuation response lands (avoids flash). */
  const rowForValuationUi =
    playerEngineFetchPending && selectedPlayerNormId
      ? undefined
      : mergedValuationRow;

  const myTeamWalletFingerprint = useMemo(
    () =>
      myTeamEntries
        .map((e) => `${e._id}:${e.price}:${e.rosterSlot ?? ""}`)
        .sort()
        .join("|"),
    [myTeamEntries],
  );

  const myWalletCaps = useMemo(() => {
    if (!league || !user?.id || !league.memberIds.includes(user.id))
      return null;
    return commandCenterWalletCapsFromMyTeam(league, myTeamEntries);
  }, [league, user?.id, myTeamWalletFingerprint]);

  const identityValueVsBidBadge = useMemo(() => {
    if (!selectedPlayer) return null;
    const cleaned = cleanedYourValueAndRecommendedBid(
      rowForValuationUi ?? null,
      selectedPlayer,
    );
    if (!cleaned) return null;
    const delta = valueMinusBidDeltaRounded(cleaned.yourValue, cleaned.bid);
    const v = verdictFromValueMinusBid(delta);
    return {
      deltaText: formatEdgeLine(delta),
      label: v.label,
      tone: v.tone,
    };
  }, [rowForValuationUi, selectedPlayer]);

  const hasBidSignal = Boolean(
    rowForValuationUi &&
      (engineFiniteOrNull(rowForValuationUi.recommended_bid) != null ||
        engineFiniteOrNull(rowForValuationUi.team_adjusted_value) != null),
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedPlayer) return;
    const p = selectedPlayer;
    const maxB =
      myWalletCaps != null && Number.isFinite(myWalletCaps.maxBid)
        ? myWalletCaps.maxBid
        : null;
    const eng = activeValuationRow;
    const merged = displayValuationRow;
    const cardRow = mergedValuationRow;

    const nullRowSnap = (label: string) => ({
      source: label,
      player_id: p.id,
      name: p.name,
      recommended_bid: null,
      team_adjusted_value: null,
      adjusted_value: null,
      baseline_value: null,
      edge: null,
      finite_recommended_bid: null as number | null,
      max_bid: maxB,
    });

    const catalogSnap = {
      source: "1_raw_catalog_player",
      player_id: p.id,
      name: p.name,
      recommended_bid: p.recommended_bid ?? null,
      team_adjusted_value: p.team_adjusted_value ?? null,
      adjusted_value: p.adjusted_value ?? null,
      baseline_value: p.baseline_value ?? null,
      edge: null,
      finite_recommended_bid: engineFiniteOrNull(p.recommended_bid),
      max_bid: maxB,
    };

    const engineSnap = eng
      ? {
          source: "2_matched_engine_row",
          player_id: eng.player_id,
          name: eng.name,
          recommended_bid: eng.recommended_bid ?? null,
          team_adjusted_value: eng.team_adjusted_value ?? null,
          adjusted_value: eng.adjusted_value ?? null,
          baseline_value: eng.baseline_value ?? null,
          edge: eng.edge ?? null,
          finite_recommended_bid: engineFiniteOrNull(eng.recommended_bid),
          max_bid: maxB,
        }
      : nullRowSnap("2_matched_engine_row (none)");

    const finalSnap = cardRow
      ? {
          source: "3_final_row_passed_to_BidDecisionCard",
          player_id: cardRow.player_id,
          name: cardRow.name,
          recommended_bid: cardRow.recommended_bid ?? null,
          team_adjusted_value: cardRow.team_adjusted_value ?? null,
          adjusted_value: cardRow.adjusted_value ?? null,
          baseline_value: cardRow.baseline_value ?? null,
          edge: cardRow.edge ?? null,
          finite_recommended_bid: engineFiniteOrNull(cardRow.recommended_bid),
          max_bid: maxB,
        }
      : nullRowSnap("3_final_row_passed_to_BidDecisionCard (none)");

    const actionablePreview =
      cardRow != null
        ? actionableBidFromRecommendedAndMaxBid(cardRow, maxB)
        : null;

    console.log("[BidDecisionCard valuation diagnostic]", {
      raw_catalog_player: catalogSnap,
      matched_engine_row: engineSnap,
      final_row_passed_to_BidDecisionCard: finalSnap,
      actionableBid_preview: actionablePreview,
      engine_missing_catalog_had: eng
        ? {
            recommended_bid:
              (eng.recommended_bid == null || !Number.isFinite(eng.recommended_bid)) &&
              p.recommended_bid != null &&
              Number.isFinite(p.recommended_bid),
            team_adjusted_value:
              (eng.team_adjusted_value == null ||
                !Number.isFinite(eng.team_adjusted_value)) &&
              p.team_adjusted_value != null &&
              Number.isFinite(p.team_adjusted_value),
          }
        : null,
      merge_recovered_field: merged && eng
        ? {
            recommended_bid:
              (eng.recommended_bid == null || !Number.isFinite(eng.recommended_bid)) &&
              merged.recommended_bid != null &&
              Number.isFinite(merged.recommended_bid),
            team_adjusted_value:
              (eng.team_adjusted_value == null ||
                !Number.isFinite(eng.team_adjusted_value)) &&
              merged.team_adjusted_value != null &&
              Number.isFinite(merged.team_adjusted_value),
          }
        : null,
    });

    const nid = normalizeValuationPlayerId(p.id);
    const mapEntry = valuationMap.get(nid);
    console.info("[valuation pipeline]", {
      source: "draftroom_ui",
      note: "A–D: logs with source=api_client_http from getValuation (A,B) and getValuationPlayer (C,D).",
      selected_player_id: nid,
      E_valuationMap_entry: valuationRowPipelineSnapshot(mapEntry),
      F_mergedValuationRow_for_BidDecisionCard: valuationRowPipelineSnapshot(
        mergedValuationRow,
      ),
      catalog_player_valuation_fields: {
        player_id: p.id,
        recommended_bid: p.recommended_bid ?? null,
        team_adjusted_value: p.team_adjusted_value ?? null,
        edge: null,
        adjusted_value: p.adjusted_value ?? null,
        baseline_value: p.baseline_value ?? null,
        value: p.value,
      },
    });
  }, [
    selectedPlayer,
    activeValuationRow,
    displayValuationRow,
    mergedValuationRow,
    myWalletCaps,
    valuationMap,
  ]);

  // Merge board valuations from Command Center’s single engine snapshot (no duplicate getValuation).
  useEffect(() => {
    if (!engineMarket?.valuations?.length) return;
    setValuationMap((prev) => {
      const next = new Map(prev);
      for (const v of engineMarket.valuations) {
        const id = normalizeValuationPlayerId(v.player_id);
        const boardRow = normalizeValuationResultRow(
          v as unknown as Record<string, unknown>,
        );
        boardRow.player_id = id;
        const prevRow = next.get(id);
        next.set(id, mergeValuationBoardRowIntoPrevious(prevRow, boardRow));
      }
      return next;
    });
  }, [engineMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV || !engineMarket?.valuations?.length || !selectedPlayer)
      return;
    const nid = normalizeValuationPlayerId(selectedPlayer.id);
    const inBoard = engineMarket.valuations.some(
      (x) => normalizeValuationPlayerId(x.player_id) === nid,
    );
    if (!inBoard) return;
    const vr = valuationMap.get(nid);
    if (!vr) {
      console.warn(
        "[AuctionCenter] engine snapshot lists player but valuationMap has no row",
        { player_id: nid },
      );
      return;
    }
    if (
      typeof vr.recommended_bid !== "number" ||
      !Number.isFinite(vr.recommended_bid) ||
      typeof vr.team_adjusted_value !== "number" ||
      !Number.isFinite(vr.team_adjusted_value)
    ) {
      console.warn(
        "[AuctionCenter] valuation row for board player missing recommended_bid or team_adjusted_value",
        {
          player_id: nid,
          recommended_bid: vr.recommended_bid,
          team_adjusted_value: vr.team_adjusted_value,
        },
      );
    }
  }, [engineMarket, selectedPlayer, valuationMap, selectedPlayerNormId]);

  // Lighter per-player refresh when the card changes (merges into map; full board still on roster change).
  useEffect(() => {
    if (!leagueId || !token || !selectedPlayer) {
      setPlayerEngineFetchPending(false);
      return;
    }
    const playerIdRaw = selectedPlayer.id;
    const playerId = normalizeValuationPlayerId(playerIdRaw);
    if (import.meta.env.DEV) {
      console.info("[valuation player request]", {
        selected_player_id: playerId,
        request_url: `/api/engine/leagues/${leagueId}/valuation/player`,
        request_body: {
          player_id: String(playerIdRaw),
          user_team_id: userTeamId,
          inflation_model: "replacement_slots_v2",
        },
      });
    }
    let cancelled = false;
    void getValuationPlayer(leagueId, token, String(playerIdRaw), userTeamId)
      .then((res) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          const responseRow =
            res.player ??
            (Array.isArray(res.valuations)
              ? res.valuations.find(
                  (x) => normalizeValuationPlayerId(x.player_id) === playerId,
                )
              : undefined);
          console.info("[valuation player response]", {
            selected_player_id: playerId,
            response_player_id: responseRow?.player_id ?? null,
            recommended_bid: responseRow?.recommended_bid ?? null,
            team_adjusted_value: responseRow?.team_adjusted_value ?? null,
            edge: responseRow?.edge ?? null,
          });
        }
        if (import.meta.env.DEV) {
          const p = res.player;
          console.info("[cc-valuation-player-response]", {
            requested_id: playerId,
            player: p,
            numeric_fields: p && {
              team_adjusted_value: p.team_adjusted_value,
              recommended_bid: p.recommended_bid,
              adjusted_value: p.adjusted_value,
              baseline_value: p.baseline_value,
            },
            valuations_len: Array.isArray(res.valuations)
              ? res.valuations.length
              : 0,
          });
        }
        let row: ValuationResult | undefined = res.player;
        if (!row && Array.isArray(res.valuations)) {
          row =
            res.valuations.find(
              (x) => normalizeValuationPlayerId(x.player_id) === playerId,
            ) ??
            (res.valuations.length === 1 ? res.valuations[0] : undefined);
        }
        if (row) {
          const normalizedRow: ValuationResult = {
            ...row,
            player_id: playerId,
          };
          setValuationMap((prev) => {
            const cur = prev.get(playerId);
            const mergedRow = mergeValuationBoardRowIntoPrevious(
              cur,
              normalizedRow,
            );
            if (cur && valuationResultNumbersEqual(cur, mergedRow)) return prev;
            const next = new Map(prev);
            next.set(playerId, mergedRow);
            return next;
          });
        }
      })
      .catch(() => {
        /* keep last full-board map; player-only is best-effort */
      })
      .finally(() => {
        if (!cancelled) setPlayerEngineFetchPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    userTeamId,
    leagueValuationKey,
    rosterValuationKey,
    selectedPlayer?.id,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Seed "Won By" default when league loads
  useEffect(() => {
    if (!league?.id || wonBy) return;
    setWonBy(league.teamNames[0] ?? "");
  }, [league?.id, league?.teamNames?.join("\u0001"), wonBy]);

  // Seed slot default when league loads
  useEffect(() => {
    if (!league?.id || draftedToSlot) return;
    setDraftedToSlot(Object.keys(league.rosterSlots)[0] ?? "SP");
  }, [league?.id, league ? JSON.stringify(league.rosterSlots) : "", draftedToSlot]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // When a new player is selected, initialise stat view + bid default (Engine row when present).
  // valuationMap is read intentionally only on player change; a separate effect syncs late Engine payloads.
  useEffect(() => {
    if (!selectedPlayer) return;
    bidPriceTouchedRef.current = false;
    setFinalPrice("");
    const isPitcher = hasPitcherEligibility(
      selectedPlayer.positions,
      selectedPlayer.position,
    );
    setStatView(isPitcher ? "pitching" : "hitting");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when selected player id changes
  }, [selectedPlayer?.id]);

  // When valuations refresh, update bid default from Engine if user has not edited the field
  useEffect(() => {
    if (!selectedPlayer || bidPriceTouchedRef.current) return;
    if (playerEngineFetchPending) return;
    const actionable = actionableBidFromRecommendedAndMaxBid(
      rowForValuationUi ?? undefined,
      myWalletCaps?.maxBid ?? null,
    );
    if (actionable != null) {
      setFinalPrice(String(Math.max(1, Math.round(actionable))));
    }
  }, [
    selectedPlayer?.id,
    selectedPlayer?.value,
    rowForValuationUi,
    myWalletCaps,
    playerEngineFetchPending,
  ]);

  const onFinalPriceChange = useCallback((value: string) => {
    bidPriceTouchedRef.current = true;
    setFinalPrice(value);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !selectedPlayer?.id) return;
    if (
      !selectedPlayerValuationKey ||
      selectedPlayerValuationKey.startsWith("missing:")
    ) {
      return;
    }
    const v = valuationMap.get(
      normalizeValuationPlayerId(selectedPlayer.id),
    );
    if (!v) return;
    console.info("[cc-valuation-change]", {
      t: new Date().toISOString(),
      player_id: v.player_id,
      baseline_value: v.baseline_value,
      adjusted_value: v.adjusted_value,
      recommended_bid: v.recommended_bid,
      team_adjusted_value: v.team_adjusted_value,
      reason: "valuation_row_key_changed",
    });
    const y = v.team_adjusted_value;
    const l = v.recommended_bid;
    const m = v.adjusted_value;
    if (
      y !== undefined &&
      l !== undefined &&
      Number.isFinite(y) &&
      Number.isFinite(l) &&
      Number.isFinite(m) &&
      y === l &&
      l === m
    ) {
      console.warn(
        "[cc-valuation-change] team_adjusted_value, recommended_bid, and adjusted_value are identical — check Engine payload.",
      );
    }
  }, [selectedPlayer?.id, selectedPlayerValuationKey]);

  const dropdownResults = (() => {
    if (searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase().trim();
    const available = allPlayers.filter((p) => !draftedIds.has(p.id));
    const scored = available.flatMap((p) => {
      const full = p.name.toLowerCase();
      const parts = full.split(/\s+/);
      if (full.startsWith(q)) return [{ p, score: 0 }];
      if (parts.some((part) => part.startsWith(q))) return [{ p, score: 1 }];
      if (parts.some((part) => part.includes(q))) return [{ p, score: 2 }];
      if (full.includes(q)) return [{ p, score: 3 }];
      return [];
    });
    return scored
      .sort((a, b) => a.score - b.score || (a.p.adp ?? 999) - (b.p.adp ?? 999))
      .map((x) => x.p)
      .slice(0, 8);
  })();

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleLogResult = async () => {
    if (!selectedPlayer || !leagueId || !token || !league) return;
    const teamIdx = league.teamNames.indexOf(wonBy);
    if (teamIdx === -1) {
      showToast("Team not found in league", "error");
      return;
    }
    const userId = league.memberIds[teamIdx]; // undefined for unjoined teams
    const teamId = `team_${teamIdx + 1}`;
    const price = parseInt(finalPrice, 10) || 1;
    const totalSlots = Object.values(league.rosterSlots).reduce(
      (a, b) => a + b,
      0,
    );
    const teamEntries = rosterEntries.filter((e) => e.teamId === teamId);
    const spent = teamEntries.reduce((s, e) => s + e.price, 0);
    const open = Math.max(0, totalSlots - teamEntries.length);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    if (price > maxBid) {
      showToast(`$${price} exceeds ${wonBy}'s max bid of $${maxBid}`, "error");
      return;
    }
    const playerName = selectedPlayer.name;
    setSubmitting(true);
    setSelectedPlayer(null);
    setFinalPrice("");
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: selectedPlayer.positions?.length
            ? selectedPlayer.positions
            : [selectedPlayer.position],
          price,
          rosterSlot: draftedToSlot,
          isKeeper: false,
          userId,
          teamId,
        },
        token,
      );
      setRedoStack([]);
      refreshRoster();
      showToast(
        `✓ ${playerName} drafted to ${draftedToSlot} for $${price}`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to log result",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!leagueId || !token || rosterEntries.length === 0) return;
    const sorted = [...rosterEntries].sort(
      (a, b) =>
        new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
        new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
    );
    const entry = sorted[sorted.length - 1];
    try {
      await removeRosterEntry(leagueId, entry._id, token);
      setRedoStack((prev) => [...prev, entry]);
      refreshRoster();
      showToast(`↩ Undid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Undo failed", "error");
    }
  };

  const handleRedo = async () => {
    if (!leagueId || !token || redoStack.length === 0 || !league) return;
    const entry = redoStack[redoStack.length - 1];
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: entry.externalPlayerId,
          playerName: entry.playerName,
          playerTeam: entry.playerTeam,
          positions: entry.positions,
          price: entry.price,
          rosterSlot: entry.rosterSlot,
          isKeeper: entry.isKeeper,
          userId: entry.userId,
          teamId: entry.teamId,
        },
        token,
      );
      setRedoStack((prev) => prev.slice(0, -1));
      refreshRoster();
      showToast(`↪ Redid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Redo failed", "error");
    }
  };

  // Derived pitching / batting stat refs
  const sp = selectedPlayer?.stats?.pitching;
  const sb = selectedPlayer?.stats?.batting;
  const k9 = sp
    ? (() => {
        const ip = parseFloat(sp.innings);
        return ip > 0 ? ((sp.strikeouts / ip) * 9).toFixed(1) : "--";
      })()
    : "--";

  // Category impact rows
  const catImpactRows = (() => {
    if (!selectedPlayer || !league?.scoringCategories)
      return [] as Array<{
        name: string;
        teamPaceStr: string;
        withPlayerStr: string;
        deltaStr: string;
        improved: boolean;
        neutral: boolean;
      }>;
    const relevantCats = league.scoringCategories.filter((cat) =>
      statView === "pitching"
        ? cat.type === "pitching"
        : cat.type === "batting",
    );
    return relevantCats.map((cat) => {
      const isRate = ["ERA", "WHIP"].includes(cat.name.toUpperCase());
      if (isRate) {
        const vals = myTeamEntries
          .map((e) => {
            const player = allPlayers.find((a) => a.id === e.externalPlayerId);
            if (!player) return 0;
            return getStatByCategory(player, cat.name, cat.type);
          })
          .filter((v) => v > 0);
        const teamPace = vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : 0;
        const playerStat = getStatByCategory(
          selectedPlayer,
          cat.name,
          cat.type,
        );
        // If either side has no data, can't compute a meaningful delta
        if (teamPace === 0 || playerStat === 0) {
          return {
            name: cat.name,
            teamPaceStr: teamPace > 0 ? teamPace.toFixed(2) : "—",
            withPlayerStr: playerStat > 0 ? playerStat.toFixed(2) : "—",
            deltaStr: "—",
            improved: false,
            neutral: true,
          };
        }
        // For ERA/WHIP, lower is better — positive delta means player improves the team.
        // Compute the actual new team average after including this player.
        const sum = vals.reduce((a, b) => a + b, 0);
        const newTeamAvg = +((sum + playerStat) / (vals.length + 1)).toFixed(2);
        const delta = +(teamPace - newTeamAvg).toFixed(2);
        return {
          name: cat.name,
          teamPaceStr: teamPace.toFixed(2),
          withPlayerStr: newTeamAvg.toFixed(2),
          deltaStr: delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2),
          improved: delta > 0,
          neutral: delta === 0,
        };
      } else {
        const teamPace = myTeamEntries.reduce((sum, entry) => {
          const player = allPlayers.find(
            (a) => a.id === entry.externalPlayerId,
          );
          return player
            ? sum + getStatByCategory(player, cat.name, cat.type)
            : sum;
        }, 0);
        const playerStat = getStatByCategory(
          selectedPlayer,
          cat.name,
          cat.type,
        );
        return {
          name: cat.name,
          teamPaceStr: Math.round(teamPace).toString(),
          withPlayerStr: Math.round(teamPace + playerStat).toString(),
          deltaStr:
            playerStat > 0
              ? `+${Math.round(playerStat)}`
              : Math.round(playerStat).toString(),
          improved: playerStat > 0,
          neutral: playerStat === 0,
        };
      }
    });
  })();

  const teamNames = league?.teamNames ?? [];
  const allSlotOptions = league?.rosterSlots
    ? Object.keys(league.rosterSlots)
    : ["SP", "RP", "C", "1B", "2B", "SS", "3B", "OF", "UTIL", "BN"];

  function getAvailableSlots(
    teamName: string,
    slots: string[],
    roster: RosterEntry[],
  ): Set<string> {
    if (!league) return new Set(slots);
    const teamIdx = league.teamNames.indexOf(teamName);
    if (teamIdx === -1) return new Set(slots);
    const teamId = `team_${teamIdx + 1}`;
    const teamRoster = roster.filter((e) => e.teamId === teamId);
    const filled = new Map<string, number>();
    teamRoster.forEach((e) => {
      filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1);
    });
    return new Set(
      slots.filter((s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1)),
    );
  }

  const eligible = selectedPlayer
    ? getEligibleSlotsForPositions(
        selectedPlayer.positions,
        allSlotOptions,
        selectedPlayer.position,
      )
    : allSlotOptions;
  const available = getAvailableSlots(wonBy, allSlotOptions, rosterEntries);
  const slotOptions = eligible.filter((s) => available.has(s));

  const hittingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "batting",
  );
  const pitchingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "pitching",
  );

  // Auto-correct draftedToSlot when player or team changes
  useEffect(() => {
    if (slotOptions.length > 0 && !slotOptions.includes(draftedToSlot)) {
      setDraftedToSlot(slotOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayer?.id, wonBy]);

  const playerImpactSection = selectedPlayer ? (
    <div className="pac-impact-wrap">
      <div className="pac-snapshot-header">
        <span className="pac-section-label">PLAYER IMPACT</span>
        <div className="stat-view-toggle">
          <button
            className={
              "svt-btn " + (statView === "hitting" ? "active" : "")
            }
            onClick={() => setStatView("hitting")}
          >
            Hitting
          </button>
          <button
            className={
              "svt-btn " + (statView === "pitching" ? "active" : "")
            }
            onClick={() => setStatView("pitching")}
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
              const raw = selectedPlayer
                ? getStatByCategory(selectedPlayer, cat.name, "pitching")
                : 0;
              const isRate = [
                "ERA",
                "WHIP",
                "WALKS + HITS PER IP",
              ].includes(cat.name.toUpperCase());
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
                    <div className="pac-impact-mini-label-sub">{labels.secondary}</div>
                  ) : null}
                  <div className="pac-impact-mini-stat">{display}</div>
                  <div
                    className={`pac-impact-mini-delta-pill pac-impact-mini-delta--${dTone}`}
                  >
                    {imp?.deltaStr ?? "—"}
                  </div>
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
                  <div className="pac-impact-mini-label-sub">{labels.secondary}</div>
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
            const raw = selectedPlayer
              ? getStatByCategory(selectedPlayer, cat.name, "batting")
              : 0;
            const isRate = ["AVG", "OBP", "SLG"].includes(
              cat.name.toUpperCase(),
            );
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
                  <div className="pac-impact-mini-label-sub">{labels.secondary}</div>
                ) : null}
                <div className="pac-impact-mini-stat">{display}</div>
                <div
                  className={`pac-impact-mini-delta-pill pac-impact-mini-delta--${dTone}`}
                >
                  {imp?.deltaStr ?? "—"}
                </div>
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
                <div className="pac-impact-mini-label-sub">{labels.secondary}</div>
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
  ) : null;

  return (
    <div className="cc-center">
      {/* Search bar + undo/redo */}
      <div className="cc-search-wrap" ref={searchRef}>
        <div className="cc-search-inner">
          <div className="auction-search-bar">
            <span className="auction-search-icon">⊕</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={
                selectedPlayer
                  ? `${selectedPlayer.name} — type to switch...`
                  : "Search player to load into auction..."
              }
              className="auction-search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(e.target.value.length >= 1);
              }}
              onFocus={() => {
                if (searchQuery.length >= 1) setShowDropdown(true);
              }}
            />
            {selectedPlayer && (
              <button
                className="cc-clear-btn"
                onClick={() => {
                  setSelectedPlayer(null);
                  setSearchQuery("");
                }}
              >
                ✕
              </button>
            )}
            <div className="cc-undo-redo">
              <button
                className="cc-ur-btn"
                title="Undo last pick"
                disabled={rosterEntries.length === 0}
                onClick={() => void handleUndo()}
              >
                ↩
              </button>
              <button
                className="cc-ur-btn"
                title="Redo last pick"
                disabled={redoStack.length === 0}
                onClick={() => void handleRedo()}
              >
                ↪
              </button>
            </div>
          </div>
          {/* {showDropdown && dropdownResults.length > 0 && (
            <div className="cc-search-dropdown">
              {dropdownResults.map((p) => (
                <button
                  key={p.id}
                  className="cc-dropdown-item"
                  onMouseDown={() => handleSelectPlayer(p)}
                >
                  <PosBadge pos={p.position} />
                  <span className="cc-dd-name">
                    {p.name}
                    {p.injuryStatus && (
                      <span className="pt-il-badge">
                        {p.injuryStatus.replace("DL", "IL")}
                      </span>
                    )}
                    {isInWatchlist(p.id) && (
                      <span className="cc-dd-wl" title="On your watchlist">
                        ★
                      </span>
                    )}
                  </span>
                  <span className="cc-dd-team">{p.team}</span>
                  <span className="cc-dd-val">${p.value}</span>
                </button>
              ))}
            </div>
          )} */}
          {showDropdown && (
            <div className="cc-search-dropdown">
              {dropdownResults.length > 0 ? (
                dropdownResults.map((p) => (
                  <button
                    key={p.id}
                    className="cc-dropdown-item"
                    onMouseDown={() => handleSelectPlayer(p)}
                  >
                    <PosBadge pos={p.position} />
                    <span className="cc-dd-name">
                      {p.name}
                      {p.injuryStatus && (
                        <span className="pt-il-badge">
                          {p.injuryStatus.replace("DL", "IL")}
                        </span>
                      )}
                      {isInWatchlist(p.id) && (
                        <span className="cc-dd-wl" title="On your watchlist">
                          ★
                        </span>
                      )}
                    </span>
                    <span className="cc-dd-team">{p.team}</span>
                    <span className="cc-dd-val">${p.value}</span>
                  </button>
                ))
              ) : searchQuery.length >= 2 ? (
                <div className="asd-no-results">
                  <span className="asd-no-results-text">
                    No players found for "{searchQuery}"
                  </span>
                  <button
                    className="asd-add-missing-btn"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowDropdown(false);
                      onAddMissingPlayer?.();
                    }}
                  >
                    <UserPlus size={13} />
                    Add "{searchQuery}" as custom player
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div ref={contentScrollRef} className="cc-content-scroll">
        <div className="player-auction-card command-center-main">
          {!selectedPlayer ? (
            <div className="cc-empty-state">
              <div className="cc-empty-icon">⊕</div>
              <div className="cc-empty-title">No player loaded</div>
              <div className="cc-empty-sub">
                Search for a player above to begin the auction
              </div>
            </div>
          ) : (
            <>
            <div className="pac-cards-stack">
              {(() => {
                const rowUi = mergedValuationRow;
                const tierValue = rowUi?.tier ?? selectedPlayer.tier;
                const adpValue = rowUi?.adp ?? selectedPlayer.adp;
                const adpTitle =
                  rowUi?.adp != null
                    ? `Engine ADP (valuation row): ${rowUi.adp}`
                    : "Catalog ADP";
                return (
                  <>
                    <PlayerIdentityCard
                      selectedPlayer={selectedPlayer}
                      tierValue={tierValue}
                      adpValue={adpValue}
                      adpTitle={adpTitle}
                      valueVsBidBadge={identityValueVsBidBadge}
                      isInWatchlist={isInWatchlist}
                      playerNote={
                        (getNote(selectedPlayer.id) || selectedPlayer.outlook) ?? ""
                      }
                      setPlayerNote={(value) =>
                        setNote(selectedPlayer.id, value)
                      }
                    />
                    {playerImpactSection}
                    <section className="pac-bid-section" aria-label="Bid recommendation">
                      <div className="pac-section-label">BID RECOMMENDATION</div>
                      <BidDecisionCard
                        valuationRow={rowForValuationUi}
                        selectedPlayer={selectedPlayer}
                      />
                    </section>
                  </>
                );
              })()}
            </div>

            <div className="pac-log-action-bar" role="group" aria-label="Log result">
              <div className="pac-log-action-label">LOG RESULT</div>
              <div className="log-result-grid log-result-grid--inline command-center-log-row">
              <div className="log-field">
                <select
                  className="log-select"
                  value={wonBy}
                  onChange={(e) => setWonBy(e.target.value)}
                >
                  {teamNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="log-field">
                <div className="log-price-input-wrap">
                  <span className="log-dollar">$</span>
                  <input
                    type="text"
                    className="log-price-input"
                    value={finalPrice}
                    onChange={(e) => onFinalPriceChange(e.target.value)}
                    title="Bid amount; defaults to suggested bid when available"
                  />
                </div>
              </div>
              <div className="log-field">
                <select
                  className={
                    "log-select" +
                    (slotOptions.length === 0 ? " log-select--warn" : "")
                  }
                  value={draftedToSlot}
                  onChange={(e) => setDraftedToSlot(e.target.value)}
                >
                  {slotOptions.length === 0 && (
                    <option value="">— no eligible slots —</option>
                  )}
                  {slotOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button
                className="log-result-btn log-result-btn--inline"
                onClick={() => void handleLogResult()}
                disabled={
                  submitting ||
                  !wonBy ||
                  !finalPrice ||
                  slotOptions.length === 0 ||
                  !hasBidSignal
                }
              >
                {submitting ? "Logging…" : "Log"}
              </button>
            </div>
            </div>
            </>
          )}
        </div>

        <section
          className="pac-notes-dock"
          aria-label="Draft notes"
          style={{ height: `${draftNotesHeight}px` }}
        >
          <div
            className="pac-notes-dock-resizer"
            onMouseDown={onDraftNotesResizeStart}
            title="Drag to resize draft notes"
            aria-hidden
          />
          <div className="pac-notes-dock-header">DRAFT NOTES</div>
          <textarea
            id="pac-note-draft"
            className="pac-notes pac-notes--dock-only"
            value={getNote("__draft__") ?? ""}
            onChange={(e) => setNote("__draft__", e.target.value)}
            placeholder="Draft strategy, targets, budget rules…"
            rows={5}
          />
        </section>
      </div>
    </div>
  );
}
