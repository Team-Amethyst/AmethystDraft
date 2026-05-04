/**
 * MockDraftPage
 *
 * AI Mock Draft feature — lets the user simulate an auction draft
 * against AI-controlled teams before their real draft night.
 *
 * Layout: 3-panel (Team Rosters | Auction Center | Watchlist + Suggestions)
 */

import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import { getPlayersCached } from "../api/players";
import { useMockDraft } from "../hooks/useMockDraft";
import type { Player } from "../types/player";
import PosBadge from "../components/PosBadge";
import {
  MockDraftLog,
  MockDraftSetupScreen,
  MockDraftTeamRosterPanel,
} from "../components/mock-draft/MockDraftSubcomponents";
import "./MockDraftPage.css";
import {
  MOCK_DRAFT_DEFAULT_BUDGET,
  MOCK_DRAFT_DEFAULT_ROSTER_SLOTS,
} from "../domain/mockDraftDefaults";
import { playerFromWatchlistEntry } from "../domain/watchlistToPlayer";

export default function MockDraftPage() {
  usePageTitle("AI Mock Draft");
  const navigate = useNavigate();
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { watchlist } = useWatchlist();
  const { customPlayers } = useCustomPlayers();

  const rosterSlots = league?.rosterSlots ?? MOCK_DRAFT_DEFAULT_ROSTER_SLOTS;
  const budget      = league?.budget      ?? MOCK_DRAFT_DEFAULT_BUDGET;

  // Build team names: user is Team 1, rest are AI
  const teamNames = useMemo(() => {
    if (league?.teamNames?.length) return league.teamNames;
    const count = 10;
    return ["My Team", ...Array.from({ length: count - 1 }, (_, i) => `AI Team ${i + 2}`)];
  }, [league]);

  // Get players from cache (already loaded by Research page)
  const allPlayers = useMemo(() => {
    const cached = getPlayersCached("adp") ?? [];
    return [...customPlayers, ...cached];
  }, [customPlayers]);

  // Convert watchlist to Player[]
  const watchlistPlayers = useMemo<Player[]>(
    () => watchlist.map(playerFromWatchlistEntry),
    [watchlist],
  );

  const {
    state,
    startDraft,
    resetDraft,
    nominatePlayer,
    placeBid,
    confirmSell,
    keepBidding,
    isUserTurn,
    currentTeamIdx,
    hasSavedDraft,
  } = useMockDraft(leagueId ?? "", teamNames, budget, rosterSlots, allPlayers, watchlistPlayers);

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
      <MockDraftSetupScreen
        teamNames={teamNames}
        budget={budget}
        onStart={startDraft}
        onBack={() => navigate(`/leagues/${leagueId ?? ""}/my-draft`)}
        onReset={resetDraft}
        hasSavedDraft={hasSavedDraft}
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
  const userRemaining = userRoster ? userRoster.budget - userRoster.spent : budget;

  return (
    <div className="md-page">

      {/* ── Left: team rosters ── */}
      <MockDraftTeamRosterPanel
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
            title="Reset mock draft"
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
                    Proj Value <strong className="green">${state.nominatedPlayer.value}</strong>
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
                            <span className="md-sr-val">${p.value}</span>
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
        <MockDraftLog log={state.log} />
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
              <span className="md-sug-val">${state.suggestion.player.value}</span>
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