import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { RosterEntry } from "../api/roster";
import { getEligibleSlotsForPositions } from "../utils/eligibility";
import { validateRosterSlotAssignment } from "../validation/rosterSlot";
import PosBadge from "./PosBadge";
import { RosterSlotPicker } from "./RosterSlotPicker";
import "./DraftLogRow.css";

function DraftLogRosterSlotBadge({
  slot,
  overridden,
  className,
}: {
  slot: string;
  overridden: boolean;
  className?: string;
}) {
  return (
    <span
      className="dl-roster-slot-badge"
      title={overridden ? "Manual position override" : undefined}
    >
      <PosBadge
        pos={slot}
        className={
          (className ? `${className} ` : "") +
          (overridden ? "pos-badge--slot-override" : "")
        }
      />
    </span>
  );
}

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
  /**
   * `compact` — Command Center right rail (narrow columns).
   * `dense` — League Overview + full-view modal (#, player, MLB, team, slot, $).
   */
  variant?: "compact" | "dense";
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
  variant = "dense",
  onUpdate,
  onRemove,
}: DraftLogRowProps) {
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

    if (leagueBudget !== undefined && allRosterEntries && leagueRosterSlots) {
      const targetTeamId = editTeamId;
      const totalSlots = Object.values(leagueRosterSlots).reduce(
        (a, b) => a + b,
        0,
      );
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
        const alertTeam =
          teamOptions.find((t) => t.id === targetTeamId)?.name ?? targetTeamId;
        alert(`$${newPrice} exceeds ${alertTeam}'s max bid of $${maxBid}`);
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
    if (editSlot !== entry.rosterSlot || editTeamId !== entry.teamId) {
      const targetTeam =
        teamOptions.find((t) => t.id === editTeamId)?.name ?? editTeamId;
      const slotCheck = validateRosterSlotAssignment(
        { rosterSlots: leagueRosterSlots ?? {}, teamNames: teamOptions.map((t) => t.name) },
        targetTeam,
        entry.positions,
        editSlot,
        allRosterEntries ?? [],
        entry._id,
      );
      if (!slotCheck.ok) {
        alert(slotCheck.message);
        return;
      }
    }

    if (Object.keys(data).length > 0) onUpdate(entry._id, data);
    setEditing(false);
  }

  const isCompact = variant === "compact";

  const fantasyTeamLine = (
    <>
      {teamName}
      {isMyTeamPick ? (
        <span className="dl-you-suffix" aria-label="your team">
          {" "}
          (You)
        </span>
      ) : null}
      {entry.keeperContract ? (
        <span className="dl-keeper-inline" title="Keeper contract">
          {" · "}
          {entry.keeperContract}
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <div
        className={
          "draft-log-row" +
          (isCompact ? " draft-log-row--compact" : " draft-log-row--dense")
        }
        role="row"
      >
        <span className="dl-cell dl-cell--pick">#{pickNum}</span>

        <div className="dl-cell dl-cell--photo">
          {headshot ? (
            <img src={headshot} alt="" className="dl-headshot" />
          ) : (
            <div className="dl-headshot-fallback" aria-hidden>
              {initials}
            </div>
          )}
        </div>

        <div className="dl-cell dl-cell--player">
          {isCompact ? (
            <span className="dl-player-line" title={`${entry.playerName} · ${teamName}`}>
              <span className="dl-name">{entry.playerName}</span>
              <span className="dl-player-line-sep" aria-hidden>
                ·
              </span>
              <span className="dl-fantasy-team dl-fantasy-team--sub">{fantasyTeamLine}</span>
            </span>
          ) : (
            <span className="dl-name" title={entry.playerName}>
              {entry.playerName}
            </span>
          )}
        </div>

        {!isCompact ? (
          <>
            <span className="dl-cell dl-cell--mlb" title={entry.playerTeam ?? undefined}>
              {entry.playerTeam || "—"}
            </span>
            <span className="dl-cell dl-cell--team" title={teamName}>
              <span className="dl-fantasy-team">{fantasyTeamLine}</span>
            </span>
          </>
        ) : null}

        <span className="dl-cell dl-cell--slot">
          <DraftLogRosterSlotBadge
            slot={entry.rosterSlot}
            overridden={isCurrentSlotOverridden}
            className={isCompact ? "dl-pos-badge--compact" : "dl-pos-badge--dense-slot"}
          />
        </span>

        <span className="dl-cell dl-cell--price">
          <span className="dl-price">${entry.price}</span>
          {isCompact && (onUpdate || onRemove) ? (
            <div className="dl-actions dl-actions--compact">
              {onUpdate ? (
                <button className="dl-edit" title="Edit pick" type="button" onClick={openModal}>
                  <Pencil size={11} />
                </button>
              ) : null}
              {onRemove ? (
                <button
                  className="dl-remove"
                  title="Remove pick"
                  type="button"
                  onClick={() => onRemove(entry._id)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
        </span>

        {!isCompact ? (
          <div className="dl-cell dl-cell--actions">
            {onUpdate ? (
              <button className="dl-edit" title="Edit pick" type="button" onClick={openModal}>
                <Pencil size={11} />
              </button>
            ) : null}
            {onRemove ? (
              <button
                className="dl-remove"
                title="Remove pick"
                type="button"
                onClick={() => onRemove(entry._id)}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="dl-modal-overlay" onClick={() => setEditing(false)}>
          <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dl-modal-header">
              <span className="dl-modal-title">Edit Pick</span>
              <button
                className="dl-modal-close"
                type="button"
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
              {teamOptions.length > 0 ? (
                <label className="dl-modal-field">
                  <span className="dl-modal-label">Team</span>
                  <select
                    className="app-select app-select--compact dl-modal-select"
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
              ) : null}
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
                type="button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button className="dl-modal-save" type="button" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
