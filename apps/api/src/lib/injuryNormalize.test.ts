import { describe, expect, it } from "vitest";
import {
  injurySeverityFrom40ManStatus,
  injuryStatusDisplayFrom40ManStatus,
  injuryStatusLabelFromRosterCode,
} from "./injuryNormalize";

describe("injurySeverityFrom40ManStatus", () => {
  it("maps D10 to severity 2", () => {
    expect(injurySeverityFrom40ManStatus("D10", "10-Day Injured List")).toBe(2);
  });

  it("maps D60 to severity 3", () => {
    expect(injurySeverityFrom40ManStatus("D60", "60-Day Injured List")).toBe(3);
  });

  it("maps missing / active to 0", () => {
    expect(injurySeverityFrom40ManStatus(undefined, undefined)).toBe(0);
    expect(injurySeverityFrom40ManStatus("A", "Active")).toBe(0);
    expect(injurySeverityFrom40ManStatus("", "")).toBe(0);
  });

  it("maps D7 and D15 to severity 2", () => {
    expect(injurySeverityFrom40ManStatus("D7", "")).toBe(2);
    expect(injurySeverityFrom40ManStatus("D15", "")).toBe(2);
  });

  it("maps day-to-day description to 1 when no IL code", () => {
    expect(injurySeverityFrom40ManStatus("", "Day-To-Day")).toBe(1);
    expect(injurySeverityFrom40ManStatus("MIN", "Minor")).toBe(1);
  });

  it("maps 60-day wording without D60 code to 3", () => {
    expect(injurySeverityFrom40ManStatus("", "Rehab — 60-Day Injured List")).toBe(
      3,
    );
  });

  it("maps bereavement list to 1", () => {
    expect(injurySeverityFrom40ManStatus("BRV", "Bereavement List")).toBe(1);
  });

  it("maps MIN roster code with blank description to severity 1 (sparse roster dumps)", () => {
    expect(injurySeverityFrom40ManStatus("MIN", "")).toBe(1);
  });

  it("matches catalog: D10 → IL10 label and severity 2", () => {
    expect(injuryStatusLabelFromRosterCode("D10")).toBe("IL10");
    expect(injurySeverityFrom40ManStatus("D10", "10-Day Injured List")).toBe(2);
  });
});

describe("injuryStatusDisplayFrom40ManStatus", () => {
  it("infers IL chips from description when roster code is absent", () => {
    expect(
      injuryStatusDisplayFrom40ManStatus("", "10-Day Injured List"),
    ).toBe("IL10");
    expect(injuryStatusDisplayFrom40ManStatus(undefined, "15-Day IL")).toBe(
      "IL15",
    );
    expect(
      injuryStatusDisplayFrom40ManStatus("", "Rehab — 60-Day Injured List"),
    ).toBe("IL60");
  });

  it("still prefers standard roster codes as IL7…IL60 labels", () => {
    expect(injuryStatusDisplayFrom40ManStatus("D10", "anything")).toBe("IL10");
  });

  it("maps uncertain language to DTD when no IL roster code", () => {
    expect(injuryStatusDisplayFrom40ManStatus("", "Day-To-Day")).toBe("DTD");
  });
});

describe("injuryStatusLabelFromRosterCode", () => {
  it("preserves IL display labels for standard IL codes", () => {
    expect(injuryStatusLabelFromRosterCode("D10")).toBe("IL10");
    expect(injuryStatusLabelFromRosterCode("D60")).toBe("IL60");
    expect(injuryStatusLabelFromRosterCode("D7")).toBe("IL7");
    expect(injuryStatusLabelFromRosterCode("D15")).toBe("IL15");
  });

  it("returns undefined for non-IL roster codes", () => {
    expect(injuryStatusLabelFromRosterCode("BRV")).toBeUndefined();
    expect(injuryStatusLabelFromRosterCode("A")).toBeUndefined();
  });
});
