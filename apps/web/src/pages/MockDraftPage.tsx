/**
 * MockDraftPage
 *
 * AI Mock Draft feature — lets the user simulate an auction draft
 * against AI-controlled teams before their real draft night.
 *
 * Layout: 3-panel (Team Rosters | Auction Center | Watchlist + Suggestions)
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import { useAuth } from "../contexts/AuthContext";
import { getPlayers, getPlayersCached } from "../api/players";
import { getValuation } from "../api/engine";
import type { EngineCheckpointCatalogEntry } from "../api/checkpoints";
import {
  fetchEngineCheckpointCatalog,
  fetchEngineCheckpointJson,
} from "../api/checkpoints";
import type { ValuationBoardCacheContext } from "../api/valuationCache";
import { mergeCatalogPlayersWithValuations } from "../utils/valuation";
import { resolveUserTeamId, resolvedLeagueTeamNames } from "../utils/team";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import { researchValuationRowMapFromEngine } from "../domain/researchValuationMap";
import { filterResearchDefaultCatalogKind } from "../domain/researchCatalogFilter";
import { planMockDraftFromCheckpointJson } from "../domain/checkpointMockDraft";
import { useMockDraft } from "../hooks/useMockDraft";
import type { Player } from "../types/player";
import PosBadge from "../components/PosBadge";
import { AppSelect, type AppSelectOption } from "../components/AppSelect";
import "./MockDraftPage.css";

// ─── Default roster slots if league not configured ────────────────────────────
const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1,
  OF: 3, UTIL: 1, SP: 2, RP: 2, BN: 4,
};

const DEFAULT_BUDGET = 260;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamRosterPanel({
  rosters,
  currentBidder,
}: {
  rosters: import("../utils/mockDraftAI").AIRoster[];
  currentBidder: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="md-left">
      <div className="md-panel-title">TEAM ROSTERS</div>
      <div className="md-rosters-list">
        {rosters.map((r) => {
          const isExpanded = expanded.has(r.teamName);
          const remaining = r.budget - r.spent;
          const isBidding = r.teamName === currentBidder;

          return (
            <div
              key={r.teamName}
              className={[
                "md-team-card",
                r.isUser ? "md-team-card--user" : "",
                isBidding ? "md-team-card--bidding" : "",
              ].join(" ").trim()}
            >
              <button
                className="md-team-header"
                onClick={() => toggle(r.teamName)}
              >
                <div className="md-team-name-row">
                  <span className="md-team-name">{r.teamName}</span>
                  {r.isUser && <span className="md-you-badge">YOU</span>}
                  {isBidding && <span className="md-bidding-badge">BIDDING</span>}
                </div>
                <div className="md-team-budget-row">
                  <span className="md-budget-remaining">${remaining}</span>
                  <span className="md-budget-label">left</span>
                  <span className="md-picks-count">{r.picks.length} picks</span>
                  <span className="md-expand-icon">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="md-team-picks">
                  {r.picks.length === 0 ? (
                    <div className="md-no-picks">No picks yet</div>
                  ) : (
                    r.picks.map((pick, i) => (
                      <div key={i} className="md-pick-row">
                        <PosBadge pos={pick.slot} />
                        <span className="md-pick-name">{pick.player.name}</span>
                        <span className="md-pick-price">${pick.price}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraftLog({ log }: { log: import("../hooks/useMockDraft").DraftLogEntry[] }) {
  return (
    <div className="md-log">
      <div className="md-panel-title">DRAFT LOG</div>
      <div className="md-log-list">
        {log.length === 0 && (
          <div className="md-log-empty">No picks yet — draft in progress</div>
        )}
        {[...log].reverse().map((entry) => (
          <div
            key={`${entry.pickNum}-${entry.player.id}`}
            className="md-log-row"
          >
            <span className="md-log-num">#{entry.pickNum}</span>
            <PosBadge pos={entry.slot} />
            <span className="md-log-player">{entry.player.name}</span>
            <span className="md-log-team">{entry.teamName}</span>
            <span className="md-log-price">${entry.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupScreen({
  teamNames,
  budget,
  onStartFresh,
  onStartCheckpoint,
  onBack,
  onReset,
  hasSavedDraft,
  checkpoints,
  selectedCheckpointKey,
  onCheckpointChange,
  catalogLoading,
  catalogError,
  playersReady,
  checkpointBusy,
}: {
  teamNames: string[];
  budget: number;
  onStartFresh: () => void;
  onStartCheckpoint: () => void | Promise<void>;
  onBack: () => void;
  onReset: () => void;
  hasSavedDraft: boolean;
  checkpoints: import("../api/checkpoints").EngineCheckpointCatalogEntry[];
  selectedCheckpointKey: string;
  onCheckpointChange: (key: string) => void;
  catalogLoading: boolean;
  catalogError: string;
  playersReady: boolean;
  checkpointBusy: boolean;
}) {
  const checkpointPickerDisabled =
    catalogLoading || checkpointBusy || checkpoints.length === 0;

  const checkpointOptions = useMemo((): AppSelectOption[] => {
    if (catalogLoading) {
      return [{ value: "", label: "Loading checkpoints…", disabled: true }];
    }
    if (checkpoints.length === 0) {
      return [{ value: "", label: "— Fresh draft —" }];
    }
    return [
      { value: "", label: "— Fresh draft —" },
      ...checkpoints.map((c) => ({ value: c.id, label: c.title })),
    ];
  }, [catalogLoading, checkpoints]);

  return (
    <div className="md-setup">
      <div className="md-setup-card">
        <h1 className="md-setup-title">AI Mock Draft</h1>
        <p className="md-setup-subtitle">
          Simulate your auction draft against AI-controlled teams.
          Snake nomination order · Strategic AI bidding
        </p>

        <div className="md-setup-checkpoint">
          <label className="md-setup-checkpoint-label" htmlFor="md-engine-checkpoint">
            Engine checkpoint (optional)
          </label>
          <AppSelect
            id="md-engine-checkpoint"
            block
            value={selectedCheckpointKey}
            onChange={onCheckpointChange}
            options={checkpointOptions}
            disabled={checkpointPickerDisabled}
            aria-label="Engine checkpoint (optional)"
          />
          <p className="md-setup-checkpoint-note">
            Loads bundled Draft fixtures under{" "}
            <code>apps/api/test-fixtures/player-api/checkpoints/</code> (same JSON as Activity #9).
            Board valuations call Engine via{" "}
            <code>POST /api/engine/leagues/:id/valuation/checkpoint</code> using the flattened contract in{" "}
            <code>ENGINE_AGENT_BRIEF.md</code>.
          </p>
          {catalogLoading && (
            <p className="md-setup-checkpoint-status">Loading checkpoint catalog…</p>
          )}
          {catalogError && (
            <p className="md-setup-checkpoint-status md-setup-checkpoint-status--error">
              {catalogError}
            </p>
          )}
          {!playersReady && (
            <p className="md-setup-checkpoint-status">Loading player catalog…</p>
          )}
        </div>

        <div className="md-setup-details">
          <div className="md-setup-row">
            <span>Your team</span>
            <strong className="green">{teamNames[0]}</strong>
          </div>
          <div className="md-setup-row">
            <span>AI teams</span>
            <strong>{teamNames.length - 1}</strong>
          </div>
          <div className="md-setup-row">
            <span>Budget per team</span>
            <strong>${budget}</strong>
          </div>
          <div className="md-setup-row">
            <span>Order</span>
            <strong>Snake</strong>
          </div>
        </div>

        <div className="md-setup-teams">
          {teamNames.map((name, i) => (
            <div key={name} className={"md-setup-team" + (i === 0 ? " md-setup-team--you" : "")}>
              <span className="md-setup-team-num">{i + 1}</span>
              <span>{name}</span>
              {i === 0 && <span className="md-you-badge">YOU</span>}
            </div>
          ))}
        </div>

        {hasSavedDraft && (
          <div className="md-resume-notice">
            📋 Draft in progress — Resume to continue or Reset to start over.
          </div>
        )}

        <div className="md-setup-actions">
          <button className="md-btn-secondary" type="button" onClick={onBack}>← Back</button>
          {hasSavedDraft && (
            <button className="md-btn-secondary" type="button" onClick={onReset}>Reset Draft</button>
          )}
          <button
            className="md-btn-primary"
            type="button"
            disabled={!playersReady || checkpointBusy}
            onClick={() =>
              selectedCheckpointKey ? void onStartCheckpoint() : onStartFresh()}
          >
            {selectedCheckpointKey ? "Start from checkpoint" : "Start Mock Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MockDraftPage() {
  usePageTitle("AI Mock Draft");
  const navigate = useNavigate();
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { watchlist } = useWatchlist();
  const { customPlayers } = useCustomPlayers();

  const rosterSlotsBase = league?.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const budgetBase = league?.budget ?? DEFAULT_BUDGET;

  const teamNamesBase = useMemo(() => {
    if (league) return resolvedLeagueTeamNames(league);
    const count = 10;
    return ["My Team", ...Array.from({ length: count - 1 }, (_, i) => `AI Team ${i + 2}`)];
  }, [league?.teams, league?.teamNames?.join("\u0001")]);

  const { token, user } = useAuth();

  const [checkpointCatalog, setCheckpointCatalog] = useState<
    EngineCheckpointCatalogEntry[]
  >([]);
  const [checkpointCatalogPhase, setCheckpointCatalogPhase] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [checkpointCatalogError, setCheckpointCatalogError] = useState("");
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setCheckpointCatalogPhase("loading");
    setCheckpointCatalogError("");
    void fetchEngineCheckpointCatalog(token)
      .then((rows) => {
        if (!cancelled) {
          setCheckpointCatalog(rows);
          setCheckpointCatalogPhase("ok");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setCheckpointCatalogPhase("error");
          setCheckpointCatalogError(
            e instanceof Error ? e.message : "Failed to load checkpoints",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mockLeagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [league],
  );

  // ── Player loading — mirrors Research.tsx so we get the same filtered pool
  //    (AL/NL/Mixed via playerPool) and Engine-enriched auction_value fields.
  //    Without this, search-nominated and AI-nominated players use the legacy
  //    catalog `value` field instead of your Amethyst Engine auction_value.
  const [rawPlayers, setRawPlayers] = useState<Player[]>(
    () => getPlayersCached("catalog_rank", league?.posEligibilityThreshold, league?.playerPool) ?? [],
  );
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, import("../utils/valuation").ValuationShape>
  >(() => new Map());

  useEffect(() => {
    void getPlayers("catalog_rank", league?.posEligibilityThreshold, league?.playerPool)
      .then(setRawPlayers)
      .catch(console.error);
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  // Merge catalog players with Engine valuations + custom players at the top.
  // filterResearchDefaultCatalogKind removes market_only / non-draftable rows,
  // matching the Research page pool exactly (respects AL/NL playerPool filter).
  const allPlayers = useMemo(() => {
    const catalogPlayers = filterResearchDefaultCatalogKind(rawPlayers);
    const enriched = mergeCatalogPlayersWithValuations(catalogPlayers, valuationsByPlayerId);
    return [...customPlayers, ...enriched];
  }, [customPlayers, rawPlayers, valuationsByPlayerId]);

  // Convert watchlist entries to Player[] — look them up in the enriched
  // allPlayers pool first so we get Engine auction_value. Fall back to a
  // minimal stub that satisfies the full Player type if not found.
  const watchlistPlayers = useMemo<Player[]>(() => {
    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
    return watchlist.map((w): Player => {
      const found = playerMap.get(w.id);
      if (found) return found;
      // Stub — satisfies Player type; auction_value will be missing but
      // the AI engine falls back to value=0 which is safe.
      return {
        id: w.id,
        mlbId: 0,
        name: w.name,
        team: w.team ?? "",
        position: w.position ?? "UTIL",
        positions: w.positions,
        age: 0,
        catalog_rank: 999,
        catalog_tier: 5,
        value: 0,
        headshot: "",
        outlook: "",
        stats: {},
        projection: {},
      };
    });
  }, [watchlist, allPlayers]);

  const {
    state,
    startDraft,
    resetDraft,
    nominatePlayer,
    placeBid,
    confirmSell,
    keepBidding,
    hydrateFromCheckpoint,
    isUserTurn,
    currentTeamIdx,
    hasSavedDraft,
  } = useMockDraft(
    leagueId ?? "",
    teamNamesBase,
    budgetBase,
    rosterSlotsBase,
    allPlayers,
    watchlistPlayers,
  );

  const valuationBoardCacheContext = useMemo((): ValuationBoardCacheContext => {
    const hy = state.checkpointHydration;
    const ck = hy?.checkpointKey ?? null;
    return {
      leagueConfigKey: mockLeagueValuationKey,
      rosterFingerprint: ck ? `checkpoint:${ck}` : rosterValuationFingerprint([]),
      extras: hy
        ? JSON.stringify({
            rosterSlots: hy.rosterSlots,
            budget: hy.budget,
            teamNames: hy.teamNames,
          })
        : "",
      checkpointKey: ck,
    };
  }, [mockLeagueValuationKey, state.checkpointHydration]);

  useEffect(() => {
    if (!token || !leagueId || rawPlayers.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const userTeamId = resolveUserTeamId(league ?? null, user?.id);
        const res = await getValuation(
          leagueId,
          token,
          userTeamId,
          null,
          valuationBoardCacheContext,
        );
        const merged = researchValuationRowMapFromEngine(res.valuations, new Set());
        if (!cancelled) setValuationsByPlayerId(merged);
      } catch {
        // Non-fatal — mock draft still works with catalog value as fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    leagueId,
    rawPlayers.length,
    user?.id,
    league,
    valuationBoardCacheContext,
  ]);

  const startFromCheckpoint = async () => {
    if (
      !token ||
      !leagueId ||
      !selectedCheckpointKey ||
      rawPlayers.length === 0
    ) {
      return;
    }
    setCheckpointBusy(true);
    try {
      const json = await fetchEngineCheckpointJson(
        token,
        selectedCheckpointKey as EngineCheckpointCatalogEntry["id"],
      );
      const plan = planMockDraftFromCheckpointJson({
        checkpointKey: selectedCheckpointKey,
        checkpointJson: json,
        leagueTeamNames: league ? resolvedLeagueTeamNames(league) : [],
        allPlayers,
      });
      if ("error" in plan) {
        window.alert(plan.error);
        return;
      }
      hydrateFromCheckpoint(plan.mockDraftState);
    } finally {
      setCheckpointBusy(false);
    }
  };

  // Player search for nomination
  const [searchQuery, setSearchQuery] = useState("");
  const [bidInput, setBidInput] = useState("1");

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    return state.undraftedPlayers
      .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 8);
  }, [searchQuery, state.undraftedPlayers]);

  if (state.phase === "setup") {
    return (
      <SetupScreen
        teamNames={teamNamesBase}
        budget={budgetBase}
        onStartFresh={startDraft}
        onStartCheckpoint={startFromCheckpoint}
        onBack={() => navigate(`/leagues/${leagueId ?? ""}/my-draft`)}
        onReset={resetDraft}
        hasSavedDraft={hasSavedDraft}
        checkpoints={checkpointCatalog}
        selectedCheckpointKey={selectedCheckpointKey}
        onCheckpointChange={setSelectedCheckpointKey}
        catalogLoading={checkpointCatalogPhase === "loading"}
        catalogError={
          checkpointCatalogPhase === "error" ? checkpointCatalogError : ""
        }
        playersReady={rawPlayers.length > 0}
        checkpointBusy={checkpointBusy}
      />
    );
  }

  if (state.phase === "complete") {
    return (
      <div className="md-complete">
        <div className="md-complete-card">
          <div className="md-complete-icon">🏆</div>
          <h1 className="md-complete-title">Mock Draft Complete!</h1>
          <div className="md-complete-results">
            {state.rosters.map((r) => (
              <div key={r.teamName} className={"md-result-row" + (r.isUser ? " md-result-row--you" : "")}>
                <span className="md-result-team">{r.teamName}</span>
                <span className="md-result-picks">{r.picks.length} picks</span>
                <span className="md-result-spent">${r.spent} spent</span>
                <span className="md-result-left">${r.budget - r.spent} left</span>
              </div>
            ))}
          </div>
          <div className="md-complete-actions">
            <button className="md-btn-secondary" onClick={() => navigate(`/leagues/${leagueId ?? ""}/my-draft`)}>
              Back to My Draft
            </button>
            <button className="md-btn-primary" onClick={startDraft}>
              Run Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userRoster = state.rosters.find((r) => r.isUser);
  const userRemaining = userRoster ? userRoster.budget - userRoster.spent : budgetBase;

  return (
    <div className="md-page">

      {/* ── Left: team rosters ── */}
      <TeamRosterPanel
        rosters={state.rosters}
        currentBidder={state.currentBidder}
      />

      {/* ── Center: auction + log ── */}
      <div className="md-center">

        {/* Status bar */}
        <div className="md-status-bar">
          <span className="md-status-phase">
            {state.phase === "nomination" && (isUserTurn ? "YOUR TURN TO NOMINATE" : `${state.rosters[currentTeamIdx]?.teamName ?? ""} NOMINATING`)}
            {state.phase === "bidding" && "AUCTION IN PROGRESS"}
            {state.phase === "user-confirm" && "CONFIRM YOUR BID"}
            {state.phase === "sold" && "SOLD!"}
          </span>
          <span className="md-status-pick">
            Pick {Math.min(state.log.length + 1, state.snakeOrder.length)} of {state.snakeOrder.length}
          </span>
          <button
            className="md-reset-btn"
            onClick={() => {
              if (window.confirm("Reset the mock draft? All progress will be lost.")) {
                resetDraft();
              }
            }}
          >
            ↺ Reset
          </button>
        </div>

        {/* Auction center */}
        <div className="md-auction-card">
          {state.nominatedPlayer ? (
            <>
              <div className="md-auction-player">
                {state.nominatedPlayer.headshot && (
                  <img
                    src={state.nominatedPlayer.headshot}
                    alt={state.nominatedPlayer.name}
                    className="md-auction-headshot"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="md-auction-player-info">
                  <div className="md-auction-chips">
                    <PosBadge pos={state.nominatedPlayer.position} />
                    <span className="md-auction-team-chip">{state.nominatedPlayer.team}</span>
                  </div>
                  <h2 className="md-auction-name">{state.nominatedPlayer.name}</h2>
                  <div className="md-auction-value">
                    Auction Value{" "}
                    <strong className="green">
                      ${state.nominatedPlayer.auction_value
                        ?? state.nominatedPlayer.auction_value
                        ?? state.nominatedPlayer.value}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="md-bid-display">
                <div className="md-bid-block">
                  <div className="md-bid-label">CURRENT BID</div>
                  <div className="md-bid-amount">${state.currentBid}</div>
                  <div className="md-bidder">{state.currentBidder}</div>
                </div>
              </div>

              <div className="md-message">{state.message}</div>

              {/* User confirm phase */}
              {state.phase === "user-confirm" && (
                <div className="md-confirm-box">
                  <p className="md-confirm-text">
                    Current high bid is <strong>${state.currentBid}</strong> by <strong>{state.currentBidder}</strong>.
                    Do you want to keep bidding?
                  </p>
                  <div className="md-confirm-actions">
                    <button className="md-btn-secondary" onClick={keepBidding}>
                      Keep Bidding
                    </button>
                    <button className="md-btn-danger" onClick={confirmSell}>
                      Done — Let Them Have It
                    </button>
                  </div>
                </div>
              )}

              {/* User bid input */}
              {state.phase === "bidding" && (
                <div className="md-user-bid-row">
                  <span className="md-bid-prefix">$</span>
                  <input
                    className="md-bid-input"
                    type="number"
                    min={state.currentBid + 1}
                    max={userRemaining - 1}
                    value={bidInput}
                    onChange={(e) => setBidInput(e.target.value)}
                  />
                  <button
                    className="md-btn-primary"
                    onClick={() => {
                      const amt = parseInt(bidInput);
                      if (!isNaN(amt)) placeBid(amt);
                    }}
                  >
                    Place Bid
                  </button>
                  <span className="md-bid-max-hint">max ${userRemaining - 1}</span>
                </div>
              )}

              {state.phase === "sold" && (
                <div className="md-sold-banner">
                  SOLD to {state.currentBidder} for ${state.currentBid}!
                </div>
              )}
            </>
          ) : (
            /* Nomination phase */
            <div className="md-nomination-area">
              {isUserTurn ? (
                <>
                  <p className="md-nominate-prompt">
                    It's your turn to nominate a player for auction.
                  </p>
                  <div className="md-search-wrap">
                    <input
                      className="md-search-input"
                      type="text"
                      placeholder="Search for a player to nominate..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {searchResults.length > 0 && (
                      <div className="md-search-dropdown">
                        {searchResults.map((p) => (
                          <button
                            key={p.id}
                            className="md-search-result"
                            onClick={() => {
                              nominatePlayer(p);
                              setSearchQuery("");
                            }}
                          >
                            <PosBadge pos={p.position} />
                            <span className="md-sr-name">{p.name}</span>
                            <span className="md-sr-team">{p.team}</span>
                            <span className="md-sr-val">
                              ${p.auction_value ?? p.auction_value ?? p.value}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="md-waiting">
                  <div className="md-waiting-spinner" />
                  <p>{state.message || `Waiting for ${state.rosters[currentTeamIdx]?.teamName}...`}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Draft log */}
        <DraftLog log={state.log} />
      </div>

      {/* ── Right: watchlist + suggestion ── */}
      <div className="md-right">

        {/* AI suggestion box */}
        {isUserTurn && state.phase === "nomination" && state.suggestion && (
          <div className="md-suggestion-card">
            <div className="md-panel-title">💡 AI SUGGESTION</div>
            <div className="md-suggestion-reason">{state.suggestion.reason}</div>
            <div className="md-suggestion-player">
              <PosBadge pos={state.suggestion.player.position} />
              <span className="md-sug-name">{state.suggestion.player.name}</span>
              <span className="md-sug-val">
                ${state.suggestion.player.auction_value
                  ?? state.suggestion.player.auction_value
                  ?? state.suggestion.player.value}
              </span>
            </div>
            <button
              className="md-btn-suggestion"
              onClick={() => nominatePlayer(state.suggestion!.player)}
            >
              Nominate This Player
            </button>
          </div>
        )}

        {/* User budget summary */}
        <div className="md-budget-card">
          <div className="md-panel-title">YOUR BUDGET</div>
          <div className="md-budget-remaining">${userRemaining}</div>
          <div className="md-budget-sub">
            {userRoster?.picks.length ?? 0} picks · ${userRoster?.spent ?? 0} spent
          </div>
        </div>

        {/* Watchlist */}
        <div className="md-watchlist-card">
          <div className="md-panel-title">YOUR WATCHLIST</div>
          <div className="md-watchlist-list">
            {watchlistPlayers.length === 0 && (
              <div className="md-wl-empty">
                Star players in Research to build your watchlist.
              </div>
            )}
            {watchlistPlayers.map((p) => {
              const isDrafted = !state.undraftedPlayers.some((u) => u.id === p.id);
              return (
                <div
                  key={p.id}
                  className={"md-wl-row" + (isDrafted ? " md-wl-row--drafted" : "")}
                >
                  <PosBadge pos={p.position} />
                  <span className="md-wl-name">{p.name}</span>
                  <span className="md-wl-val">${p.value}</span>
                  {isDrafted && <span className="md-wl-drafted">DRAFTED</span>}
                  {!isDrafted && isUserTurn && state.phase === "nomination" && (
                    <button
                      className="md-wl-nominate-btn"
                      onClick={() => nominatePlayer(p)}
                    >
                      Nom
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}