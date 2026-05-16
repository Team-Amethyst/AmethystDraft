/**
 * Resolve MLB player_id values for checkpoint fixtures using StatsAPI 40-man rosters.
 * Committed index file keeps CI offline; regenerate with --fetch-rosters.
 */

import fs from "fs";

/** Copied from src/lib/mlbTeams.ts (id → canonical abbrev) */
const MLB_TEAM_ABBREV_BY_ID = {
  108: "LAA",
  109: "ARI",
  110: "BAL",
  111: "BOS",
  112: "CHC",
  113: "CIN",
  114: "CLE",
  115: "COL",
  116: "DET",
  117: "HOU",
  118: "KC",
  119: "LAD",
  120: "WSH",
  121: "NYM",
  133: "OAK",
  134: "PIT",
  135: "SD",
  136: "SEA",
  137: "SF",
  138: "STL",
  139: "TB",
  140: "TEX",
  141: "TOR",
  142: "MIN",
  143: "PHI",
  144: "ATL",
  145: "CWS",
  146: "MIA",
  147: "NYY",
  158: "MIL",
};

const MLB_TEAM_IDS = Object.keys(MLB_TEAM_ABBREV_BY_ID).map((n) => Number.parseInt(n, 10));

/** Fantasy sheet quirks → MLB abbrev used on 40-man. */
export function canonicalMlbAbbrevFromSheet(cell) {
  const raw = String(cell ?? "").trim();
  let s = raw.replace(/\./g, "").toUpperCase();
  if (!s) return "";
  if (s === "ARZ" || s === "AZ") return "ARI";
  if (s === "WAS") return "WSH";
  if (s === "CHW") return "CWS";
  if (s === "ATH") return "OAK";
  return s === "STL" ? "STL" : s;
}

/** @returns {{ name: string, budget?: number}|null } */
export function parsePreDraftTeamBudgetHeader(cell) {
  const t = String(cell ?? "").trim();
  const m = /^Team\s+(\S+)\s*\$\s*(\d+)\s*$/i.exec(t.replace(/\s+/g, " "));
  if (!m) return null;
  return {
    name: `Team ${m[1]}`,
    budget: Number(m[2]),
  };
}

export function stripDiacritics(s) {
  return String(s)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

/** Strip trailing generational roman numerals from compact strings (“scottii”→“scott”). */
export function compactStripRomanGenerational(compact) {
  const c = String(compact).toLowerCase();
  const romans = ["viii", "vii", "vi", "iv", "iii", "ii"];
  for (const rm of romans) {
    if (c.endsWith(rm)) return c.slice(0, -rm.length);
  }
  return c;
}

/**
 * Fuzzy draft pick matching: punctuation-insensitive (“J.T.”→“JT”), jr/sr dropped.
 */
export function personNameDraftKey(name) {
  let s = stripDiacritics(name).replace(/\./g, " ").replace(/[^a-z0-9\s]/gi, " ");
  const parts = s.split(/\s+/).filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^(jr|sr|ii|iii|iv)$/i.test(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join("");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/** “F. Alvarez” / full “Francisco Alvarez” */
export function matchesDisplayNameVariants(displayName, fullNameFromApi) {
  const d = String(displayName).trim();
  const f = fullNameFromApi.trim();
  if (!d || !f) return false;

  const di = /^([a-z])[.\s]+\s*(.+)$/i.exec(d);
  if (!di) return stripDiacritics(d) === stripDiacritics(f);

  const suffix = stripDiacritics(di[2]).replace(/\./g, "").replace(/[^a-z0-9-]/gi, "");
  const fi = di[1].toLowerCase();
  const fparts = stripDiacritics(f)
    .replace(/[^a-z0-9\s-]/gi, "")
    .split(/\s+/)
    .filter(Boolean);

  while (fparts.length > 1) {
    const t = fparts[fparts.length - 1].replace(/\./g, "").toLowerCase();
    if (t === "jr" || t === "sr" || t === "ii" || t === "iii" || t === "iv") {
      fparts.pop();
      continue;
    }
    break;
  }

  /* Join all surname tokens (“De La Cruz”) so we compare “delacruz”, not “cruz”. */
  const restCompact =
    fparts.slice(1).join("").replace(/[^a-z0-9]/gi, "").toLowerCase();

  /*
   * Abbrev tokens hyphen-preserving (“crow-armstrong”); MLB API keeps hyphens inside one token (“Crow-Armstrong”).
   * Compare compact forms to avoid substring false positives (“wood” vs “woodford”).
   */
  const suffixCompact = suffix.replace(/-/g, "");
  const lastOk =
    compactStripRomanGenerational(restCompact) ===
    compactStripRomanGenerational(suffixCompact);
  const firstTok = fparts[0]?.[0]?.toLowerCase() ?? "";

  return lastOk && firstTok === fi;
}

/**
 * Hydrated season pitching → SP/RP heuristic (replacement for generic roster `P`).
 * @param {Record<string, unknown>|null|undefined} stat
 * @returns {"SP"|"RP"}
 */
export function classifyPitcherFantasyRoleFromStats(stat) {
  if (!stat || typeof stat !== "object") return "SP";

  /** @type {{ gamesStarted?: unknown; gamesPitched?: unknown; gamesPlayed?: unknown; saves?: unknown; holds?: unknown }} */
  const s = stat;

  const gs = Number(s.gamesStarted ?? 0);
  const gp = Number(s.gamesPitched ?? s.gamesPlayed ?? 0);
  const saves = Number(s.saves ?? 0);
  const holds = Number(s.holds ?? 0);

  if (gs >= 5) return "SP";
  if (gs >= 1 && gp > 0 && gs >= gp * 0.34) return "SP";
  if (gp > 0 && gs === 0) return "RP";
  if (gs === 0 && saves + holds >= 5) return "RP";
  if (saves > 0 && saves >= holds) return "RP";
  return "SP";
}

/** @param {unknown} person statsapi hydrated people[n] entry */
export function extractRegularPitchSplitStat(person) {
  if (!person || typeof person !== "object") return null;
  const statsArr = Array.isArray(/** @type {{ stats?: unknown[] }} */ (person).stats) ?
      /** @type {{ stats: unknown[] }} */ (person).stats
    : [];

  /** @type {{ splits?: unknown[] } | undefined} */
  const pitching = statsArr.find(
    /** @param {any} s */
    (s) =>
      typeof s.group?.displayName === "string" &&
      s.group.displayName.toLowerCase() === "pitching",
  );
  const splits =
    pitching && Array.isArray(pitching.splits) ? pitching.splits : undefined;
  if (!Array.isArray(splits) || !splits.length) return null;
  /** @type {any} */
  const preferred =
    splits.find(
      /** @param {any} sp */
      (sp) =>
        typeof sp.gameType === "string" ?
          String(sp.gameType).toUpperCase() === "R"
        : false,
    ) ?? splits[0];
  return preferred?.stat ?? null;
}

/**
 * @param {{ raw_position:string, player_id:string, fantasy_pitch: "SP"|"RP"|null }[]} entries — mutated in-place
 */
export async function hydratePitchingRolesForFortyMan(entries, seasonYear) {
  const ids = [
    ...new Set(
      entries
        .filter(
          /** @param {typeof entries[number]} e */
          (e) => String(e.raw_position ?? "").trim().toUpperCase() === "P",
        )
        .map((e) => String(e.player_id)),
    ),
  ];
  /** @type {Map<string,"SP"|"RP">} */
  const roles = new Map();

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < ids.length; i += 22) {
    const idsChunk = ids.slice(i, i + 22);
    const hydrate = encodeURIComponent(
      `stats(group=pitching,type=season,season=${seasonYear},sportIds=1)`,
    );
    const url = `https://statsapi.mlb.com/api/v1/people?personIds=${idsChunk.join(",")}&hydrate=${hydrate}`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`StatsAPI people hydrate (${idsChunk.slice(0, 5)} …): ${res.status}`);
    /** @type {{ people?: unknown[] }} */
    const data = await res.json();

    for (const person of data.people ?? []) {
      const pid = String(/** @type {{ id?: unknown }} */ (person).id ?? "").trim();
      const rawStat =
        /** @type {Record<string, unknown>|null | undefined} */ (
          extractRegularPitchSplitStat(person)
        ) ?? null;

      roles.set(pid, classifyPitcherFantasyRoleFromStats(rawStat ?? {}));
    }

    await new Promise((resolve) => setTimeout(resolve, 140));
  }
  /* eslint-enable no-await-in-loop */

  for (const e of entries) {
    if (String(e.raw_position ?? "").trim().toUpperCase() !== "P") {
      e.fantasy_pitch = null;
      continue;
    }
    e.fantasy_pitch = roles.get(String(e.player_id)) ?? "SP";
  }
}

/**
 * Refresh roster index from StatsAPI (network).
 * Entries include MLB roster position abbreviations; pitchers get fantasyPitch SP|RP hydration.
 *
 * Env: CHECKPOINT_ROSTER_STATS_SEASON (otherwise prior calendar year, floor 2024).
 *
 * Writes JSON `{ schema:"checkpoint_mlb_40man_v2", … }`.
 * @param {{ seasonYear?: number }} [opts]
 */
export async function fetchFortyManRosterIndex(opts = {}) {
  const fallbackSeason = Math.min(
    Math.max(new Date().getFullYear() - 1, 2024),
    new Date().getFullYear(),
  );

  const seasonYear =
    typeof opts.seasonYear === "number" && Number.isFinite(opts.seasonYear) ?
      opts.seasonYear
    : Number(process.env.CHECKPOINT_ROSTER_STATS_SEASON || "") || fallbackSeason;

  /** @type {{player_id:string,name:string,abbr:string,raw_position:string,fantasy_pitch:"SP"|"RP"|null}[]} */
  const entries = [];

  /* eslint-disable no-await-in-loop */
  for (const teamId of MLB_TEAM_IDS) {
    const abbr = MLB_TEAM_ABBREV_BY_ID[teamId];
    const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`StatsAPI roster ${abbr} (${teamId}): ${res.status}`);
    /** @type {{ roster?: { person: { id: number; fullName?: string; primaryPosition?: { abbreviation?: string } }; position?: { abbreviation?: string } }[] }} */
    const data = await res.json();

    for (const r of data.roster ?? []) {
      const p = r.person;
      if (!p?.id || !p.fullName) continue;

      /** @type {string} */
      const raw_position = String(
        r.position?.abbreviation ?? p.primaryPosition?.abbreviation ?? "",
      )
        .trim()
        .toUpperCase();

      entries.push({
        player_id: String(p.id),
        name: p.fullName,
        abbr,
        raw_position,
        fantasy_pitch: null,
      });
    }

    await new Promise((rq) => setTimeout(rq, 75));
  }
  /* eslint-enable no-await-in-loop */

  await hydratePitchingRolesForFortyMan(entries, seasonYear);

  return {
    schema: "checkpoint_mlb_40man_v2",
    generated_at: new Date().toISOString(),
    entries,
    season_used_for_pitch_roles: seasonYear,
  };
}

export function writeFortyManIndex(path, payload) {
  fs.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

export function readFortyManIndex(path) {
  /** @type {{ entries: Record<string, unknown>[] }} */
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  if (!Array.isArray(raw.entries)) throw new Error(`Bad roster index ${path}`);

  /** @typedef {{player_id:string,name:string,abbr:string,raw_position:string,fantasy_pitch:"SP"|"RP"|null}} NormEntry */
  /** @type {NormEntry[]} */
  const norm = [];

  for (const eRaw of raw.entries) {
    if (!eRaw || typeof eRaw !== "object") continue;
    const e = /** @type {NormEntry & Record<string,unknown>} */ (eRaw);

    const raw_position = String(e.raw_position ?? "")
      .trim()
      .toUpperCase();

    /** @type {"SP"|"RP"|null} */
    let fantasy_pitch = null;
    const fp = e.fantasy_pitch;
    if (raw_position === "P") {
      const fpNorm = typeof fp === "string" ? fp.trim().toUpperCase() : "";
      if (fpNorm === "RP") fantasy_pitch = "RP";
      else if (fpNorm === "SP") fantasy_pitch = "SP";
    }

    norm.push({
      player_id: String(e.player_id),
      name: String(e.name),
      abbr: String(e.abbr),
      raw_position,
      fantasy_pitch,
    });
  }

  return norm;
}

/**
 * Merge synthetic roster rows (players missing from the committed 40-man snapshot).
 * @param {{ player_id: string; name: string; abbr: string; raw_position: string; fantasy_pitch: "SP"|"RP"|null }[]} baseEntries
 * @param {unknown[]} extras
 */
export function mergeFortyManWithExtras(baseEntries, extras) {
  /** @typedef {{ player_id: string; name: string; abbr: string; raw_position: string; fantasy_pitch: "SP"|"RP"|null }} Row */
  /** @type {Map<string, Row>} */
  const byId = new Map(
    baseEntries.map((e) => [
      String(e.player_id),
      {
        player_id: String(e.player_id),
        name: String(e.name),
        abbr: String(e.abbr),
        raw_position: String(e.raw_position ?? "")
          .trim()
          .toUpperCase(),
        fantasy_pitch:
          e.fantasy_pitch === "RP" || e.fantasy_pitch === "SP" ? e.fantasy_pitch : null,
      },
    ]),
  );

  for (const raw of extras ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const x = /** @type {Record<string, unknown>} */ (raw);
    const id = String(x.player_id ?? "").trim();
    if (!id) throw new Error("extra_roster_entries row missing player_id");
    if (byId.has(id)) continue;

    const fp = x.fantasy_pitch;
    /** @type {"SP"|"RP"|null} */
    let fantasy_pitch = null;
    if (fp === "RP" || fp === "SP") fantasy_pitch = fp;

    byId.set(id, {
      player_id: id,
      name: String(x.name ?? "Unknown"),
      abbr: String(x.abbr ?? "")
        .trim()
        .toUpperCase(),
      raw_position:
        String(x.raw_position ?? "")
          .trim()
          .toUpperCase() || "BN",
      fantasy_pitch,
    });
  }

  return [...byId.values()];
}

/**
 * Resolve a draft pick: workbook display vs MLB abbrev from sheet.
 * Honors `checkpoint-display-overrides.json` keyed by workbook display (“Joseph Ortiz” → Joey).
 *
 * @param {Record<string, unknown>} overrides — keeper-style `{ "Name": { player_id } }` map only (no `draft_picks` keys).
 * @param {{ pickNumber?: number; draftPicksByPick?: Record<string, { player_id?: string }> }} [pickResolveOpts]
 */
export function resolveDraftPick(
  entries,
  playerNameIn,
  mlbAbbrevSheet,
  overrides = {},
  pickResolveOpts = {},
) {
  const playerName = String(playerNameIn ?? "").trim();
  if (!playerName) throw new Error("Draft pick: empty Player cell");

  const pickKey =
    pickResolveOpts?.pickNumber != null &&
    Number.isFinite(Number(pickResolveOpts.pickNumber)) ?
      String(Number(pickResolveOpts.pickNumber))
    : "";
  const forcedPickId =
    pickKey && pickResolveOpts?.draftPicksByPick?.[pickKey]?.player_id ?
      String(pickResolveOpts.draftPicksByPick[pickKey].player_id)
    : "";

  if (forcedPickId) {
    const hit = entries.find((e) => String(e.player_id) === forcedPickId);
    if (!hit)
      throw new Error(
        `Draft pick #${pickKey} override references unknown player_id ${forcedPickId}`,
      );
    return { player_id: hit.player_id, name: hit.name };
  }

  const oid = overrides[playerName]?.player_id;
  if (oid) {
    const hit = entries.find((e) => String(e.player_id) === String(oid));
    if (!hit)
      throw new Error(
        `Draft override "${playerName}" references unknown player_id ${oid}`,
      );
    return { player_id: hit.player_id, name: hit.name };
  }

  const abbr = canonicalMlbAbbrevFromSheet(mlbAbbrevSheet);
  const wantKey = personNameDraftKey(playerName);

  /** Workbook omitted org (late-round sparse columns): key must be long enough before global match */
  if (!abbr) {
    const gEq = entries.filter((e) => personNameDraftKey(e.name) === wantKey);
    if (gEq.length === 1) return { player_id: gEq[0].player_id, name: gEq[0].name };

    const gFuzz = draftFuzzyUnique(entries, playerName, null);
    if (gFuzz.length === 1)
      return { player_id: gFuzz[0].player_id, name: gFuzz[0].name };

    throw new Error(`Draft pick missing MLB team: "${playerName}"`);
  }

  /** @type {typeof entries} */
  const pool = entries.filter((e) => e.abbr === abbr);

  const exact = pool.filter((e) => personNameDraftKey(e.name) === wantKey);
  if (exact.length > 1) {
    throw new Error(
      `Ambiguous draft pick "${playerName}" (${abbr}): roster has multiple ${wantKey}`,
    );
  }
  if (exact.length === 1) return { player_id: exact[0].player_id, name: exact[0].name };

  const initials = pool.filter((e) => matchesDisplayNameVariants(playerName, e.name));
  if (exact.length === 0 && initials.length === 1)
    return { player_id: initials[0].player_id, name: initials[0].name };

  /*
   * One-token workbook display (“Senga”) → surname within org — length floor avoids collisions.
   */
  const loneSurnameOnly = /^[a-z]{3,}[a-z-]*$/i.test(playerName) && wantKey.length >= 4;
  if (loneSurnameOnly) {
    const w = stripDiacritics(playerName).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const surnameHits = pool.filter((e) => {
      const fparts = stripDiacritics(e.name)
        .replace(/[^a-z0-9\s]/gi, " ")
        .split(/\s+/)
        .filter(Boolean);
      while (fparts.length > 1 && /^(jr|sr|ii|iii|iv)$/i.test(fparts.at(-1) ?? "")) {
        fparts.pop();
      }
      const last =
        fparts.length > 0 ?
          fparts[fparts.length - 1].replace(/[^a-z0-9]/gi, "").toLowerCase()
        : "";
      return last === w;
    });
    if (surnameHits.length === 1)
      return { player_id: surnameHits[0].player_id, name: surnameHits[0].name };
  }

  const fuzzyHits = draftFuzzyUnique(entries, playerName, abbr);
  if (fuzzyHits.length === 1)
    return { player_id: fuzzyHits[0].player_id, name: fuzzyHits[0].name };

  throw new Error(
    `Unresolved draft pick "${playerName}" (${abbr}): exact=${exact.length} initials=${initials.length} fuzzy=${fuzzyHits.length}`,
  );
}

/** @returns typeof entries filtered to uniqueness at lowest Levenshtein gap on fused keys */
function draftFuzzyUnique(entries, sheetDisplay, abbrOrNull) {
  const wantKey = personNameDraftKey(sheetDisplay);
  if (!wantKey) return [];

  const pool =
    abbrOrNull?.length ?
      entries.filter((e) => e.abbr === abbrOrNull)
    : entries;

  const maxDist = wantKey.length >= 17 ? 3 : 2;

  const scored = [];
  for (const e of pool) {
    const ek = personNameDraftKey(e.name);
    const d = levenshtein(wantKey, ek);
    if (d <= maxDist) scored.push({ e, d });
  }
  if (!scored.length) return [];

  scored.sort((a, b) => a.d - b.d || String(a.e.name).localeCompare(String(b.e.name)));
  const top = scored[0].d;
  const bests = scored.filter((x) => x.d === top).map((x) => x.e);
  return bests.length === 1 ? bests : [];
}

/**
 * Keeper rows often use abbreviated given names (“D. Baldwin”) with no MLB org column —
 * resolve against full 40-man union (ambiguous → error).
 *
 * Optional `overrides` map: `{ "R. Alvarez": { player_id: "XXXX" }, ... }` from
 * checkpoint-display-overrides.json for rare collisions like “M. Muncy”.
 */
export function resolveAbbreviatedKeeper(
  entries,
  keeperDisplayName,
  overrides = {},
) {
  const key = String(keeperDisplayName).trim();
  const forcedId = overrides[key]?.player_id;
  if (forcedId) {
    const hit = entries.find((e) => String(e.player_id) === String(forcedId));
    if (!hit)
      throw new Error(
        `Override for "${key}" references missing player_id ${forcedId} in 40-man index`,
      );
    return { player_id: hit.player_id, name: hit.name, team: hit.abbr };
  }

  const hits = [];
  for (const e of entries) {
    if (matchesDisplayNameVariants(keeperDisplayName, e.name)) hits.push(e);
  }
  if (hits.length === 1)
    return { player_id: hits[0].player_id, name: hits[0].name, team: hits[0].abbr };

  if (hits.length > 1) {
    const brief = hits
      .slice(0, 5)
      .map((h) => `${h.abbr}:${h.player_id}`)
      .join("; ");
    throw new Error(`Ambiguous keeper "${keeperDisplayName}" (${hits.length}): ${brief}…`);
  }

  /** One-edit tolerance on last token (workbook typos like Horowitz vs Horwitz). */
  const di = /^([a-z])[.\s]+\s*(.+)$/i.exec(String(keeperDisplayName).trim());
  if (di) {
    const fi = di[1].toLowerCase();
    const wantLast = stripDiacritics(di[2]).replace(/\./g, "").replace(/[^a-z0-9-]/gi, "");
    const soft = [];
    for (const e of entries) {
      const fparts = stripDiacritics(e.name)
        .replace(/[^a-z0-9\s-]/gi, "")
        .split(/\s+/)
        .filter(Boolean);
      if (!fparts.length) continue;
      const last = fparts[fparts.length - 1].replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (levenshtein(last, wantLast) > 1) continue;
      const firstChar = fparts[0]?.[0]?.toLowerCase() ?? "";
      if (firstChar !== fi) continue;
      soft.push(e);
    }
    if (soft.length === 1) {
      const e = soft[0];
      return { player_id: e.player_id, name: e.name, team: e.abbr };
    }
    if (soft.length > 1) {
      const brief = soft
        .slice(0, 5)
        .map((h) => `${h.abbr}:${h.player_id}`)
        .join("; ");
      throw new Error(
        `Ambiguous keeper (fuzzy) "${keeperDisplayName}" (${soft.length}): ${brief}…`,
      );
    }
  }

  throw new Error(`Unresolved keeper "${keeperDisplayName}" (no 40-man match)`);
}
