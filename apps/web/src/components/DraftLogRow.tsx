import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { RosterEntry } from "../api/roster";
import { getEligibleSlotsForPositions } from "../utils/eligibility";
import "./DraftLogRow.css";

interface DraftLogRowProps {
  entry: RosterEntry;
  pickNum: number;
  teamName: string;
  headshot?: string;
  slotOptions: string[];
  teamOptions: { id: string; name: string }[];
  allRosterEntries?: RosterEntry[];
  leagueRosterSlots?: Record<string, number>;
  leagueBudget?: number;
  onUpdate?: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
  onRemove?: (id: string) => void;
}

export function DraftLogRow({
  entry,
  pickNum,
  teamName,
  headshot,
  slotOptions,
  teamOptions,
  allRosterEntries,
  leagueRosterSlots,
  leagueBudget,
  onUpdate,
  onRemove,
}: DraftLogRowProps) {
  /**
   * Slots on a team (by teamId) that still have capacity.
   * Excludes the current entry so its slot is treated as free.
   */
  function openSlots(teamId: string, slots: string[]): Set<string> {
    if (!allRosterEntries || !leagueRosterSlots) return new Set(slots);
    const teamEntries = allRosterEntries.filter(
      (e) => e.teamId === teamId && e._id !== entry._id,
    );
    const filled = new Map<string, number>();
    teamEntries.forEach((e) => {
      filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1);
    });
    return new Set(
      slots.filter((s) => (filled.get(s) ?? 0) < (leagueRosterSlots[s] ?? 1)),
    );
  }

  /** All eligible slots for a given teamId */
  function validSlotsFor(teamId: string): string[] {
    const elig = getEligibleSlotsForPositions(entry.positions, slotOptions);
    if (elig.length === 0) return slotOptions;
    // For the current team filter to open slots; for reassignment show all eligible
    if (teamId === entry.teamId) {
      const open = openSlots(teamId, slotOptions);
      const filtered = elig.filter((s) => open.has(s));
      return filtered.length > 0 ? filtered : elig;
    }
    return elig;
  }

  // Show all teams — don't filter by capacity (too aggressive for an edit tool)
  const filteredTeamOptions = teamOptions;
  const [editing, setEditing] = useState(false);
  const [editSlot, setEditSlot] = useState(entry.rosterSlot);
  const [editPrice, setEditPrice] = useState(String(entry.price));
  const [editTeamId, setEditTeamId] = useState(entry.teamId);

  const currentValidSlots = validSlotsFor(editTeamId);
  const initials = entry.playerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function openModal() {
    setEditSlot(entry.rosterSlot);
    setEditPrice(String(entry.price));
    setEditTeamId(entry.teamId);
    setEditing(true);
  }

  function handleTeamChange(newTeamId: string) {
    setEditTeamId(newTeamId);
    const slots = validSlotsFor(newTeamId);
    if (!slots.includes(editSlot)) setEditSlot(slots[0] ?? editSlot);
  }

  function handleSave() {
    if (!onUpdate) return;
    const n = parseInt(editPrice, 10);
    const newPrice = isNaN(n) ? entry.price : n;

    // Max bid validation — only when price or team is changing
    if (leagueBudget !== undefined && allRosterEntries && leagueRosterSlots) {
      const targetTeamId = editTeamId;
      const totalSlots = Object.values(leagueRosterSlots).reduce(
        (a, b) => a + b,
        0,
      );
      // Entries for the target team, excluding this entry (we're replacing it)
      const teamEntries = allRosterEntries.filter(
        (e) => e.teamId === targetTeamId && e._id !== entry._id,
      );
      const spent = teamEntries.reduce((s, e) => s + e.price, 0);
      const filled = teamEntries.length;
      const open = Math.max(0, totalSlots - filled);
      const remaining = Math.max(0, leagueBudget - spent);
      const maxBid =
        open > 0 ? Math.max(1, remaining - (open - 1)) : leagueBudget;
      if (newPrice > maxBid) {
        const teamName =
          teamOptions.find((t) => t.id === targetTeamId)?.name ?? targetTeamId;
        alert(`$${newPrice} exceeds ${teamName}'s max bid of $${maxBid}`);
        return;
      }
    }

    const data: { price?: number; rosterSlot?: string; teamId?: string } = {};
    if (editSlot !== entry.rosterSlot) data.rosterSlot = editSlot;
    if (newPrice !== entry.price) data.price = newPrice;
    if (editTeamId !== entry.teamId) data.teamId = editTeamId;
    if (Object.keys(data).length > 0) onUpdate(entry._id, data);
    setEditing(false);
  }

  return (
    <>
      <div className="draft-log-row">
        <span className="dl-pick">#{pickNum}</span>
        {headshot ? (
          <img src={headshot} alt={entry.playerName} className="dl-headshot" />
        ) : (
          <div className="dl-headshot-fallback">{initials}</div>
        )}
        <div className="dl-body">
          <div className="dl-row-top">
            <span className="dl-name">{entry.playerName}</span>
          </div>
          <div className="dl-row-bottom">
            <span className="dl-fantasy-team">{teamName}</span>
            <span className="dl-slot">{entry.rosterSlot}</span>
            <span className="dl-price">${entry.price}</span>
          </div>
        </div>
        {onUpdate && (
          <button className="dl-edit" title="Edit pick" onClick={openModal}>
            <Pencil size={11} />
          </button>
        )}
        {onRemove && (
          <button
            className="dl-remove"
            title="Remove pick"
            onClick={() => onRemove(entry._id)}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {editing && (
        <div className="dl-modal-overlay" onClick={() => setEditing(false)}>
          <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dl-modal-header">
              <span className="dl-modal-title">Edit Pick</span>
              <button
                className="dl-modal-close"
                onClick={() => setEditing(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="dl-modal-player">
              {headshot ? (
                <img
                  src={headshot}
                  alt={entry.playerName}
                  className="dl-modal-headshot"
                />
              ) : (
                <div className="dl-modal-initials">{initials}</div>
              )}
              <div>
                <div className="dl-modal-player-name">{entry.playerName}</div>
              </div>
            </div>
            <div className="dl-modal-fields">
              {teamOptions.length > 0 && (
                <label className="dl-modal-field">
                  <span className="dl-modal-label">Team</span>
                  <select
                    className="dl-modal-select"
                    value={editTeamId}
                    onChange={(e) => handleTeamChange(e.target.value)}
                  >
                    {filteredTeamOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="dl-modal-field">
                <span className="dl-modal-label">Position</span>
                <select
                  className="dl-modal-select"
                  value={editSlot}
                  onChange={(e) => setEditSlot(e.target.value)}
                >
                  {currentValidSlots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dl-modal-field">
                <span className="dl-modal-label">Price Paid</span>
                <div className="dl-modal-price-wrap">
                  <span className="dl-modal-dollar">$</span>
                  <input
                    className="dl-modal-price-input"
                    type="number"
                    min={0}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                  />
                </div>
              </label>
            </div>
            <div className="dl-modal-actions">
              <button
                className="dl-modal-cancel"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button className="dl-modal-save" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
