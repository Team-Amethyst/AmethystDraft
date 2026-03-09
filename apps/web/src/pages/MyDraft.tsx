import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Star, X } from "lucide-react";
import { usePageTitle } from "../hooks/usePageTitle";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { WatchlistPlayer } from "../api/watchlist";
import PosBadge from "../components/PosBadge";
import "./MyDraft.css";

// TODO(data): Replace with league-specific budget from backend once league settings are wired.
const TOTAL_BUDGET = 260;

// TODO(data): Replace with backend-provided roster template + budget targets per position.
const POSITION_PLAN: Array<{ pos: string; slots: number; target: number }> = [
  { pos: "C", slots: 1, target: 14 },
  { pos: "1B", slots: 1, target: 28 },
  { pos: "2B", slots: 1, target: 22 },
  { pos: "SS", slots: 1, target: 25 },
  { pos: "3B", slots: 1, target: 24 },
  { pos: "OF", slots: 3, target: 44 },
  { pos: "SP", slots: 2, target: 60 },
  { pos: "RP", slots: 2, target: 20 },
  { pos: "UTIL", slots: 1, target: 15 },
  { pos: "BN", slots: 4, target: 8 },
];

const PITCHER_POSITIONS = new Set(["SP", "RP"]);

type ViewFilter = "all" | "hitters" | "pitchers";

function normalizePosition(position: string): string {
  const first = position
    .toUpperCase()
    .replace(/\s+/g, "")
    .split(/[/,|-]/)[0];

  if (first === "DH") return "UTIL";
  return first || "UTIL";
}

function getPriority(player: WatchlistPlayer): "High" | "Medium" | "Low" {
  // TODO(logic): Replace this local heuristic with backend scoring/recommendation priority.
  if (player.value >= 45 || player.tier <= 2) return "High";
  if (player.value >= 28 || player.tier === 3) return "Medium";
  return "Low";
}

export default function MyDraft() {
  usePageTitle("My Draft");
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, "High" | "Medium" | "Low">
  >(() => {
    try {
      const saved = localStorage.getItem("amethyst-priority-overrides");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  function setPriority(playerId: string, value: "High" | "Medium" | "Low") {
    setPriorityOverrides((prev) => {
      const next = { ...prev, [playerId]: value };
      localStorage.setItem("amethyst-priority-overrides", JSON.stringify(next));
      return next;
    });
  }

  const [targetOverrides, setTargetOverrides] = useState<
    Record<string, number>
  >(() => {
    try {
      const saved = localStorage.getItem("amethyst-target-overrides");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Raw string state lets users clear the field and retype freely; committed on blur.
  const [targetRaw, setTargetRaw] = useState<Record<string, string>>({});

  function setTarget(playerId: string, value: number) {
    setTargetOverrides((prev) => {
      const next = { ...prev, [playerId]: value };
      localStorage.setItem("amethyst-target-overrides", JSON.stringify(next));
      return next;
    });
  }

  const defaultPositionTargets = Object.fromEntries(
    POSITION_PLAN.map((r) => [r.pos, r.target]),
  );

  const [positionTargets, setPositionTargets] = useState<
    Record<string, number>
  >(() => {
    try {
      const saved = localStorage.getItem("amethyst-position-targets");
      return saved
        ? { ...defaultPositionTargets, ...JSON.parse(saved) }
        : defaultPositionTargets;
    } catch {
      return defaultPositionTargets;
    }
  });

  function setPositionTarget(pos: string, value: number) {
    setPositionTargets((prev) => {
      const next = { ...prev, [pos]: value };
      localStorage.setItem("amethyst-position-targets", JSON.stringify(next));
      return next;
    });
  }

  function resetPositionTargets() {
    setPositionTargets(defaultPositionTargets);
    localStorage.removeItem("amethyst-position-targets");
  }

  const draftNotes = getNote("__draft__");
  const handleDraftNotesChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setNote("__draft__", e.target.value);
  };
  const [notesHeight, setNotesHeight] = useState(96);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(96);

  const { watchlistTargetTotal, filteredWatchlist } = useMemo(() => {
    let targetTotal = 0;

    for (const player of watchlist) {
      const t = targetOverrides[player.id] ?? Math.round(player.value ?? 0);
      targetTotal += t;
    }

    let filtered = [...watchlist];
    if (viewFilter === "hitters") {
      filtered = filtered.filter(
        (p) => !PITCHER_POSITIONS.has(normalizePosition(p.position || "UTIL")),
      );
    } else if (viewFilter === "pitchers") {
      filtered = filtered.filter((p) =>
        PITCHER_POSITIONS.has(normalizePosition(p.position || "UTIL")),
      );
    }
    filtered.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return {
      watchlistTargetTotal: targetTotal,
      filteredWatchlist: filtered,
    };
  }, [watchlist, viewFilter, targetOverrides]);

  const positionBudgetTotal = Object.values(positionTargets).reduce(
    (a, b) => a + b,
    0,
  );
  const positionBuffer = Math.max(0, TOTAL_BUDGET - positionBudgetTotal);

  // Per-position segment data for the allocation bar
  const POS_COLORS_MAP: Record<string, string> = {
    C: "#f87171",
    "1B": "#fbbf24",
    "2B": "#38bdf8",
    "3B": "#fb923c",
    SS: "#22d3ee",
    OF: "#4ade80",
    SP: "#818cf8",
    RP: "#f472b6",
    UTIL: "#94a3b8",
    BN: "#6b7280",
  };
  const allocBarSegments = POSITION_PLAN.map((row) => ({
    pos: row.pos,
    slots: row.slots,
    target: positionTargets[row.pos] ?? row.target,
    color: POS_COLORS_MAP[row.pos] ?? "#7f72a8",
    pct: ((positionTargets[row.pos] ?? row.target) / TOTAL_BUDGET) * 100,
  }));
  const bufferPct = (positionBuffer / TOTAL_BUDGET) * 100;

  const handleNotesResizeStart = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    dragStartYRef.current = event.clientY;
    dragStartHeightRef.current = notesHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - dragStartYRef.current;
      // Drag up (negative delta) grows the box, drag down shrinks it.
      const nextHeight = Math.max(58, dragStartHeightRef.current - deltaY);
      setNotesHeight(nextHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="mydraft-page">
      <main className="mydraft-shell">
        <section className="mydraft-top panel-card">
          <div className="top-budget">
            <div className="card-label">Total Budget</div>
            <div className="budget-value">${TOTAL_BUDGET}</div>
          </div>

          <div className="top-split">
            <div className="split-label">Position Allocation</div>
            <div className="alloc-bar">
              {allocBarSegments.map((seg) => (
                <div
                  key={seg.pos}
                  className="alloc-bar-seg"
                  style={{ width: `${seg.pct}%`, background: seg.color }}
                  title={`${seg.pos}  $${seg.target}`}
                >
                  {seg.slots > 1 &&
                    Array.from({ length: seg.slots - 1 }).map((_, i) => (
                      <span
                        key={i}
                        className="alloc-bar-tick"
                        style={{ left: `${((i + 1) / seg.slots) * 100}%` }}
                      />
                    ))}
                  <span className="alloc-bar-label">{seg.pos}</span>
                </div>
              ))}
              {bufferPct > 0 && (
                <div
                  className="alloc-bar-seg alloc-bar-buffer"
                  style={{ width: `${bufferPct}%` }}
                  title={`Buffer  $${positionBuffer}`}
                />
              )}
            </div>
            <div className="alloc-bar-legend">
              {allocBarSegments.map((seg) => (
                <span key={seg.pos} className="abl-item">
                  <span className="abl-dot" style={{ background: seg.color }} />
                  <span className="abl-pos">{seg.pos}</span>
                  <span className="abl-val">${seg.target}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="top-summary">
            <div className="card-label">Planning Summary</div>
            <div className="summary-row">
              <span>Position plan</span>
              <strong>${positionBudgetTotal}</strong>
            </div>
            <div className="summary-row">
              <span>Plan buffer</span>
              <strong className={positionBuffer < 1 ? "summary-warn" : ""}>
                ${positionBuffer}
              </strong>
            </div>
            <div className="summary-row">
              <span>Watchlist targets</span>
              <strong>${watchlistTargetTotal}</strong>
            </div>
          </div>
        </section>

        <section className="mydraft-main-grid">
          <div className="mydraft-left panel-card">
            <div className="table-head-row">
              <div className="card-label">Position Allocation</div>
              <button
                className="ghost-btn"
                type="button"
                onClick={resetPositionTargets}
              >
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
                  {POSITION_PLAN.map((row) => {
                    const target = positionTargets[row.pos] ?? row.target;
                    const perSlot = target / row.slots;
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
                            value={
                              row.pos in targetRaw
                                ? targetRaw[row.pos]
                                : String(target)
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setTargetRaw((r) => ({ ...r, [row.pos]: raw }));
                              const v = parseInt(raw);
                              if (!isNaN(v)) setPositionTarget(row.pos, v);
                            }}
                            onBlur={() => {
                              const raw = targetRaw[row.pos];
                              const v = parseInt(raw ?? "");
                              if (isNaN(v) || v < 0)
                                setPositionTarget(row.pos, 0);
                              setTargetRaw((r) =>
                                Object.fromEntries(
                                  Object.entries(r).filter(
                                    ([k]) => k !== row.pos,
                                  ),
                                ),
                              );
                            }}
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
                    <td>
                      {POSITION_PLAN.reduce((sum, row) => sum + row.slots, 0)}
                    </td>
                    <td>
                      $
                      {Object.values(positionTargets).reduce(
                        (a, b) => a + b,
                        0,
                      )}
                    </td>
                    <td className="budget-buffer">+{positionBuffer} buf</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <button className="mock-btn" type="button" disabled>
              AI Mock Draft — Coming Soon
            </button>
          </div>

          <section className="mydraft-right panel-card">
            <div className="watchlist-head">
              <div>
                <div className="card-label">Strategic Watchlist</div>
                <div className="watchlist-sub">
                  {watchlist.length} player{watchlist.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="watchlist-controls">
                <span>View</span>
                <select
                  value={viewFilter}
                  onChange={(e) => setViewFilter(e.target.value as ViewFilter)}
                >
                  <option value="all">All</option>
                  <option value="hitters">Hitters</option>
                  <option value="pitchers">Pitchers</option>
                </select>
              </div>
            </div>

            <div className="watchlist-scroll">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Proj</th>
                    <th>Target $</th>
                    <th>Priority</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchlist.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="watchlist-empty">
                        Star players in Research to populate this watchlist.
                      </td>
                    </tr>
                  ) : (
                    filteredWatchlist.map((player) => {
                      const pos = normalizePosition(player.position || "UTIL");
                      const defaultTarget = Math.round(player.value ?? 0);
                      const targetVal =
                        targetOverrides[player.id] ?? defaultTarget;
                      const priority =
                        priorityOverrides[player.id] ?? getPriority(player);
                      const rawKey = player.id;
                      const displayVal =
                        rawKey in targetRaw
                          ? targetRaw[rawKey]
                          : String(targetVal);

                      return (
                        <tr key={player.id}>
                          <td>
                            <div className="player-main">
                              <Star
                                size={12}
                                className="row-star"
                                fill="#facc15"
                              />
                              <div className="player-name-row">
                                <span className="player-name">
                                  {player.name}
                                </span>
                                <span className="player-team">
                                  {player.team || "--"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            {player.positions && player.positions.length > 1 ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "2px",
                                  flexWrap: "wrap",
                                }}
                              >
                                {player.positions.map((p) => (
                                  <PosBadge key={p} pos={p} />
                                ))}
                              </div>
                            ) : (
                              <PosBadge pos={pos} />
                            )}
                          </td>
                          <td className="money">
                            ${Math.round(player.value ?? 0)}
                          </td>
                          <td>
                            <div className="target-input-group">
                              <button
                                className="target-stepper"
                                type="button"
                                onClick={() => {
                                  const next = Math.max(1, targetVal - 1);
                                  setTarget(player.id, next);
                                  setTargetRaw((r) =>
                                    Object.fromEntries(
                                      Object.entries(r).filter(
                                        ([k]) => k !== player.id,
                                      ),
                                    ),
                                  );
                                }}
                              >
                                <Minus size={9} />
                              </button>
                              <span className="target-prefix">$</span>
                              <input
                                className="target-input"
                                type="text"
                                inputMode="numeric"
                                value={displayVal}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(
                                    /[^0-9]/g,
                                    "",
                                  );
                                  setTargetRaw((r) => ({
                                    ...r,
                                    [player.id]: raw,
                                  }));
                                  const v = parseInt(raw);
                                  if (!isNaN(v)) setTarget(player.id, v);
                                }}
                                onBlur={() => {
                                  const v = parseInt(displayVal);
                                  const committed =
                                    isNaN(v) || v <= 0 ? defaultTarget : v;
                                  setTarget(player.id, committed);
                                  setTargetRaw((r) =>
                                    Object.fromEntries(
                                      Object.entries(r).filter(
                                        ([k]) => k !== player.id,
                                      ),
                                    ),
                                  );
                                }}
                              />
                              <button
                                className="target-stepper"
                                type="button"
                                onClick={() => {
                                  const next = targetVal + 1;
                                  setTarget(player.id, next);
                                  setTargetRaw((r) =>
                                    Object.fromEntries(
                                      Object.entries(r).filter(
                                        ([k]) => k !== player.id,
                                      ),
                                    ),
                                  );
                                }}
                              >
                                <Plus size={9} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <select
                              className={`priority-select ${priority.toLowerCase()}`}
                              value={priority}
                              onChange={(e) =>
                                setPriority(
                                  player.id,
                                  e.target.value as "High" | "Medium" | "Low",
                                )
                              }
                            >
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                          </td>
                          <td className="td-note">
                            <input
                              className="watchlist-note-input"
                              value={getNote(player.id)}
                              onChange={(e) =>
                                setNote(player.id, e.target.value)
                              }
                              placeholder="Note..."
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </td>
                          <td>
                            <button
                              className="unstar-btn"
                              type="button"
                              onClick={() => removeFromWatchlist(player.id)}
                              title="Remove from watchlist"
                            >
                              <X size={13} strokeWidth={2.4} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="notes-strip panel-card">
          <div className="card-label">Draft Notes</div>
          <button
            type="button"
            className="notes-resize-handle"
            onMouseDown={handleNotesResizeStart}
            aria-label="Resize draft notes box"
            title="Drag to resize"
          />
          <textarea
            value={draftNotes}
            onChange={handleDraftNotesChange}
            placeholder="Add your draft notes here..."
            style={{ height: `${notesHeight}px` }}
          />
        </section>
      </main>
    </div>
  );
}
