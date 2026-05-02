import { useState } from "react";
import type { DraftLogEntry } from "../../domain/mockDraftState";
import type { AIRoster } from "../../utils/mockDraftAI";
import PosBadge from "../PosBadge";

export function MockDraftTeamRosterPanel({
  rosters,
  currentBidder,
}: {
  rosters: AIRoster[];
  currentBidder: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
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
              ]
                .join(" ")
                .trim()}
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

export function MockDraftLog({ log }: { log: DraftLogEntry[] }) {
  return (
    <div className="md-log">
      <div className="md-panel-title">DRAFT LOG</div>
      <div className="md-log-list">
        {log.length === 0 && (
          <div className="md-log-empty">No picks yet — draft in progress</div>
        )}
        {[...log].reverse().map((entry) => (
          <div key={entry.pickNum} className="md-log-row">
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

export function MockDraftSetupScreen({
  teamNames,
  budget,
  onStart,
  onBack,
  onReset,
  hasSavedDraft,
}: {
  teamNames: string[];
  budget: number;
  onStart: () => void;
  onBack: () => void;
  onReset: () => void;
  hasSavedDraft: boolean;
}) {
  return (
    <div className="md-setup">
      <div className="md-setup-card">
        <h1 className="md-setup-title">AI Mock Draft</h1>
        <p className="md-setup-subtitle">
          Simulate your auction draft against AI-controlled teams. Snake
          nomination order · Strategic AI bidding
        </p>

        {hasSavedDraft && (
          <div className="md-resume-notice">
            📋 You have a draft in progress for this league — click Resume to
            continue, or Reset to start over.
          </div>
        )}

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
            <div
              key={name}
              className={"md-setup-team" + (i === 0 ? " md-setup-team--you" : "")}
            >
              <span className="md-setup-team-num">{i + 1}</span>
              <span>{name}</span>
              {i === 0 && <span className="md-you-badge">YOU</span>}
            </div>
          ))}
        </div>

        <div className="md-setup-actions">
          <button className="md-btn-secondary" onClick={onBack}>
            ← Back
          </button>
          <button className="md-btn-secondary" onClick={onReset}>
            Reset Draft
          </button>
          <button className="md-btn-primary" onClick={onStart}>
            Start Mock Draft
          </button>
        </div>
      </div>
    </div>
  );
}
