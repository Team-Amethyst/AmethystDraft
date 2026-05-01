import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { RosterEntry } from "../api/roster";
import { getEligibleSlotsForPositions } from "../utils/eligibility";
import { RosterSlotPicker } from "./RosterSlotPicker";
import "./DraftLogRow.css";

interface DraftLogRowProps {
  entry: RosterEntry;
  pickNum: number;
  teamName: string;
  /** Highlight when this pick belongs to the signed-in user's team */
  isMyTeamPick?: boolean;
  headshot?: string;
  slotOptions: string[];
  teamOptions: { id: string; name: string }[];
  allRosterEntries?: RosterEntry[];
  leagueRosterSlots?: Record<string, number>;
  leagueBudget?: number;
  onUpdate?: (
    id: string,
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
  ) => void;
  onRemove?: (id: string) => void;
}

export function DraftLogRow({
  entry,
  pickNum,
  teamName,
  isMyTeamPick = false,
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

  // Show all teams — don't filter by capacity (too aggressive for an edit tool)
  const filteredTeamOptions = teamOptions;
  const [editing, setEditing] = useState(false);
  const [editSlot, setEditSlot] = useState(entry.rosterSlot);
  const [editPrice, setEditPrice] = useState(String(entry.price));
  const [editTeamId, setEditTeamId] = useState(entry.teamId);
  const [editKeeperContract, setEditKeeperContract] = useState(
    entry.keeperContract ?? "",
  );

  const eligibleSlots = getEligibleSlotsForPositions(entry.positions, slotOptions);
  const openSet = openSlots(editTeamId, slotOptions);
  const orderedOpenSlots = slotOptions.filter((s) => openSet.has(s));
  const eligibleOpenSlots = eligibleSlots.filter((s) => openSet.has(s));
  const isCurrentSlotOverridden = !eligibleSlots.includes(entry.rosterSlot);
  const initials = entry.playerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function openModal() {
    const o = openSlots(entry.teamId, slotOptions);
    const ord = slotOptions.filter((s) => o.has(s));
    const eligibleOrd = eligibleSlots.filter((s) => o.has(s));
    const slot = ord.includes(entry.rosterSlot)
      ? entry.rosterSlot
      : (eligibleOrd[0] ?? ord[0] ?? entry.rosterSlot);
    setEditSlot(slot);
    setEditPrice(String(entry.price));
    setEditTeamId(entry.teamId);
    setEditKeeperContract(entry.keeperContract ?? "");
    setEditing(true);
  }

  function handleTeamChange(newTeamId: string) {
    setEditTeamId(newTeamId);
    const nextOpen = openSlots(newTeamId, slotOptions);
    const ordered = slotOptions.filter((s) => nextOpen.has(s));
    if (!ordered.includes(editSlot)) {
      const eligibleOrdered = eligibleSlots.filter((s) => nextOpen.has(s));
      setEditSlot(eligibleOrdered[0] ?? ordered[0] ?? editSlot);
    }
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

    const data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    } = {};
    if (editSlot !== entry.rosterSlot) data.rosterSlot = editSlot;
    if (newPrice !== entry.price) data.price = newPrice;
    if (editTeamId !== entry.teamId) data.teamId = editTeamId;
    if (editKeeperContract.trim() !== (entry.keeperContract ?? "")) {
      data.keeperContract = editKeeperContract.trim();
    }
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
            <span className="dl-fantasy-team">
              {teamName}
              {isMyTeamPick ? (
                <span className="dl-you-suffix" aria-label="your team">
                  {" "}
                  (You)
                </span>
              ) : null}
            </span>
            <span className="dl-slot">{entry.rosterSlot}</span>
            {isCurrentSlotOverridden ? (
              <span className="dl-override-chip" title="Manual position override">
                OVR
              </span>
            ) : null}
            <span className="dl-price">${entry.price}</span>
            {entry.keeperContract ? (
              <span className="dl-slot" title="Keeper contract">
                {entry.keeperContract}
              </span>
            ) : null}
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
              <label className="dl-modal-field dl-modal-field--stack">
                <span className="dl-modal-label">Roster slot</span>
                <RosterSlotPicker
                  variant="modal"
                  value={editSlot}
                  onChange={setEditSlot}
                  orderedSlots={orderedOpenSlots}
                  eligibleSlots={eligibleOpenSlots}
                  warn={orderedOpenSlots.length === 0}
                  emptyLabel="— no open slots —"
                />
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
              <label className="dl-modal-field">
                <span className="dl-modal-label">Contract</span>
                <input
                  className="dl-modal-price-input"
                  type="text"
                  value={editKeeperContract}
                  onChange={(e) => setEditKeeperContract(e.target.value)}
                  placeholder="Arb / 3Y"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
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
