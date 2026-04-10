/**
 * AddPlayerModal
 *
 * Reusable modal for creating a custom player when their data is not
 * available from the MLB Stats API. Enforces the existing Player schema:
 * required fields (name, team, position) + optional batting or pitching stats.
 *
 * Usage:
 *   <AddPlayerModal
 *     isOpen={showModal}
 *     onClose={() => setShowModal(false)}
 *     onSave={(player) => handleCustomPlayer(player)}
 *   />
 */

import { useState } from "react";
import type { Player } from "../types/player";
import "./AddPlayerModal.css";

// All positions supported by the Player schema
const POSITIONS = ["C", "1B", "2B", "SS", "3B", "OF", "DH", "SP", "RP", "P", "UTIL"];

const BATTER_POSITIONS = new Set(["C", "1B", "2B", "SS", "3B", "OF", "DH", "UTIL"]);
const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the fully constructed Player object once the form is submitted */
  onSave: (player: Player) => void;
}

interface FormState {
  // Required
  name: string;
  team: string;
  position: string;
  // Optional meta
  age: string;
  // Optional batting stats
  avg: string;
  hr: string;
  rbi: string;
  runs: string;
  sb: string;
  obp: string;
  slg: string;
  // Optional pitching stats
  era: string;
  whip: string;
  wins: string;
  saves: string;
  strikeouts: string;
  innings: string;
}

const EMPTY_FORM: FormState = {
  name: "", team: "", position: "OF", age: "",
  avg: "", hr: "", rbi: "", runs: "", sb: "", obp: "", slg: "",
  era: "", whip: "", wins: "", saves: "", strikeouts: "", innings: "",
};

function buildPlayer(form: FormState): Player {
  const isBatter = BATTER_POSITIONS.has(form.position);
  const isPitcher = PITCHER_POSITIONS.has(form.position);

  // Batting stats — only include if position is a batter position
  const battingStats = isBatter ? {
    avg:  form.avg  || ".000",
    hr:   parseInt(form.hr)   || 0,
    rbi:  parseInt(form.rbi)  || 0,
    runs: parseInt(form.runs) || 0,
    sb:   parseInt(form.sb)   || 0,
    obp:  form.obp  || ".000",
    slg:  form.slg  || ".000",
  } : undefined;

  // Pitching stats — only include if position is a pitcher position
  const pitchingStats = isPitcher ? {
    era:          form.era   || "0.00",
    whip:         form.whip  || "0.00",
    wins:         parseInt(form.wins)       || 0,
    saves:        parseInt(form.saves)      || 0,
    strikeouts:   parseInt(form.strikeouts) || 0,
    innings:      form.innings || "0.0",
    holds:        0,
    completeGames: 0,
  } : undefined;

  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    mlbId:    0,           // 0 = no MLB Stats API ID
    name:     form.name.trim(),
    team:     form.team.trim().toUpperCase(),
    position: form.position,
    age:      parseInt(form.age) || 0,
    adp:      999,         // custom players go to the bottom of ADP rankings
    value:    0,
    tier:     5,
    headshot: "",          // no headshot for custom players
    outlook:  "",
    stats: {
      batting:  battingStats,
      pitching: pitchingStats,
    },
    projection: {
      batting:  battingStats ? {
        avg:  battingStats.avg,
        hr:   battingStats.hr,
        rbi:  battingStats.rbi,
        runs: battingStats.runs,
        sb:   battingStats.sb,
      } : undefined,
      pitching: pitchingStats ? {
        era:          pitchingStats.era,
        whip:         pitchingStats.whip,
        wins:         pitchingStats.wins,
        saves:        pitchingStats.saves,
        strikeouts:   pitchingStats.strikeouts,
        holds:        0,
        completeGames: 0,
        innings:      pitchingStats.innings ? parseFloat(pitchingStats.innings) : undefined,
      } : undefined,
    },
  };
}

export default function AddPlayerModal({ isOpen, onClose, onSave }: AddPlayerModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showStats, setShowStats] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  if (!isOpen) return null;

  const isBatter  = BATTER_POSITIONS.has(form.position);
  const isPitcher = PITCHER_POSITIONS.has(form.position);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!form.name.trim())     next.name     = "Player name is required";
    if (!form.team.trim())     next.team     = "Team abbreviation is required";
    if (!form.position)        next.position = "Position is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const player = buildPlayer(form);
    onSave(player);
    setForm(EMPTY_FORM);
    setShowStats(false);
    setErrors({});
    onClose();
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    setShowStats(false);
    setErrors({});
    onClose();
  }

  return (
    <div className="apm-overlay" onClick={handleClose}>
      <div className="apm-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="apm-header">
          <div>
            <h2 className="apm-title">Add Custom Player</h2>
            <p className="apm-subtitle">
              Player not found in the MLB data source? Add them manually.
            </p>
          </div>
          <button className="apm-close" onClick={handleClose}>✕</button>
        </div>

        {/* Required fields */}
        <div className="apm-section-label">Required Information</div>
        <div className="apm-required-grid">
          <div className="apm-field">
            <label className="apm-label">Full Name *</label>
            <input
              className={"apm-input" + (errors.name ? " apm-input--error" : "")}
              type="text"
              placeholder="e.g. Shohei Ohtani"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
            {errors.name && <span className="apm-error">{errors.name}</span>}
          </div>

          <div className="apm-field">
            <label className="apm-label">Team *</label>
            <input
              className={"apm-input" + (errors.team ? " apm-input--error" : "")}
              type="text"
              placeholder="e.g. LAD"
              maxLength={4}
              value={form.team}
              onChange={(e) => set("team", e.target.value.toUpperCase())}
            />
            {errors.team && <span className="apm-error">{errors.team}</span>}
          </div>

          <div className="apm-field">
            <label className="apm-label">Position *</label>
            <select
              className="apm-select"
              value={form.position}
              onChange={(e) => set("position", e.target.value)}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="apm-field">
            <label className="apm-label">Age <span className="apm-optional">(optional)</span></label>
            <input
              className="apm-input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 27"
              maxLength={2}
              value={form.age}
              onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        {/* Optional stats toggle */}
        <button
          className="apm-stats-toggle"
          type="button"
          onClick={() => setShowStats((v) => !v)}
        >
          <span>{showStats ? "▾" : "▸"}</span>
          {showStats ? "Hide" : "Add"} Stats{" "}
          <span className="apm-optional">(optional)</span>
        </button>

        {showStats && (
          <div className="apm-stats-section">
            {isBatter && (
              <>
                <div className="apm-section-label">Batting Stats</div>
                <div className="apm-stats-grid">
                  <div className="apm-field">
                    <label className="apm-label">AVG</label>
                    <input className="apm-input" type="text" placeholder=".285" maxLength={5}
                      value={form.avg} onChange={(e) => set("avg", e.target.value)} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">HR</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="30"
                      value={form.hr} onChange={(e) => set("hr", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">RBI</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="90"
                      value={form.rbi} onChange={(e) => set("rbi", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">R</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="85"
                      value={form.runs} onChange={(e) => set("runs", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">SB</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="15"
                      value={form.sb} onChange={(e) => set("sb", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">OBP</label>
                    <input className="apm-input" type="text" placeholder=".350" maxLength={5}
                      value={form.obp} onChange={(e) => set("obp", e.target.value)} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">SLG</label>
                    <input className="apm-input" type="text" placeholder=".480" maxLength={5}
                      value={form.slg} onChange={(e) => set("slg", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {isPitcher && (
              <>
                <div className="apm-section-label">Pitching Stats</div>
                <div className="apm-stats-grid">
                  <div className="apm-field">
                    <label className="apm-label">ERA</label>
                    <input className="apm-input" type="text" placeholder="3.50" maxLength={5}
                      value={form.era} onChange={(e) => set("era", e.target.value)} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">WHIP</label>
                    <input className="apm-input" type="text" placeholder="1.15" maxLength={5}
                      value={form.whip} onChange={(e) => set("whip", e.target.value)} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">W</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="12"
                      value={form.wins} onChange={(e) => set("wins", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">SV</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="30"
                      value={form.saves} onChange={(e) => set("saves", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">K</label>
                    <input className="apm-input" type="text" inputMode="numeric" placeholder="200"
                      value={form.strikeouts} onChange={(e) => set("strikeouts", e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">IP</label>
                    <input className="apm-input" type="text" placeholder="180.0" maxLength={6}
                      value={form.innings} onChange={(e) => set("innings", e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {!isBatter && !isPitcher && (
              <p className="apm-no-stats">Select a position above to see relevant stat fields.</p>
            )}
          </div>
        )}

        {/* Custom player notice */}
        <div className="apm-notice">
          <span className="apm-notice-icon">ℹ</span>
          This player will be tagged as <strong>custom</strong> and saved locally,
          then synced to your league database. They will appear in the player list
          and can be drafted normally.
        </div>

        {/* Actions */}
        <div className="apm-actions">
          <button className="apm-btn-cancel" type="button" onClick={handleClose}>
            Cancel
          </button>
          <button className="apm-btn-save" type="button" onClick={handleSubmit}>
            Add Player
          </button>
        </div>
      </div>
    </div>
  );
}