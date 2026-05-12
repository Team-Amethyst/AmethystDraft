import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Player } from "../../types/league";
import { KeeperSlotSelectWithOverride } from "./KeeperSlotSelectWithOverride";
import "./KeeperDraftFormPopover.css";

export function KeeperDraftFormPopover({
  onClose,
  anchorRef,
  player,
  eligibleSlots,
  assignableSlots,
  defaultCost,
  onDraft,
}: {
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  player: Player;
  eligibleSlots: string[];
  assignableSlots: string[];
  defaultCost: number;
  onDraft: (slot: string, cost: number, contract: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  const [slot, setSlot] = useState(() => assignableSlots[0] ?? "");
  const [cost, setCost] = useState(() => defaultCost);
  const [contract, setContract] = useState("");

  useEffect(() => {
    setSlot(assignableSlots[0] ?? "");
    setCost(defaultCost);
    setContract("");
  }, [player.id, defaultCost, assignableSlots.join("|")]);

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
    if (!slot || !assignableSlots.includes(slot)) return;
    const c = Math.max(1, Math.round(cost) || 1);
    onDraft(slot, c, contract.trim());
    onClose();
  };

  const disabledSubmit =
    !slot ||
    assignableSlots.length === 0 ||
    !assignableSlots.includes(slot);

  return createPortal(
    <div
      ref={panelRef}
      className="keeper-draft-popover"
      role="dialog"
      aria-labelledby={`${formId}-title`}
    >
      <header className="keeper-draft-popover-header">
        <div id={`${formId}-title`} className="keeper-draft-popover-title">
          Add keeper
        </div>
        <div className="keeper-draft-popover-player">
          <span className="keeper-draft-popover-name">{player.name}</span>
          {player.team ? (
            <span className="keeper-draft-popover-team">{player.team}</span>
          ) : null}
        </div>
      </header>

      <div className="keeper-draft-popover-fields">
        <KeeperSlotSelectWithOverride
          eligibleSlots={eligibleSlots}
          assignableSlots={assignableSlots}
          value={slot}
          onChange={setSlot}
          selectClassName="keeper-draft-popover-select"
          labelClassName="keeper-draft-popover-field"
        />

        <label className="keeper-draft-popover-field keeper-draft-popover-field--inline">
          <span>Price ($)</span>
          <input
            type="number"
            min={1}
            value={Number.isFinite(cost) ? cost : ""}
            onChange={(e) => setCost(parseInt(e.target.value, 10) || 0)}
            className="keeper-draft-popover-input"
          />
        </label>

        <label className="keeper-draft-popover-field">
          <span>Contract</span>
          <input
            type="text"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="e.g. Arb, 3Y"
            className="keeper-draft-popover-input"
          />
        </label>
      </div>

      <div className="keeper-draft-popover-actions">
        <button
          type="button"
          className="keeper-draft-popover-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="keeper-draft-popover-submit"
          disabled={disabledSubmit}
          onClick={submit}
        >
          Draft
        </button>
      </div>
    </div>,
    document.body,
  );
}
