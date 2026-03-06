import { useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import AuthNavbar from "../components/AuthNavbar";
import { useWatchlist } from "../contexts/WatchlistContext";
import type { Player } from "../types/player";
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
	{ pos: "BENCH", slots: 4, target: 8 },
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

function getPriority(player: Player): "High" | "Medium" | "Low" {
	// TODO(logic): Replace this local heuristic with backend scoring/recommendation priority.
	if (player.value >= 45 || player.tier <= 2) return "High";
	if (player.value >= 28 || player.tier === 3) return "Medium";
	return "Low";
}

export default function MyDraft() {
	const { watchlist, removeFromWatchlist } = useWatchlist();
	const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
	// TODO(storage): Persist notes per league/user in backend; this is local-only state.
	const [draftNotes, setDraftNotes] = useState("");
	const [notesHeight, setNotesHeight] = useState(96);
	const dragStartYRef = useRef(0);
	const dragStartHeightRef = useRef(96);

	const { hittersSpent, pitchersSpent, hittersCount, pitchersCount, spentByPosition, filteredWatchlist, totalSpent } = useMemo(() => {
		const spentMap: Record<string, number> = {};
		let hitters = 0;
		let pitchers = 0;
		let hittersN = 0;
		let pitchersN = 0;

		for (const player of watchlist) {
			const pos = normalizePosition(player.position || "UTIL");
			spentMap[pos] = (spentMap[pos] ?? 0) + (player.value ?? 0);

			if (PITCHER_POSITIONS.has(pos)) {
				pitchers += player.value ?? 0;
				pitchersN += 1;
			} else {
				hitters += player.value ?? 0;
				hittersN += 1;
			}
		}

		let filtered = watchlist;
		if (viewFilter === "hitters") {
			filtered = watchlist.filter((player) => !PITCHER_POSITIONS.has(normalizePosition(player.position || "UTIL")));
		}
		if (viewFilter === "pitchers") {
			filtered = watchlist.filter((player) => PITCHER_POSITIONS.has(normalizePosition(player.position || "UTIL")));
		}

		filtered = [...filtered].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		return {
			hittersSpent: hitters,
			pitchersSpent: pitchers,
			hittersCount: hittersN,
			pitchersCount: pitchersN,
			spentByPosition: spentMap,
			filteredWatchlist: filtered,
			totalSpent: hitters + pitchers,
		};
	}, [watchlist, viewFilter]);

	const remainingBudget = Math.max(0, TOTAL_BUDGET - totalSpent);
	const budgetUsedPct = Math.min(100, Math.round((totalSpent / TOTAL_BUDGET) * 100));
	// TODO(data): Allocation summary is currently inferred from watchlist value totals.
	const allocationRows = [
		{ label: "Allocated via Table", value: `$${totalSpent}` },
		{ label: "Remaining Buffer", value: `$${remainingBudget}` },
		{ label: "% Budget Allocated", value: `${budgetUsedPct}%` },
	];

	const hittersWidth = Math.min(100, Math.round((hittersSpent / TOTAL_BUDGET) * 100));
	const pitchersWidth = Math.min(100, Math.round((pitchersSpent / TOTAL_BUDGET) * 100));

	const handleNotesResizeStart = (event: React.MouseEvent<HTMLButtonElement>) => {
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
			<AuthNavbar />

			<main className="mydraft-shell">
				<section className="mydraft-top panel-card">
					<div className="top-budget">
						<div className="card-label">Total Budget</div>
						<div className="budget-value">${TOTAL_BUDGET}</div>
					</div>

					<div className="top-split">
						<div className="split-label">Hitter / Pitcher Split</div>
						<div className="split-values">
							<span>H ${hittersSpent}</span>
							<span>P ${pitchersSpent}</span>
						</div>
						<div className="split-bar">
							<div className="split-fill hitters" style={{ width: `${hittersWidth}%` }} />
							<div className="split-fill pitchers" style={{ width: `${pitchersWidth}%` }} />
						</div>
						<div className="split-counts">
							<span>{hittersCount} hitters</span>
							<span>{pitchersCount} pitchers</span>
						</div>
					</div>

					<div className="top-summary">
						<div className="card-label">Allocation Summary</div>
						{allocationRows.map((row) => (
							<div className="summary-row" key={row.label}>
								<span>{row.label}</span>
								<strong>{row.value}</strong>
							</div>
						))}
					</div>
				</section>

				<section className="mydraft-main-grid">
					<div className="mydraft-left panel-card">
						<div className="table-head-row">
							<div className="card-label">Position Allocation</div>
							<button className="ghost-btn" type="button">Reset Defaults</button>
						</div>

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
									const spent = spentByPosition[row.pos] ?? 0;
									const perSlot = row.target / row.slots;
									return (
										<tr key={row.pos}>
											<td className="pos-cell">{row.pos}</td>
											<td>{row.slots}</td>
											<td>
												${row.target}
												{spent > 0 ? <span className="spent-inline"> (${spent} used)</span> : null}
											</td>
											<td>${perSlot.toFixed(1)}</td>
										</tr>
									);
								})}
							</tbody>
							<tfoot>
								<tr>
									<td>Total</td>
									<td>{POSITION_PLAN.reduce((sum, row) => sum + row.slots, 0)}</td>
									<td>${TOTAL_BUDGET}</td>
									<td className="budget-buffer">+{remainingBudget} buf</td>
								</tr>
							</tfoot>
						</table>

						<button className="mock-btn" type="button">Launch AI Mock Draft</button>
					</div>

					<section className="mydraft-right panel-card">
					<div className="watchlist-head">
						<div>
							<div className="card-label">Strategic Watchlist</div>
							<div className="watchlist-sub">{watchlist.length} players</div>
						</div>

						<div className="watchlist-controls">
							<span>View</span>
							<select value={viewFilter} onChange={(e) => setViewFilter(e.target.value as ViewFilter)}>
								<option value="all">All</option>
								<option value="hitters">Hitters</option>
								<option value="pitchers">Pitchers</option>
							</select>
						</div>
					</div>

					<table className="watchlist-table">
						<thead>
							<tr>
								<th>Player</th>
								<th>Pos</th>
								<th>Proj</th>
								<th>Target</th>
								<th>A Priority</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{filteredWatchlist.length === 0 ? (
								<tr>
									<td colSpan={6} className="watchlist-empty">
										Star players in Research to populate this watchlist.
									</td>
								</tr>
							) : (
								filteredWatchlist.map((player) => {
									const pos = normalizePosition(player.position || "UTIL");
									// TODO(data): Replace with backend target-by-player (or target-by-tier) instead of value proxy.
									const targetAtPos = Math.round(player.value ?? 0);
									const priority = getPriority(player);

									return (
										<tr key={player.id}>
											<td>
												<div className="player-main">
													<Star size={12} className="row-star" fill="#facc15" />
													<div>
														<div className="player-name">{player.name}</div>
														<div className="player-team">{player.team || "--"}</div>
													</div>
												</div>
											</td>
											<td><span className="pos-chip">{pos}</span></td>
											<td className="money">${Math.round(player.value ?? 0)}</td>
											<td>{targetAtPos > 0 ? `$${targetAtPos}` : "--"}</td>
											<td>
												<span className={`priority ${priority.toLowerCase()}`}>{priority}</span>
											</td>
											<td>
												<button
													className="unstar-btn"
													type="button"
													onClick={() => removeFromWatchlist(player.id)}
													title="Remove from watchlist"
												>
													-
												</button>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
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
						onChange={(e) => setDraftNotes(e.target.value)}
						placeholder="Add your draft notes here..."
						style={{ height: `${notesHeight}px` }}
					/>
				</section>
			</main>
		</div>
	);
}
