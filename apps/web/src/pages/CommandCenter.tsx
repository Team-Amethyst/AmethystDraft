import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import type { League } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import { getRoster, removeRosterEntry, updateRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import "./CommandCenter.css";
import { DraftLogRow } from "../components/DraftLogRow";
import { AuctionCenter } from "../components/AuctionCenter";
import {
  type TeamSummary,
  getStatByCategory,
  computeTeamData,
  computePositionMarket,
} from "./commandCenterUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DraftLog({
  rosterEntries,
  league,
  allPlayers,
  onRemovePick,
  onUpdatePick,
}: {
  rosterEntries: RosterEntry[];
  league: League | null;
  allPlayers: Player[];
  onRemovePick?: (id: string) => void;
  onUpdatePick?: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
}) {
  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );
  const slotOptions = useMemo(
    () => (league?.rosterSlots ? Object.keys(league.rosterSlots) : []),
    [league],
  );
  const teamOptions = useMemo(
    () =>
      (league?.teamNames ?? []).map((name, i) => ({
        id: `team_${i + 1}`,
        name,
      })),
    [league],
  );
  const sorted = [...rosterEntries].sort(
    (a, b) =>
      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
  );
  return (
    <>
      <div className="market-section-label" style={{ marginTop: "1rem" }}>
        DRAFT LOG
      </div>
      <div className="draft-log-list">
        {sorted.length === 0 && <div className="dl-empty">No picks yet.</div>}
        {sorted.map((entry, i) => {
          const teamIdx = entry.teamId
            ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
            : (league?.memberIds.indexOf(entry.userId) ?? -1);
          const teamName =
            teamIdx >= 0
              ? (league?.teamNames[teamIdx] ?? entry.teamId ?? entry.userId)
              : (entry.teamId ?? entry.userId);
          const player = playerMap.get(entry.externalPlayerId);
          return (
            <DraftLogRow
              key={entry._id}
              entry={entry}
              pickNum={i + 1}
              teamName={teamName}
              headshot={player?.headshot}
              mlbTeam={player?.team || entry.playerTeam}
              slotOptions={slotOptions}
              teamOptions={teamOptions}
              allRosterEntries={rosterEntries}
              leagueRosterSlots={league?.rosterSlots ?? {}}
              onUpdate={onUpdatePick}
              onRemove={onRemovePick}
            />
          );
        })}
      </div>
    </>
  );
}

function LeftPanel({
  activeTab,
  setActiveTab,
  league,
  teamData,
  myTeamName,
  selectedPlayerPosition,
  allPlayers,
  draftedIds,
  rosterEntries,
  onRemovePick,
  onUpdatePick,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  selectedPlayerPosition: string | null;
  allPlayers: Player[];
  draftedIds: Set<string>;
  rosterEntries: RosterEntry[];
  onRemovePick: (id: string) => void;
  onUpdatePick: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
}) {
  const posMarket = useMemo(
    () =>
      computePositionMarket(
        selectedPlayerPosition,
        allPlayers,
        draftedIds,
        rosterEntries,
      ),
    [selectedPlayerPosition, allPlayers, draftedIds, rosterEntries],
  );

  return (
    <div className="cc-left">
      <div className="cc-tabs">
        {["Market", "Teams", "Standings"].map((t) => (
          <button
            key={t}
            className={"cc-tab " + (activeTab === t ? "active" : "")}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Market" && (
        <div className="cc-panel-content">
          <>
            <div className="market-section-label">
              {posMarket ? posMarket.position : "—"} MARKET
              {posMarket && (
                <span className="pos-chip">{posMarket.position}</span>
              )}
            </div>
            <div className="market-stat-row">
              <span className="msr-label">AVG WINNING PRICE</span>
              <span className="msr-value">
                {posMarket && posMarket.avgWinPrice > 0
                  ? `$${posMarket.avgWinPrice}`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">PROJECTED VALUE</span>
              <span className="msr-value green">
                {posMarket && posMarket.avgProjValue > 0
                  ? `$${posMarket.avgProjValue}`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">INFLATION</span>
              <span
                className={`msr-value ${
                  posMarket && posMarket.inflation > 0
                    ? "yellow"
                    : posMarket && posMarket.inflation < 0
                      ? "green"
                      : ""
                }`}
              >
                {posMarket && posMarket.avgWinPrice > 0
                  ? `${posMarket.inflation > 0 ? "+" : ""}${posMarket.inflation}%`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">REMAINING AT POS</span>
              <span className="msr-value">
                {posMarket ? posMarket.remainingCount : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">SCARCITY RANK</span>
              <span className="msr-value">
                {posMarket ? (
                  <>
                    {posMarket.scarcityRankNum}{" "}
                    <span className="msr-sub">
                      / {posMarket.scarcityRankOf}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="cc-divider" />
          </>
          <div className="market-section-label">TEAM LIQUIDITY</div>
          <table className="liquidity-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>$ LEFT</th>
                <th>OPEN</th>
                <th>MAX BID ↓</th>
                <th>$/SPOT</th>
              </tr>
            </thead>
            <tbody>
              {teamData.length > 0 ? (
                teamData.map((t) => (
                  <tr
                    key={t.name}
                    className={t.name === myTeamName ? "my-team-row" : ""}
                  >
                    <td className="team-name-cell">{t.name}</td>
                    <td>${t.remaining}</td>
                    <td>{t.open}</td>
                    <td className="green">${t.maxBid}</td>
                    <td>${t.ppSpot}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    {league ? "No picks logged yet" : "No league loaded"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <>
            <div className="cc-divider" />
            <div className="market-section-label">
              {posMarket ? posMarket.position : "—"} SUPPLY
            </div>
            <table className="supply-table">
              <thead>
                <tr>
                  <th>TIER</th>
                  <th>REMAINING</th>
                  <th>AVG $</th>
                </tr>
              </thead>
              <tbody>
                {posMarket ? (
                  posMarket.supply.length > 0 ? (
                    posMarket.supply.map(({ tier, count, avgVal }) => (
                      <tr key={tier}>
                        <td className="tier-cell">
                          <span
                            className="pac-tier-badge"
                            style={{
                              background:
                                [
                                  "#a855f7",
                                  "#6366f1",
                                  "#22c55e",
                                  "#f59e0b",
                                  "#6b7280",
                                ][tier - 1] ?? "#6b7280",
                            }}
                          >
                            {tier}
                          </span>
                        </td>
                        <td>{count}</td>
                        <td>{avgVal != null ? `$${avgVal}` : "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="dim"
                        style={{ textAlign: "center", padding: "0.5rem 0" }}
                      >
                        None remaining
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="dim"
                      style={{ textAlign: "center", padding: "0.5rem 0" }}
                    >
                      Select a player to see supply
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        </div>
      )}

      {activeTab === "Teams" && (
        <div className="cc-panel-content">
          <table className="teams-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>$ LEFT</th>
                <th>SPENT</th>
                <th>OPEN</th>
                <th>MAX</th>
              </tr>
            </thead>
            <tbody>
              {teamData.length > 0 ? (
                teamData.map((t) => (
                  <tr
                    key={t.name}
                    className={t.name === myTeamName ? "my-team-row" : ""}
                  >
                    <td className="team-name-cell">{t.name}</td>
                    <td>${t.remaining}</td>
                    <td>${t.spent}</td>
                    <td>{t.open}</td>
                    <td className="green">${t.maxBid}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    {league ? "No teams yet" : "No league loaded"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <DraftLog
            rosterEntries={rosterEntries}
            league={league}
            allPlayers={allPlayers}
            onRemovePick={onRemovePick}
            onUpdatePick={onUpdatePick}
          />
        </div>
      )}

      {activeTab === "Standings" && (
        <div className="cc-panel-content">
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TEAM</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>GB</th>
              </tr>
            </thead>
            <tbody>
              {(league?.teamNames ?? []).map((name, i) => (
                <tr
                  key={name}
                  className={name === myTeamName ? "my-team-row" : ""}
                >
                  <td className="rank-cell">{i + 1}</td>
                  <td className="team-name-cell">{name}</td>
                  <td className="dim">—</td>
                  <td className="dim">—</td>
                  <td className="dim">—</td>
                  <td className="gb-cell dim">—</td>
                </tr>
              ))}
              {!league && (
                <tr>
                  <td
                    colSpan={6}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    No league loaded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <DraftLog
            rosterEntries={rosterEntries}
            league={league}
            allPlayers={allPlayers}
            onRemovePick={onRemovePick}
            onUpdatePick={onUpdatePick}
          />
        </div>
      )}
    </div>
  );
}

function RightPanel({
  league,
  teamData,
  myTeamName,
  myTeamEntries,
  allPlayers,
  rosterEntries,
}: {
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  myTeamEntries: RosterEntry[];
  allPlayers: Player[];
  rosterEntries: RosterEntry[];
}) {
  const my = teamData.find((t) => t.name === myTeamName);
  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;

  const budgetRemaining = my?.remaining ?? league?.budget ?? 260;
  const openSpots = my?.open ?? totalSlots;
  const maxBid = my?.maxBid ?? Math.max(1, budgetRemaining - (openSpots - 1));
  const ppSpot = my?.ppSpot ?? 0;

  const hittingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "batting",
  );
  const pitchingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "pitching",
  );

  // Position budget plan
  const posBudgetPlan = league
    ? Object.entries(league.rosterSlots).map(([pos, count]) => {
        const entriesAtSlot = myTeamEntries.filter((e) => e.rosterSlot === pos);
        const spent = entriesAtSlot.reduce((s, e) => s + e.price, 0);
        const filled = entriesAtSlot.length;
        const open = Math.max(0, count - filled);
        const target = Math.round(
          (count / totalSlots) * (league.budget ?? 260),
        );
        const delta = target - spent;
        return { pos, open, target, spent, delta };
      })
    : [];

  // Category pace percentages
  const numTeams = league?.teamNames?.length ?? 1;
  const allCats = [...hittingCats, ...pitchingCats];
  const catPace: Record<string, number> = {};
  for (const cat of allCats) {
    const isRate = ["ERA", "WHIP"].includes(cat.name.toUpperCase());
    const getVal = (entry: RosterEntry) => {
      const p = allPlayers.find((a) => a.id === entry.externalPlayerId);
      return p ? getStatByCategory(p, cat.name, cat.type) : 0;
    };
    if (isRate) {
      const myVals = myTeamEntries.map(getVal).filter((v) => v > 0);
      const allVals = rosterEntries.map(getVal).filter((v) => v > 0);
      const myAvg = myVals.length
        ? myVals.reduce((a, b) => a + b, 0) / myVals.length
        : 0;
      const allAvg = allVals.length
        ? allVals.reduce((a, b) => a + b, 0) / allVals.length
        : 0;
      catPace[cat.name] =
        allAvg > 0 && myAvg > 0 ? Math.round((allAvg / myAvg) * 100) : 0;
    } else {
      const myTotal = myTeamEntries.reduce((s, e) => s + getVal(e), 0);
      const allTotal = rosterEntries.reduce((s, e) => s + getVal(e), 0);
      const avgTotal = numTeams > 0 ? allTotal / numTeams : 0;
      catPace[cat.name] =
        avgTotal > 0 ? Math.round((myTotal / avgTotal) * 100) : 0;
    }
  }

  return (
    <div className="cc-right">
      <div className="rp-section-label">YOUR BUDGET</div>
      <div className="budget-grid">
        <div className="budget-card">
          <div className="bc-label">BUDGET REMAINING</div>
          <div className="bc-val green">${budgetRemaining}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">OPEN SPOTS</div>
          <div className="bc-val">{openSpots}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">MAX BID</div>
          <div className="bc-val green">${maxBid}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">$ PER SPOT</div>
          <div className="bc-val">${ppSpot}</div>
        </div>
      </div>
      <div className="budget-progress-row">
        <span className="bp-text">
          {my ? `${my.filled}/${totalSlots} filled` : `0/${totalSlots} filled`}
        </span>
        <span className="bp-text">${my?.spent ?? 0} spent</span>
      </div>

      <div className="cc-divider" />

      <div className="rp-section-label">POSITION BUDGET PLAN</div>
      <table className="pos-budget-table">
        <thead>
          <tr>
            <th>POS</th>
            <th>OPEN</th>
            <th>TARGET</th>
            <th>SPENT</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {posBudgetPlan.map(({ pos, open, target, spent, delta }) => (
            <tr key={pos}>
              <td className="pb-pos">{pos}</td>
              <td>{open}</td>
              <td>${target}</td>
              <td>${spent}</td>
              <td className={delta >= 0 ? "green" : "red"}>
                {delta >= 0 ? `+${delta}` : delta}
              </td>
            </tr>
          ))}
          {posBudgetPlan.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="dim"
                style={{ textAlign: "center", padding: "0.5rem 0" }}
              >
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="cc-divider" />

      <div className="rp-section-label">CATEGORY PACE</div>
      <div className="cat-pace-section">
        {hittingCats.length > 0 && (
          <>
            <div className="cat-pace-group-label">HITTING</div>
            <div className="cat-pace-row">
              {hittingCats.map((c) => {
                const pct = catPace[c.name] ?? 0;
                const color =
                  pct >= 95 ? "green" : pct >= 75 ? "yellow" : "red";
                return (
                  <div key={c.name} className="cat-pace-item">
                    <div className="cp-label">{c.name}</div>
                    {pct > 0 && <div className={`cp-pct ${color}`}>{pct}%</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {pitchingCats.length > 0 && (
          <>
            <div
              className="cat-pace-group-label"
              style={{ marginTop: "0.6rem" }}
            >
              PITCHING
            </div>
            <div className="cat-pace-row">
              {pitchingCats.map((c) => {
                const pct = catPace[c.name] ?? 0;
                const color =
                  pct >= 95 ? "green" : pct >= 75 ? "yellow" : "red";
                return (
                  <div key={c.name} className="cat-pace-item">
                    <div className="cp-label">{c.name}</div>
                    {pct > 0 && <div className={`cp-pct ${color}`}>{pct}%</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {hittingCats.length === 0 && pitchingCats.length === 0 && (
          <div
            className="dim"
            style={{ fontSize: "0.72rem", padding: "0.5rem 0" }}
          >
            Scoring categories not configured
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  usePageTitle("Command Center");
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("Market");
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();

  // 1/2/3 → switch tabs (Market / Teams / Standings)
  useEffect(() => {
    const TABS = ["Market", "Teams", "Standings"];
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= TABS.length) setActiveTab(TABS[n - 1]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const refreshRoster = () => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  };

  useEffect(() => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  }, [leagueId, token]);

  useEffect(() => {
    void getPlayers("adp").then(setAllPlayers).catch(console.error);
  }, []);

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );

  const teamData = useMemo(
    () => (league ? computeTeamData(league, rosterEntries) : []),
    [league, rosterEntries],
  );

  const myTeamIdx = user?.id && league ? league.memberIds.indexOf(user.id) : -1;
  const myTeamName = myTeamIdx >= 0 ? (league?.teamNames[myTeamIdx] ?? "") : "";
  const myTeamId = myTeamIdx >= 0 ? `team_${myTeamIdx + 1}` : null;
  const myTeamEntries = myTeamId
    ? rosterEntries.filter((e) => e.teamId === myTeamId)
    : [];

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRemovePick = async (entryId: string) => {
    if (!leagueId || !token) return;
    const entry = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((prev) => prev.filter((e) => e._id !== entryId));
    try {
      await removeRosterEntry(leagueId, entryId, token);
      showToast(`✕ Removed ${entry?.playerName ?? "pick"}`, "info");
    } catch (err) {
      refreshRoster();
      showToast(err instanceof Error ? err.message : "Remove failed", "error");
    }
  };

  const handleUpdatePick = async (
    entryId: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => {
    if (!leagueId || !token) return;
    const prev = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((entries) =>
      entries.map((e) => (e._id === entryId ? { ...e, ...data } : e)),
    );
    try {
      await updateRosterEntry(leagueId, entryId, data, token);
      const parts: string[] = [];
      if (data.teamId && league) {
        const idx = parseInt(data.teamId.replace("team_", ""), 10) - 1;
        const name = league.teamNames[idx] ?? data.teamId;
        parts.push(`team → ${name}`);
      }
      if (data.rosterSlot) parts.push(`slot → ${data.rosterSlot}`);
      if (data.price !== undefined) parts.push(`price → $${data.price}`);
      showToast(
        `✎ ${prev?.playerName ?? "Pick"} updated${parts.length ? ": " + parts.join(", ") : ""}`,
        "success",
      );
    } catch (err) {
      refreshRoster();
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="cc-page">
      <div className="cc-layout">
        <LeftPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          selectedPlayerPosition={selectedPlayer?.position ?? null}
          allPlayers={allPlayers}
          draftedIds={draftedIds}
          rosterEntries={rosterEntries}
          onRemovePick={handleRemovePick}
          onUpdatePick={handleUpdatePick}
        />
        <AuctionCenter
          rosterEntries={rosterEntries}
          refreshRoster={refreshRoster}
          allPlayers={allPlayers}
          selectedPlayer={selectedPlayer}
          setSelectedPlayer={setSelectedPlayer}
          draftedIds={draftedIds}
          myTeamEntries={myTeamEntries}
          showToast={showToast}
        />
        <RightPanel
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          myTeamEntries={myTeamEntries}
          allPlayers={allPlayers}
          rosterEntries={rosterEntries}
        />
      </div>
      {toast && (
        <div className={`cc-toast cc-toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
