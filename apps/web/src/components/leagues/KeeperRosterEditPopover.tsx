import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { KeeperSlotSelectWithOverride } from "./KeeperSlotSelectWithOverride";
import "./KeeperRosterEditPopover.css";

export function KeeperRosterEditPopover({
  onClose,
  anchorRef,
  playerName,
  teamLabel,
  initialSlot,
  slotOptions,
  assignableSlots,
  initialCost,
  initialContract,
  onSave,
  onRemove,
}: {
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  playerName: string;
  teamLabel: string;
  initialSlot: string;
  slotOptions: string[];
  /** Positions with roster capacity (includes non–position-eligible overrides). */
  assignableSlots: string[];
  initialCost: number;
  initialContract: string;
  onSave: (slot: string, cost: number, contract: string) => void;
  onRemove: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  const [slot, setSlot] = useState(initialSlot);
  const [cost, setCost] = useState(initialCost);
  const [contract, setContract] = useState(initialContract);

  const reposition = () => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const ar = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const pad = 10;
    let top = ar.bottom + 8;
    let left = ar.right - pw;
    if (left < pad) left = pad;
    if (left + pw > window.innerWidth - pad)
      left = window.innerWidth - pad - pw;
    if (top + ph > window.innerHeight - pad) {
      top = ar.top - ph - 8;
    }
    if (top < pad) top = pad;
    panel.style.position = "fixed";
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.zIndex = "4000";
  };

  useLayoutEffect(() => {
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [anchorRef]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = panelRef.current;
      const anchor = anchorRef.current;
      const t = e.target as Node;
      if (!el) return;
      if (el.contains(t)) return;
      if (anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [anchorRef, onClose]);

  const submit = () => {
    const c = Math.max(1, Math.round(cost) || 1);
    onSave(slot, c, contract.trim());
    onClose();
  };

  const disabledSubmit =
    !slot ||
    assignableSlots.length === 0 ||
    !assignableSlots.includes(slot);

  return createPortal(
    <div
      ref={panelRef}
      className="keeper-roster-edit-popover"
      role="dialog"
      aria-labelledby={`${formId}-title`}
    >
      <div className="keeper-roster-edit-popover-header">
        <div id={`${formId}-title`} className="keeper-roster-edit-popover-title">
          Edit keeper
        </div>
        <div className="keeper-roster-edit-popover-player">
          <span className="keeper-roster-edit-popover-name">{playerName}</span>
          {teamLabel ? (
            <span className="keeper-roster-edit-popover-team">{teamLabel}</span>
          ) : null}
        </div>
      </div>

      <div className="keeper-roster-edit-popover-fields">
        <KeeperSlotSelectWithOverride
          eligibleSlots={slotOptions}
          assignableSlots={assignableSlots}
          value={slot}
          onChange={setSlot}
          selectClassName="keeper-roster-edit-select"
          labelClassName="keeper-roster-edit-field"
        />

        <label className="keeper-roster-edit-field keeper-roster-edit-field--inline">
          <span>Paid ($)</span>
          <input
            type="number"
            min={1}
            value={Number.isFinite(cost) ? cost : ""}
            onChange={(e) => setCost(parseInt(e.target.value, 10) || 0)}
            className="keeper-roster-edit-input"
          />
        </label>

        <label className="keeper-roster-edit-field">
          <span>Contract</span>
          <input
            type="text"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="e.g. Arb, 3Y"
            className="keeper-roster-edit-input"
          />
        </label>
      </div>

      <div className="keeper-roster-edit-popover-actions">
        <button
          type="button"
          className="keeper-roster-edit-remove"
          onClick={() => {
            onRemove();
            onClose();
          }}
        >
          Remove keeper
        </button>
        <div className="keeper-roster-edit-actions-right">
          <button
            type="button"
            className="keeper-roster-edit-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="keeper-roster-edit-save"
            disabled={disabledSubmit}
            onClick={submit}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
