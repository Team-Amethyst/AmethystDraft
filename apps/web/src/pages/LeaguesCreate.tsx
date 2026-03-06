import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router";
import "./LeaguesCreate.css";

type Step = 1 | 2 | 3 | 4;

type RosterSlot = {
  position: string;
  count: number;
};

type Player = {
  id: number;
  name: string;
  team: string;
  pos: string;
  adp: number;
};

type TeamKeeper = {
  slot: string;
  playerName: string;
  team: string;
  cost: number;
};

type TeamKeepersMap = Record<string, TeamKeeper[]>;

const rosterDefaults: RosterSlot[] = [
  { position: "C", count: 1 },
  { position: "1B", count: 1 },
  { position: "2B", count: 1 },
  { position: "SS", count: 1 },
  { position: "3B", count: 1 },
  { position: "MI", count: 1 },
  { position: "CI", count: 1 },
  { position: "OF", count: 3 },
  { position: "UTIL", count: 1 },
  { position: "SP", count: 5 },
  { position: "RP", count: 2 },
  { position: "BN", count: 3 },
];

const availablePlayers: Player[] = [
  { id: 1, name: "Ronald Acuña Jr.", team: "ATL", pos: "OF", adp: 1.2 },
  { id: 2, name: "Shohei Ohtani", team: "LAD", pos: "TWP", adp: 2.5 },
  { id: 3, name: "Julio Rodríguez", team: "SEA", pos: "OF", adp: 3.8 },
  { id: 4, name: "Bobby Witt Jr.", team: "KC", pos: "SS", adp: 4.1 },
  { id: 5, name: "Corbin Carroll", team: "ARI", pos: "OF", adp: 5.4 },
  { id: 6, name: "Mookie Betts", team: "LAD", pos: "2B/OF", adp: 6.2 },
  { id: 7, name: "Freddie Freeman", team: "LAD", pos: "1B", adp: 7.0 },
  { id: 8, name: "Kyle Tucker", team: "HOU", pos: "OF", adp: 8.5 },
];

const hittingStats = [
  "Runs (R)",
  "Home Runs (HR)",
  "Runs Batted In (RBI)",
  "Stolen Bases (SB)",
  "Batting Average (AVG)",
  "On-Base Percentage (OBP)",
  "Slugging Percentage (SLG)",
  "Total Bases (TB)",
  "Hits (H)",
  "Walks (BB)",
  "Strikeouts (K)",
];

const pitchingStats = [
  "Wins (W)",
  "Strikeouts (K)",
  "Earned Run Average (ERA)",
  "WHIP (Walks + Hits per IP)",
  "Saves (SV)",
  "Holds (HLD)",
  "Quality Starts (QS)",
  "Innings Pitched (IP)",
  "Complete Games (CG)",
  "Wins + Quality Starts (W+QS)",
];

const keeperSlots = ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "IF", "P"];

const stepLabels: Record<Step, string> = {
  1: "League Setup",
  2: "Scoring",
  3: "Team Names",
  4: "Keepers",
};

export default function LeagueCreate() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);

  const [leagueName, setLeagueName] = useState("Friendly League");
  const [teams, setTeams] = useState(12);
  const [budget, setBudget] = useState(260);
  const [rosterSlots, setRosterSlots] = useState<RosterSlot[]>(rosterDefaults);

  const [playerPool, setPlayerPool] = useState<"Mixed MLB" | "AL-Only" | "NL-Only">("Mixed MLB");
  const [selectedHitting, setSelectedHitting] = useState<string[]>([
    "Runs (R)",
    "Home Runs (HR)",
    "Runs Batted In (RBI)",
    "Stolen Bases (SB)",
    "Batting Average (AVG)",
  ]);
  const [selectedPitching, setSelectedPitching] = useState<string[]>([
    "Wins (W)",
    "Strikeouts (K)",
    "Earned Run Average (ERA)",
    "WHIP (Walks + Hits per IP)",
    "Saves (SV)",
  ]);

  const [teamNames, setTeamNames] = useState<string[]>(
    Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`)
  );

  const [activeKeeperTeam, setActiveKeeperTeam] = useState("Team 1");
  const [playerSearch, setPlayerSearch] = useState("");

  const [teamKeepers, setTeamKeepers] = useState<TeamKeepersMap>({
    "Team 1": [
      { slot: "C", playerName: "J.T. Realmuto", team: "PHI", cost: 29 },
      { slot: "SS", playerName: "Bobby Witt Jr.", team: "KC", cost: 19 },
      { slot: "OF", playerName: "Ronald Acuña Jr.", team: "ATL", cost: 17 },
    ],
  });

  const totalRosterSpots = useMemo(
    () => rosterSlots.reduce((sum, slot) => sum + slot.count, 0),
    [rosterSlots]
  );

  const filteredPlayers = useMemo(() => {
    return availablePlayers.filter((player) =>
      player.name.toLowerCase().includes(playerSearch.toLowerCase())
    );
  }, [playerSearch]);

  const currentKeepers = teamKeepers[activeKeeperTeam] ?? [];
  const keeperBudgetUsed = currentKeepers.reduce((sum, keeper) => sum + keeper.cost, 0);
  const remainingBudget = budget - keeperBudgetUsed;
  const completionPercent = Math.round((currentKeepers.length / keeperSlots.length) * 100);

  const goBack = () => {
    if (step === 1) {
      navigate("/leagues");
      return;
    }
    setStep((prev) => (prev - 1) as Step);
  };

  const goNext = () => {
    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
      return;
    }
    navigate("/leagues");   
    console.log("Create league payload", {
      leagueName,
      teams,
      budget,
      rosterSlots,
      playerPool,
      selectedHitting,
      selectedPitching,
      teamNames,
      teamKeepers,
    });
  };

  const toggleStat = (
    stat: string,
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(stat)) {
      setter(selected.filter((s) => s !== stat));
    } else {
      setter([...selected, stat]);
    }
  };

  const updateRosterCount = (position: string, delta: number) => {
    setRosterSlots((prev) =>
      prev.map((slot) =>
        slot.position === position
          ? { ...slot, count: Math.max(0, slot.count + delta) }
          : slot
      )
    );
  };

  const updateTeamName = (index: number, value: string) => {
    const next = [...teamNames];
    const previousName = next[index];
    next[index] = value;
    setTeamNames(next);

    if (previousName === activeKeeperTeam) {
      setActiveKeeperTeam(value || `Team ${index + 1}`);
    }
  };

  const addKeeper = (player: Player) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    if (current.length >= keeperSlots.length) return;

    const nextSlot = keeperSlots[current.length];
    const cost = Math.floor(player.adp * 2 + 10);

    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: [
        ...current,
        {
          slot: nextSlot,
          playerName: player.name,
          team: player.team,
          cost,
        },
      ],
    });
  };

  const removeKeeper = (index: number) => {
    const current = teamKeepers[activeKeeperTeam] ?? [];
    const updated = current.filter((_, i) => i !== index);

    setTeamKeepers({
      ...teamKeepers,
      [activeKeeperTeam]: updated,
    });
  };

  return (
    <div className="league-create-page">
      <header className="league-create-topbar">
        <div className="league-create-brand">
          <span className="league-create-brand-icon">⚡</span>
          <span>DRAFTROOM</span>
        </div>
        <div className="league-create-profile">◦</div>
      </header>

      <div className="league-create-main">
        <button className="league-create-back" onClick={goBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="league-create-step-row">
          <div className="league-create-steps">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="league-create-step-item">
                <div className={`league-create-step-circle ${step >= n ? "active" : ""}`}>
                  {n}
                </div>
                {n < 4 && (
                  <div className={`league-create-step-line ${step > n ? "active" : ""}`} />
                )}
              </div>
            ))}
          </div>
          <div className="league-create-step-label">{stepLabels[step]}</div>
        </div>

        <section className="league-create-card">
          {step === 1 && (
            <>
              <div className="league-create-card-header">
                <h2>Edit League</h2>
                <p>Set up your MLB auction league structure.</p>
              </div>

              <div className="league-create-form-grid">
                <div className="league-create-field">
                  <label>LEAGUE NAME</label>
                  <input
                    value={leagueName}
                    onChange={(e) => setLeagueName(e.target.value)}
                  />
                </div>

                <div className="league-create-field">
                  <label>TEAMS</label>
                  <input
                    type="number"
                    value={teams}
                    onChange={(e) => setTeams(Number(e.target.value))}
                  />
                </div>

                <div className="league-create-field">
                  <label>BUDGET ($)</label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="league-create-section">
                <div className="league-create-section-title">ROSTER SLOTS (MLB STANDARD)</div>

                <div className="league-create-roster-table">
                  <div className="league-create-roster-header">
                    <span>POSITION</span>
                    <span>COUNT</span>
                  </div>

                  {rosterSlots.map((slot) => (
                    <div key={slot.position} className="league-create-roster-row">
                      <span>{slot.position}</span>

                      <div className="league-create-roster-controls">
                        <button type="button" onClick={() => updateRosterCount(slot.position, -1)}>
                          −
                        </button>
                        <span>{slot.count}</span>
                        <button type="button" onClick={() => updateRosterCount(slot.position, 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="league-create-total">Total: {totalRosterSpots} roster spots</div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="league-create-section-panel">
                <div className="league-create-section-title">Player Pool</div>

                <div className="league-create-pool-grid">
                  {["Mixed MLB", "AL-Only", "NL-Only"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`league-create-pool-card ${
                        playerPool === option ? "selected" : ""
                      }`}
                      onClick={() =>
                        setPlayerPool(option as "Mixed MLB" | "AL-Only" | "NL-Only")
                      }
                    >
                      <strong>{option}</strong>
                      <span>
                        {option === "Mixed MLB"
                          ? "All players available"
                          : option === "AL-Only"
                          ? "American League only"
                          : "National League only"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="league-create-stats-wrap">
                <div className="league-create-section-title">STAT SELECTION</div>
                <p className="league-create-mini-copy">
                  Select the individual stats for your Rotisserie league scoring.
                </p>

                <div className="league-create-stats-grid">
                  <div className="league-create-stats-column">
                    <div className="league-create-subtitle">HITTING STATS</div>
                    <div className="league-create-check-grid">
                      {hittingStats.map((stat) => (
                        <label key={stat} className="league-create-check-card">
                          <input
                            type="checkbox"
                            checked={selectedHitting.includes(stat)}
                            onChange={() =>
                              toggleStat(stat, selectedHitting, setSelectedHitting)
                            }
                          />
                          <span>{stat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="league-create-stats-column">
                    <div className="league-create-subtitle">PITCHING STATS</div>
                    <div className="league-create-check-grid">
                      {pitchingStats.map((stat) => (
                        <label key={stat} className="league-create-check-card">
                          <input
                            type="checkbox"
                            checked={selectedPitching.includes(stat)}
                            onChange={() =>
                              toggleStat(stat, selectedPitching, setSelectedPitching)
                            }
                          />
                          <span>{stat}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="league-create-team-panel">
                <div className="league-create-team-header">
                  Name all {teams} teams in your league
                </div>

                <div className="league-create-team-grid">
                  {teamNames.slice(0, teams).map((team, index) => (
                    <div key={index} className="league-create-field">
                      <label>Team {index + 1}</label>
                      <input
                        value={team}
                        onChange={(e) => updateTeamName(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="league-create-keeper-select">
                <select
                  value={activeKeeperTeam}
                  onChange={(e) => setActiveKeeperTeam(e.target.value)}
                >
                  {teamNames.slice(0, teams).map((team, index) => (
                    <option key={index} value={team}>
                      Managing Keepers for: {team}
                    </option>
                  ))}
                </select>
              </div>

              <div className="league-create-keepers-layout">
                <div className="league-create-keeper-panel dark">
                  <div className="league-create-keeper-title">1. AVAILABLE PLAYERS</div>

                  <div className="league-create-searchbar">
                    <Search size={15} />
                    <input
                      placeholder="Search..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                    />
                  </div>

                  <div className="league-create-filter-row">
                    {["ALL", "C", "IF", "OF", "P"].map((filter) => (
                      <button key={filter} type="button">
                        {filter}
                      </button>
                    ))}
                  </div>

                  <div className="league-create-player-list">
                    {filteredPlayers.map((player) => (
                      <div key={player.id} className="league-create-player-row">
                        <div className="league-create-avatar">
                          {player.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>

                        <div className="league-create-player-main">
                          <div className="league-create-player-name">{player.name}</div>
                          <div className="league-create-player-meta">{player.team}</div>
                        </div>

                        <div className="league-create-player-badge">{player.pos}</div>
                        <div className="league-create-player-adp">ADP {player.adp}</div>

                        <button type="button" onClick={() => addKeeper(player)}>
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="league-create-keeper-panel dark">
                  <div className="league-create-keeper-title">
                    2. {activeKeeperTeam.toUpperCase()} KEEPER ROSTER
                  </div>

                  <div className="league-create-progress-copy">
                    <span>
                      {completionPercent}% Completed ({currentKeepers.length}/{keeperSlots.length})
                    </span>
                  </div>

                  <div className="league-create-progressbar">
                    <div style={{ width: `${completionPercent}%` }} />
                  </div>

                  <div className="league-create-budget">Remaining Budget: ${remainingBudget}</div>

                  <div className="league-create-roster-list">
                    {keeperSlots.map((slot, index) => {
                      const keeper = currentKeepers[index];

                      return (
                        <div key={`${slot}-${index}`} className="league-create-roster-keeper-row">
                          <div className="league-create-roster-slot">{slot}</div>

                          <div className="league-create-roster-player">
                            {keeper ? `${keeper.playerName} (${keeper.team})` : "(EMPTY SLOT)"}
                          </div>

                          <div className="league-create-roster-cost">
                            ${keeper ? keeper.cost : 0}
                          </div>

                          {keeper ? (
                            <button
                              type="button"
                              className="league-create-remove"
                              onClick={() => removeKeeper(index)}
                            >
                              REMOVE
                            </button>
                          ) : (
                            <div className="league-create-empty">—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="league-create-actions">
            <button type="button" className="league-create-primary" onClick={goNext}>
              <span>{step === 4 ? "Create League" : "Continue"}</span>
              {step !== 4 && <ChevronRight size={16} />}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}