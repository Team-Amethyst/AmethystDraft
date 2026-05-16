import { describe, it, expect } from "vitest";
import {
  formatReserveCountLine,
  formatReserveModalSubtitle,
} from "./LeagueOverviewReserves";

describe("formatReserveCountLine", () => {
  it("formats compact minors and taxi counts", () => {
    expect(formatReserveCountLine(8, 8)).toBe("Minors 8 · Taxi 8");
    expect(formatReserveCountLine(8, 0)).toBe("Minors 8");
    expect(formatReserveCountLine(0, 8)).toBe("Taxi 8");
  });
});

describe("formatReserveModalSubtitle", () => {
  it("formats modal subtitle with lowercase pool labels", () => {
    expect(formatReserveModalSubtitle(6, 8)).toBe(
      "Reserves: 6 minors · 8 taxi",
    );
    expect(formatReserveModalSubtitle(1, 0)).toBe("Reserves: 1 minor");
    expect(formatReserveModalSubtitle(0, 3)).toBe("Reserves: 3 taxi");
  });
});
