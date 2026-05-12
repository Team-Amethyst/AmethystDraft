import { useEffect, useState } from "react";
import type { Player } from "../../types/league";
import { KeeperSlotSelectWithOverride } from "./KeeperSlotSelectWithOverride";
import "./KeeperDraftInlineExpand.css";

export function KeeperDraftInlineExpand({
  player,
  eligibleSlots,
  assignableSlots,
  defaultCost,
  onDraft,
  onCancel,
}: {
  player: Player;
  eligibleSlots: string[];
  /** All roster positions with capacity (may exceed eligible for commissioner override). */
  assignableSlots: string[];
  defaultCost: number;
  onDraft: (slot: string, cost: number, contract: string) => void;
  onCancel: () => void;
}) {
  const [slot, setSlot] = useState(() => assignableSlots[0] ?? "");
  const [cost, setCost] = useState(() => defaultCost);
  const [contract, setContract] = useState("");

  useEffect(() => {
    setSlot(assignableSlots[0] ?? "");
    setCost(defaultCost);
    setContract("");
  }, [player.id, defaultCost, assignableSlots.join("|")]);

  const submit = () => {
    if (!slot || !assignableSlots.includes(slot)) return;
    const c = Math.max(1, Math.round(cost) || 1);
    onDraft(slot, c, contract.trim());
  };

  const disabledSubmit =
    !slot || assignableSlots.length === 0 || !assignableSlots.includes(slot);

  return (
    <div
      className="lc-keeper-draft-inline"
      role="region"
      aria-label={`Keeper options for ${player.name}`}
    >
      <div className="lc-keeper-draft-inline-fields">
        <KeeperSlotSelectWithOverride
          eligibleSlots={eligibleSlots}
          assignableSlots={assignableSlots}
          value={slot}
          onChange={setSlot}
          selectClassName="lc-keeper-inline-select"
          labelClassName="lc-keeper-inline-field"
        />
        <label className="lc-keeper-inline-field lc-keeper-inline-field--narrow">
          <span>Price ($)</span>
          <input
            type="number"
            min={1}
            value={Number.isFinite(cost) ? cost : ""}
            onChange={(e) => setCost(parseInt(e.target.value, 10) || 0)}
            className="lc-keeper-inline-input"
          />
        </label>
        <label className="lc-keeper-inline-field lc-keeper-inline-field--grow">
          <span>Contract</span>
          <input
            type="text"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="e.g. Arb, 3Y"
            className="lc-keeper-inline-input"
          />
        </label>
      </div>
      <div className="lc-keeper-draft-inline-actions">
        <button
          type="button"
          className="league-create-secondary lc-keeper-inline-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="league-create-primary lc-keeper-inline-draft"
          disabled={disabledSubmit}
          onClick={submit}
        >
          Draft
        </button>
      </div>
    </div>
  );
}
