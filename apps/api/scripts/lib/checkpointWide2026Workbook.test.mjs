import { describe, it, expect, beforeEach } from "vitest";
import XLSX from "xlsx";
import {
  discoverPreDraftBlocks,
  deriveFantasyLeagueTeams,
  derivePreDraftRemainingBudgets,
  parseWidePreDraftRoster,
  materializeWideKeepers,
  parseDraftRowObject,
} from "./checkpointWide2026Draft.mjs";
import {
  parseWideReserveSheet,
  materializeWideReservePlayers,
} from "./checkpointReserveSheets.mjs";
import { resetSyntheticUnresolvedSeq } from "./checkpointFixtureResolve.mjs";
import {
  GOLDEN_KEEPER_COUNTS,
  GOLDEN_REMAINING_BUDGETS,
  GOLDEN_DRAFT_PICK_COUNT,
  GOLDEN_TEAM_COUNT,
  GOLDEN_TAXI_PER_TEAM,
} from "./fixtureWorkbookGolden.mjs";

const FORTY_MAN = [
  {
    player_id: "100001",
    name: "Player One",
    abbr: "NYY",
    raw_position: "1B",
    fantasy_pitch: null,
  },
  {
    player_id: "100002",
    name: "Player Two",
    abbr: "LAD",
    raw_position: "OF",
    fantasy_pitch: null,
  },
];

function teamHeaders(blockTeams) {
  const row = [];
  let c = 0;
  for (const t of blockTeams) {
    row[c] = `Team ${t} $${GOLDEN_REMAINING_BUDGETS[`Team ${t}`]}`;
    c += 4;
  }
  return row;
}

function fillKeeperRows(blockTeams, counts) {
  const maxRows = Math.max(...blockTeams.map((t) => counts[`Team ${t}`]));
  /** @type {unknown[][]} */
  const rows = [];
  for (let i = 0; i < maxRows; i++) {
    const row = [];
    blockTeams.forEach((letter, ti) => {
      const fantasy = `Team ${letter}`;
      const base = ti * 4;
      if (i < counts[fantasy]) {
        row[base] = "1B";
        row[base + 1] = `K ${fantasy} ${i + 1}`;
        row[base + 2] = "K";
        row[base + 3] = 5;
      }
    });
    rows.push(row);
  }
  return rows;
}

function buildGoldenPreDraftMatrix() {
  const block1 = ["A", "B", "C", "D", "E"];
  const block2 = ["F", "G", "H", "I"];
  return [
    teamHeaders(block1),
    ...fillKeeperRows(block1, GOLDEN_KEEPER_COUNTS),
    [],
    teamHeaders(block2),
    ...fillKeeperRows(block2, GOLDEN_KEEPER_COUNTS),
  ];
}

function buildReserveMatrix(perTeam, playersPerTeam) {
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const header = [];
  letters.forEach((t, ti) => {
    header[ti * 2 + 1] = `Team ${t}`;
  });
  const max = playersPerTeam;
  /** @type {unknown[][]} */
  const rows = [header];
  for (let i = 0; i < max; i++) {
    const row = [];
    letters.forEach((t, ti) => {
      const nameCol = ti * 2 + 1;
      row[nameCol - 1] = String(i + 1);
      row[nameCol] = `${perTeam} ${t} ${i + 1}`;
    });
    rows.push(row);
  }
  return rows;
}

function buildDraftRows(pickCount) {
  const rows = [
    ["Pick #", "Brought Up", "Player", "POS", "MLB", "Won", "Salary"],
  ];
  for (let i = 1; i <= pickCount; i++) {
    const team = String.fromCharCode(65 + ((i - 1) % 9));
    rows.push([
      i,
      `Team ${team}`,
      `Draft Pick ${i}`,
      "OF",
      "NYY",
      `Team ${team}`,
      10 + (i % 5),
    ]);
  }
  return rows;
}

function fantasyMapFromTeams(teamsOrdered) {
  const m = new Map();
  teamsOrdered.forEach((nm, idx) => m.set(nm, `team_${idx + 1}`));
  return m;
}

describe("2026 wide workbook golden shape", () => {
  beforeEach(() => resetSyntheticUnresolvedSeq());

  it("discovers both pre-draft header blocks (A–E and F–I)", () => {
    const blocks = discoverPreDraftBlocks(buildGoldenPreDraftMatrix());
    expect(blocks).toHaveLength(2);
    expect(blocks[0].groups.map((g) => g.fantasyName)).toEqual([
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
    ]);
    expect(blocks[1].groups.map((g) => g.fantasyName)).toEqual([
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ]);
  });

  it("parseWidePreDraftRoster returns all 9 teams with golden keeper counts", () => {
    const preMatrix = buildGoldenPreDraftMatrix();
    const draftFiltered = buildDraftRows(1).slice(1).map((row) => ({
      "Pick #": row[0],
      "Brought Up": row[1],
      Player: row[2],
      POS: row[3],
      MLB: row[4],
      Won: row[5],
      Salary: row[6],
    }));
    const { fantasyTeamToId, teamsOrdered } = deriveFantasyLeagueTeams(
      preMatrix,
      draftFiltered,
    );
    expect(teamsOrdered).toHaveLength(GOLDEN_TEAM_COUNT);

    const parsed = parseWidePreDraftRoster(preMatrix, fantasyTeamToId);
    const counts = {};
    for (const k of parsed) {
      counts[k.fantasyName] = (counts[k.fantasyName] ?? 0) + 1;
    }
    expect(counts).toEqual(GOLDEN_KEEPER_COUNTS);

    const teamIds = new Set(parsed.map((k) => k.team_id));
    expect(teamIds.size).toBe(9);
    expect(parsed.filter((k) => k.team_id === "team_9").length).toBe(10);
    expect(parsed.filter((k) => k.team_id === "team_6").length).toBe(9);
  });

  it("derivePreDraftRemainingBudgets matches golden header remaining $", () => {
    const preMatrix = buildGoldenPreDraftMatrix();
    const { fantasyTeamToId } = deriveFantasyLeagueTeams(preMatrix, []);
    const budgets = derivePreDraftRemainingBudgets(preMatrix, fantasyTeamToId);
    for (const [fantasy, remaining] of Object.entries(GOLDEN_REMAINING_BUDGETS)) {
      const tid = fantasyTeamToId.get(fantasy);
      expect(budgets.get(tid)).toBe(remaining);
    }
  });

  it("draft parser yields 133 picks with consistent team ids", () => {
    const draftFiltered = buildDraftRows(GOLDEN_DRAFT_PICK_COUNT).slice(1).map(
      (row) => ({
        "Pick #": row[0],
        "Brought Up": row[1],
        Player: row[2],
        POS: row[3],
        MLB: row[4],
        Won: row[5],
        Salary: row[6],
      }),
    );
    expect(draftFiltered).toHaveLength(GOLDEN_DRAFT_PICK_COUNT);

    const { fantasyTeamToId } = deriveFantasyLeagueTeams(
      buildGoldenPreDraftMatrix(),
      draftFiltered,
    );

    const picks = [];
    for (const raw of draftFiltered) {
      const p = parseDraftRowObject(raw);
      if (!p.player) continue;
      const tid = fantasyTeamToId.get(p.fantasyWinner);
      expect(tid).toBeTruthy();
      picks.push({ ...p, team_id: tid });
    }
    expect(picks).toHaveLength(GOLDEN_DRAFT_PICK_COUNT);
  });

  it("minors and taxi populate all 9 teams without active auction slots", () => {
    const preMatrix = buildGoldenPreDraftMatrix();
    const { fantasyTeamToId, teamsOrdered } = deriveFantasyLeagueTeams(
      preMatrix,
      [],
    );
    const warnings = [];

    const minorsParsed = parseWideReserveSheet(
      buildReserveMatrix("Minor", 3),
      fantasyTeamToId,
    );
    const minors = materializeWideReservePlayers(
      minorsParsed,
      FORTY_MAN,
      {},
      "minors",
      warnings,
      { defaultRosterSlot: "MIN" },
    );
    expect(minors).toHaveLength(9);
    for (const sec of minors) {
      expect(sec.players.length).toBeGreaterThan(0);
      expect(sec.players.every((p) => !p.is_keeper)).toBe(true);
      expect(sec.players.every((p) => String(p.roster_slot).includes("MIN"))).toBe(
        true,
      );
    }

    const taxiParsed = parseWideReserveSheet(
      buildReserveMatrix("Taxi", GOLDEN_TAXI_PER_TEAM),
      fantasyTeamToId,
    );
    const taxi = materializeWideReservePlayers(
      taxiParsed,
      FORTY_MAN,
      {},
      "taxi",
      warnings,
      { defaultRosterSlot: "TAXI" },
    );
    expect(taxi).toHaveLength(9);
    for (const sec of taxi) {
      expect(sec.players).toHaveLength(GOLDEN_TAXI_PER_TEAM);
      expect(sec.players.every((p) => p.roster_slot === "TAXI")).toBe(true);
    }

    expect(teamsOrdered).toHaveLength(9);
  });
});

describe("regression: teams 6–9 must not be keeper-empty when lower block present", () => {
  it("assigns lower-block keepers to team_6+ not team_1", () => {
    const matrix = [
      ["Team A $182", "", "", "", "Team B $149", "", "", ""],
      ["1B", "Top A", "K", 5, "1B", "Top B", "K", 8],
      [],
      ["Team F $194", "", "", "", "Team G $198", "", "", ""],
      ["1B", "Low F", "K", 4, "1B", "Low G", "K", 6],
    ];
    const fantasyTeamToId = new Map([
      ["Team A", "team_1"],
      ["Team B", "team_2"],
      ["Team F", "team_6"],
      ["Team G", "team_7"],
    ]);
    const parsed = parseWidePreDraftRoster(matrix, fantasyTeamToId);
    expect(parsed.some((k) => k.team_id === "team_6" && k.displayName === "Low F")).toBe(
      true,
    );
    expect(parsed.some((k) => k.team_id === "team_1" && k.displayName === "Low F")).toBe(
      false,
    );
  });
});
