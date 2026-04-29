/**
 * PositionTargets
 *
 * Renders the editable position allocation table and the AI Mock Draft button.
 * Receives positionTargets and handlers from MyDraft — no internal budget state.
 *
 * Design Pattern: Observer — reacts to positionTargets subject managed by MyDraft.
 * Design Principle: Single Responsibility — only manages the position target table UI.
 */

import PosBadge from "../PosBadge";
import { useNavigate, useParams } from "react-router";
import type { PositionPlanRow } from "../../constants/positionAllocationPlan";

export type { PositionPlanRow } from "../../constants/positionAllocationPlan";

interface PositionTargetsProps {
  positionPlan: PositionPlanRow[];
  positionTargets: Record<string, number>;
  targetRaw: Record<string, string>;
  positionBudgetTotal: number;
  positionBuffer: number;
  onTargetChange: (pos: string, raw: string, value: number | null) => void;
  onTargetBlur: (pos: string) => void;
  onReset: () => void;
}

export default function PositionTargets({
  positionPlan,
  positionTargets,
  targetRaw,
  positionBudgetTotal,
  positionBuffer,
  onTargetChange,
  onTargetBlur,
  onReset,
}: PositionTargetsProps) {
  const navigate = useNavigate();
  const { id: leagueId } = useParams();

  return (
    <div className="mydraft-left panel-card">
      <div className="table-head-row">
        <div className="card-label">Position Allocation</div>
        <button className="ghost-btn" type="button" onClick={onReset}>
          Reset Defaults
        </button>
      </div>

      <div className="alloc-table-scroll">
        <table className="alloc-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Slots</th>
              <th>Target $</th>
              <th>Per Slot</th>
            </tr>
          </thead>
          <tbody>
            {positionPlan.map((row) => {
              const target = positionTargets[row.pos] ?? row.target;
              const perSlot = target / row.slots;
              const displayVal =
                row.pos in targetRaw ? targetRaw[row.pos] : String(target);

              return (
                <tr key={row.pos}>
                  <td className="pos-cell">
                    <PosBadge pos={row.pos} />
                  </td>
                  <td>{row.slots}</td>
                  <td>
                    <span className="target-prefix">$</span>
                    <input
                      className="target-input"
                      type="text"
                      inputMode="numeric"
                      value={displayVal}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const v = parseInt(raw);
                        onTargetChange(row.pos, raw, isNaN(v) ? null : v);
                      }}
                      onBlur={() => onTargetBlur(row.pos)}
                    />
                  </td>
                  <td>${perSlot.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{positionPlan.reduce((sum, row) => sum + row.slots, 0)}</td>
              <td>${positionBudgetTotal}</td>
              <td className="budget-buffer">+{positionBuffer} buf</td>
            </tr>
          </tfoot>
        </table>
      </div>


      <button
        className="mock-btn"
        type="button"
        onClick={() => navigate(`/leagues/${leagueId}/mock-draft`)}
      >
        AI Mock Draft
      </button>
    </div>
  );
}