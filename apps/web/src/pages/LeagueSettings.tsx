import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useLeague } from "../contexts/LeagueContext";
import type { League } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useLeagueForm } from "../hooks/useLeagueForm";
import { usePageTitle } from "../hooks/usePageTitle";
import { hittingStats, pitchingStats } from "../types/league";
import { updateLeague } from "../api/leagues";
import { LeagueRosterSlotsEditor } from "../components/leagues/LeagueRosterSlotsEditor";
import { LeagueKeepersForm } from "./LeagueKeepersForm";
import {
  PLAYER_POOL_OPTIONS,
  extractStatAbbreviation,
  poolApiToForm,
  poolFormToApi,
} from "../features/leagues/shared";
import {
  LEAGUE_TEAMS_MAX,
  LEAGUE_TEAMS_MIN,
  leaguePayloadFromCreateForm,
  validateLeaguePayload,
} from "../validation/leaguePayload";
import "./LeagueSettings.css";

type Section = "setup" | "scoring" | "teams" | "keepers";

const navItems: { id: Section; label: string; desc: string }[] = [
  { id: "setup", label: "League Setup", desc: "Name, teams, budget, roster" },
  { id: "scoring", label: "Scoring", desc: "Player pool & stat categories" },
  { id: "teams", label: "Team Names", desc: "Customize each team's name" },
  { id: "keepers", label: "Keepers", desc: "Keeper slots, costs & contracts" },
];

function sectionFromParam(value: string | null): Section {
  if (value === "scoring" || value === "teams" || value === "keepers") {
    return value;
  }
  return "setup";
}

export default function LeagueSettings() {
  const { league, loading } = useLeague();
  if (loading && !league)
    return (
      <div className="ls-page theme-page-gradient">
        <div
          className="ls-container"
          style={{ padding: "40px 0", color: "var(--text-muted)" }}
        >
          Loading…
        </div>
      </div>
    );
  if (!league) return null;
  return <LeagueSettingsForm league={league} />;
}

function LeagueSettingsForm({ league }: { league: League }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  usePageTitle(`${league.name} Settings`);
  const [activeSection, setActiveSection] = useState<Section>(() =>
    sectionFromParam(searchParams.get("section")),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [posEligibilityRaw, setPosEligibilityRaw] = useState(
    String(league.posEligibilityThreshold ?? 20),
  );

  const {
    leagueName,
    setLeagueName,
    teams,
    setTeams,
    budget,
    setBudget,
    posEligibilityThreshold,
    setPosEligibilityThreshold,
    rosterSlots,
    totalRosterSpots,
    playerPool,
    setPlayerPool,
    selectedHitting,
    setSelectedHitting,
    selectedPitching,
    setSelectedPitching,
    teamNames,
    toggleStat,
    setRosterCount,
    resetRosterSlots,
    updateTeamName,
  } = useLeagueForm({
    initialName: league.name,
    initialTeams: league.teams,
    initialBudget: league.budget,
    initialPlayerPool: poolApiToForm(league.playerPool),
    initialHitting: hittingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "batting" && c.name === extractStatAbbreviation(s),
      ),
    ),
    initialPitching: pitchingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "pitching" && c.name === extractStatAbbreviation(s),
      ),
    ),
    initialRosterSlots: league.rosterSlots,
    initialTeamNames: league.teamNames,
    initialPosEligibilityThreshold: league.posEligibilityThreshold ?? 20,
    initialKeepers: {},
    externalPlayers: [],
  });

  const backPath = `/leagues/${league.id}/research`;

  useEffect(() => {
    setActiveSection(sectionFromParam(searchParams.get("section")));
  }, [searchParams]);

  const selectSection = (section: Section) => {
    setActiveSection(section);
    const next = new URLSearchParams(searchParams);
    if (section === "setup") {
      next.delete("section");
    } else {
      next.set("section", section);
    }
    setSearchParams(next, { replace: true });
  };

  const handleSave = async () => {
    if (!token) return;
    const rosterSlotsMap = Object.fromEntries(
      rosterSlots.map((s) => [s.position, s.count]),
    );
    const validation = validateLeaguePayload(
      leaguePayloadFromCreateForm({
        leagueName,
        teams,
        budget,
        posEligibilityThreshold: Math.max(1, posEligibilityThreshold || 1),
        rosterSlots: rosterSlotsMap,
        scoringCategories: [
          ...selectedHitting.map((s) => ({
            name: extractStatAbbreviation(s),
            type: "batting" as const,
          })),
          ...selectedPitching.map((s) => ({
            name: extractStatAbbreviation(s),
            type: "pitching" as const,
          })),
        ],
        playerPool: poolFormToApi(playerPool),
      }),
    );
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setSaveError(validation.message);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      await updateLeague(
        league.id,
        {
          name: leagueName,
          teams,
          budget,
          posEligibilityThreshold: Math.max(1, posEligibilityThreshold || 1),
          rosterSlots: rosterSlotsMap,
          scoringCategories: [
            ...selectedHitting.map((s) => ({
              name: extractStatAbbreviation(s),
              type: "batting" as const,
            })),
            ...selectedPitching.map((s) => ({
              name: extractStatAbbreviation(s),
              type: "pitching" as const,
            })),
          ],
          playerPool: poolFormToApi(playerPool),
          teamNames: teamNames.slice(0, teams),
        },
        token,
      );

      refreshLeagues();
      navigate(backPath);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ls-page">
      <div className="ls-container">
        <button className="ls-back" onClick={() => navigate(backPath)}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="ls-header">
          <h1>{league.name} Settings</h1>
          <p>
            Update league setup, scoring, team names, and keeper rosters. Keepers
            use their own save button on the Keepers tab.
          </p>
        </div>

        <div className="ls-layout">
          {/* Sidebar nav */}
          <nav className="ls-nav theme-surface">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={
                  "ls-nav-item" +
                  (activeSection === item.id ? " ls-nav-item-active" : "")
                }
                onClick={() => selectSection(item.id)}
              >
                <span className="ls-nav-label">{item.label}</span>
                <span className="ls-nav-desc">{item.desc}</span>
              </button>
            ))}
          </nav>

          {/* Content panel */}
          <div className="ls-panel theme-surface">
            {activeSection === "setup" && (
              <div className="ls-section">
                <div className="ls-section-heading">League Setup</div>
                <div className="ls-setup-layout">
                  <div className="ls-form-grid ls-setup-left">
                    <div className="ls-field">
                      <label>LEAGUE NAME</label>
                      <input
                        value={leagueName}
                        onChange={(e) => setLeagueName(e.target.value)}
                      />
                    </div>
                    <div className="ls-field">
                      <label>TEAMS</label>
                      <input
                        type="number"
                        min={LEAGUE_TEAMS_MIN}
                        max={LEAGUE_TEAMS_MAX}
                        step={1}
                        value={teams}
                        onChange={(e) => setTeams(Number(e.target.value))}
                        aria-invalid={fieldErrors.teams ? true : undefined}
                      />
                      {fieldErrors.teams ? (
                        <p className="ls-field-error">{fieldErrors.teams}</p>
                      ) : (
                        <p className="ls-field-hint">
                          {LEAGUE_TEAMS_MIN}–{LEAGUE_TEAMS_MAX} teams
                        </p>
                      )}
                    </div>
                    <div className="ls-field">
                      <label>BUDGET ($)</label>
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(Number(e.target.value))}
                      />
                    </div>
                    <div className="ls-field">
                      <label>POSITION ELIGIBILITY (MIN. GAMES)</label>
                      <input
                        type="number"
                        value={posEligibilityRaw}
                        min={1}
                        onChange={(e) => setPosEligibilityRaw(e.target.value)}
                        onBlur={() => {
                          const clamped = Math.max(
                            1,
                            Number(posEligibilityRaw) || 1,
                          );
                          setPosEligibilityThreshold(clamped);
                          setPosEligibilityRaw(String(clamped));
                        }}
                      />
                    </div>

                    <div className="ls-setup-subcard">
                      <div className="ls-label">PLAYER POOL</div>
                      <div className="ls-pool-grid ls-pool-grid--setup">
                        {PLAYER_POOL_OPTIONS.map((option) => (
                          <button
                            key={option.formValue}
                            type="button"
                            className={
                              "ls-pool-card" +
                              (playerPool === option.formValue
                                ? " ls-pool-card-selected"
                                : "")
                            }
                            onClick={() => setPlayerPool(option.formValue)}
                          >
                            <strong>{option.formValue}</strong>
                            <span>{option.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="ls-subsection ls-setup-slots ls-setup-right">
                    <div className="ls-label">ROSTER SLOTS</div>
                    <LeagueRosterSlotsEditor
                      className="league-roster-editor--static"
                      rosterSlots={rosterSlots}
                      totalRosterSpots={totalRosterSpots}
                      onSetRosterCount={setRosterCount}
                      onResetRosterSlots={resetRosterSlots}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "scoring" && (
              <div className="ls-section">
                <div className="ls-section-heading">Scoring</div>

                <div className="ls-subsection">
                  <div className="ls-label">STAT CATEGORIES</div>
                  <div className="ls-stats-grid">
                    <div className="ls-stats-col">
                      <div className="ls-sublabel">HITTING</div>
                      <div className="ls-check-grid">
                        {hittingStats.map((stat) => (
                          <label key={stat} className="ls-check-card">
                            <input
                              type="checkbox"
                              checked={selectedHitting.includes(stat)}
                              onChange={() =>
                                toggleStat(
                                  stat,
                                  selectedHitting,
                                  setSelectedHitting,
                                )
                              }
                            />
                            <span>{stat}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="ls-stats-col">
                      <div className="ls-sublabel">PITCHING</div>
                      <div className="ls-check-grid">
                        {pitchingStats.map((stat) => (
                          <label key={stat} className="ls-check-card">
                            <input
                              type="checkbox"
                              checked={selectedPitching.includes(stat)}
                              onChange={() =>
                                toggleStat(
                                  stat,
                                  selectedPitching,
                                  setSelectedPitching,
                                )
                              }
                            />
                            <span>{stat}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "teams" && (
              <div className="ls-section">
                <div className="ls-section-heading">Team Names</div>
                <p className="ls-copy">
                  Name all {teams} teams in your league.
                </p>
                <div className="ls-team-grid">
                  {teamNames.slice(0, teams).map((name, i) => (
                    <div key={i} className="ls-field">
                      <label>Team {i + 1}</label>
                      <input
                        value={name}
                        onChange={(e) => updateTeamName(i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "keepers" && (
              <LeagueKeepersForm league={league} embedded />
            )}

            {activeSection !== "keepers" && (
            <div className="ls-save-row">
              {saveError && (
                <p className="ls-save-error">{saveError}</p>
              )}
              <button
                className="ls-save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={15} />
                <span>{saving ? "Saving…" : "Save Settings"}</span>
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
