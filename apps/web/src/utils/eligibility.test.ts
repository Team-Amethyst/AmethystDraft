import { describe, expect, it } from "vitest";
import {
  collapsePitcherPositionChipsForDisplay,
  draftDisplaySlotsForPlayer,
  playerDraftableRosterSlots,
  getEligibleSlotsForPosition,
  getEligibleSlotsForPositions,
  hasPitcherEligibility,
  normalizePlayerPositions,
  playerDisplayPositionBadges,
  playerIdentityPositionPresentation,
  researchTablePrimaryPositionParts,
  slotAllowsPosition,
} from "./eligibility";

describe("normalizePlayerPositions", () => {
  it("normalizes OF variants and de-duplicates positions", () => {
    expect(normalizePlayerPositions(["LF", "CF", "OF"]))
      .toEqual(["OF"]);
  });

  it("falls back to primary position when positions list is absent", () => {
    expect(normalizePlayerPositions(undefined, "2B/OF"))
      .toEqual(["2B", "OF"]);
  });

  it("maps TWP to both pitcher and hitter eligibility", () => {
    expect(normalizePlayerPositions(["TWP"]))
      .toEqual(["SP", "DH"]);
  });
});

describe("slotAllowsPosition", () => {
  it("allows hitters into UTIL but not pitchers", () => {
    expect(slotAllowsPosition("UTIL", "1B")).toBe(true);
    expect(slotAllowsPosition("UTIL", "SP")).toBe(false);
  });

  it("allows generic P into SP and RP slots", () => {
    expect(slotAllowsPosition("SP", "P")).toBe(true);
    expect(slotAllowsPosition("RP", "P")).toBe(true);
    expect(slotAllowsPosition("P", "P")).toBe(true);
  });

  it("supports CI and MI composite slots", () => {
    expect(slotAllowsPosition("CI", "1B")).toBe(true);
    expect(slotAllowsPosition("CI", "3B")).toBe(true);
    expect(slotAllowsPosition("MI", "2B")).toBe(true);
    expect(slotAllowsPosition("MI", "SS")).toBe(true);
  });
});

describe("eligible slot helpers", () => {
  const slots = ["C", "1B", "2B", "SS", "3B", "CI", "MI", "OF", "UTIL", "SP", "RP", "P", "BN"];

  it("uses full eligible positions array when present", () => {
    expect(getEligibleSlotsForPositions(["2B", "OF"], slots))
      .toEqual(["2B", "MI", "OF", "UTIL", "BN"]);
  });

  it("falls back to primary position string when needed", () => {
    expect(getEligibleSlotsForPositions(undefined, slots, "1B/3B"))
      .toEqual(["1B", "3B", "CI", "UTIL", "BN"]);
  });

  it("preserves pitcher eligibility for TWP", () => {
    expect(getEligibleSlotsForPosition("TWP", slots))
      .toEqual(["UTIL", "SP", "P", "BN"]);
  });
});

describe("hasPitcherEligibility", () => {
  it("detects pitcher eligibility from either positions or fallback", () => {
    expect(hasPitcherEligibility(["SP"])).toBe(true);
    expect(hasPitcherEligibility(undefined, "RP")).toBe(true);
    expect(hasPitcherEligibility(["OF", "1B"])).toBe(false);
  });
});

describe("draftDisplaySlotsForPlayer", () => {
  const slots = ["C", "1B", "2B", "SS", "3B", "CI", "MI", "OF", "DH", "UTIL", "SP", "RP", "P", "BN"];

  it("drops UTIL/BN/DH and keeps real roster slots", () => {
    expect(draftDisplaySlotsForPlayer(["1B", "DH"], slots)).toEqual(["1B", "CI"]);
  });

  it("maps LF to OF and does not list UTIL", () => {
    expect(draftDisplaySlotsForPlayer(["LF"], slots)).toEqual(["OF"]);
  });

  it("returns empty when only UTIL/BN would apply (e.g. DH-only vs universal slots)", () => {
    expect(draftDisplaySlotsForPlayer(["DH"], slots)).toEqual([]);
  });
});

describe("playerDraftableRosterSlots", () => {
  const slots = ["C", "1B", "2B", "SS", "3B", "CI", "MI", "OF", "UTIL", "SP", "RP", "P", "BN"];

  it("lists all eligible slots in roster order including UTIL and bench", () => {
    expect(playerDraftableRosterSlots({ position: "1B", positions: ["1B", "DH"] }, slots)).toEqual([
      "1B",
      "CI",
      "UTIL",
      "BN",
    ]);
  });

  it("includes OF and UTIL for outfielders", () => {
    expect(playerDraftableRosterSlots({ position: "LF", positions: ["LF"] }, slots)).toEqual([
      "OF",
      "UTIL",
      "BN",
    ]);
  });
});

describe("playerIdentityPositionPresentation", () => {
  const slots = [
    "C",
    "1B",
    "2B",
    "SS",
    "3B",
    "CI",
    "MI",
    "OF",
    "UTIL",
    "SP",
    "RP",
    "P",
    "BN",
  ];

  it("keeps MI, CI, and UTIL on the slot line only (not primary)", () => {
    const player = { positions: ["SS", "3B", "OF"], position: "SS" };
    const r = playerIdentityPositionPresentation(player, slots);
    expect(r.primaryTags).toEqual(["SS", "3B", "OF"]);
    expect(r.slotEligibilityTags).toEqual(
      expect.arrayContaining(["MI", "CI", "UTIL"]),
    );
    expect(r.primaryTags).toEqual(expect.not.arrayContaining(["MI", "CI", "UTIL"]));
  });

  it("maps 1B to CI on the slot line, not as a primary duplicate", () => {
    const player = { positions: ["1B"], position: "1B" };
    const r = playerIdentityPositionPresentation(player, slots);
    expect(r.primaryTags).toEqual(["1B"]);
    expect(r.slotEligibilityTags).toEqual(
      expect.arrayContaining(["CI", "UTIL"]),
    );
  });

  it("uses one P primary chip and lists draftable SP slot for a starter league", () => {
    const league = ["C", "OF", "SP", "RP", "UTIL", "BN"];
    const player = { positions: ["SP"], position: "SP" };
    const r = playerIdentityPositionPresentation(player, league);
    expect(r.primaryTags).toEqual(["P"]);
    expect(r.slotEligibilityTags).toEqual(["SP"]);
    expect(r.draftableSlots).toEqual(
      expect.arrayContaining(["SP", "BN"]),
    );
    expect(r.roleLabel).toBeNull();
    expect(r.roleNote).toBeNull();
  });

  it("draftableSlots includes every roster slot the player may fill (not MI-only subset)", () => {
    const player = { positions: ["SS", "3B", "OF"], position: "SS" };
    const r = playerIdentityPositionPresentation(player, slots);
    expect(r.draftableSlots).toEqual(
      expect.arrayContaining(["SS", "3B", "OF", "MI", "CI", "UTIL", "BN"]),
    );
  });
});

describe("researchTablePrimaryPositionParts", () => {
  const slots = [
    "C",
    "1B",
    "2B",
    "SS",
    "3B",
    "CI",
    "MI",
    "OF",
    "UTIL",
    "SP",
    "RP",
    "BN",
  ];

  it("lists primary scan-line positions only (no MI / CI / UTIL / SP / RP)", () => {
    const player = { positions: ["SS", "3B", "OF"], position: "SS" };
    expect(researchTablePrimaryPositionParts(player, slots)).toEqual([
      "SS",
      "3B",
      "OF",
    ]);
  });

  it("uses P only for arms (no SP / RP tokens)", () => {
    const league = ["C", "OF", "SP", "RP", "UTIL", "BN"];
    const player = { positions: ["SP"], position: "SP" };
    expect(researchTablePrimaryPositionParts(player, league)).toEqual(["P"]);
  });

  it("adds DH only when the league roster includes a DH slot", () => {
    const withDh = ["C", "1B", "DH", "OF", "UTIL", "BN"];
    const noDh = ["C", "1B", "OF", "UTIL", "BN"];
    const player = { positions: ["1B", "DH"], position: "1B" };
    expect(researchTablePrimaryPositionParts(player, withDh)).toEqual([
      "1B",
      "DH",
    ]);
    expect(researchTablePrimaryPositionParts(player, noDh)).toEqual(["1B"]);
  });
});

describe("playerDisplayPositionBadges", () => {
  const slots = ["C", "1B", "2B", "SS", "3B", "CI", "MI", "OF", "UTIL", "SP", "RP", "BN"];

  it("with league slots, omits DH from multi-position hitters (e.g. OF + DH)", () => {
    const player = { positions: ["OF", "DH"], position: "OF" };
    expect(playerDisplayPositionBadges(player, slots)).toEqual(["OF"]);
  });

  it("without league slots, strips DH from normalized positions", () => {
    const player = { positions: ["RF", "DH"], position: "RF" };
    expect(playerDisplayPositionBadges(player, undefined)).toEqual(["OF"]);
  });

  it("returns empty when only DH remains after strip", () => {
    const player = { positions: ["DH"], position: "DH" };
    expect(playerDisplayPositionBadges(player, undefined)).toEqual([]);
  });

  it("collapses SP, RP, and P roster slots to one P chip", () => {
    const slots = ["C", "OF", "SP", "RP", "P", "UTIL", "BN"];
    const player = { positions: ["RP"], position: "RP" };
    expect(playerDisplayPositionBadges(player, slots)).toEqual(["P"]);
  });

  it("keeps hitters and one P when two-way OF + RP", () => {
    const slots = ["C", "OF", "SP", "RP", "UTIL", "BN"];
    const player = { positions: ["OF", "RP"], position: "OF" };
    expect(playerDisplayPositionBadges(player, slots)).toEqual(["OF", "P"]);
  });
});

describe("collapsePitcherPositionChipsForDisplay", () => {
  it("merges SP and RP in roster order into a single P", () => {
    expect(collapsePitcherPositionChipsForDisplay(["SP", "RP"])).toEqual(["P"]);
  });

  it("passes through non-pitcher slots unchanged", () => {
    expect(collapsePitcherPositionChipsForDisplay(["1B", "SP", "CI"])).toEqual([
      "1B",
      "P",
      "CI",
    ]);
  });
});