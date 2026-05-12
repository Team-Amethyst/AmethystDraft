import { describe, expect, it } from "vitest";
import { fingerprintNewsSignalsPayload } from "./newsSignalsFingerprint";

describe("fingerprintNewsSignalsPayload", () => {
  it("matches regardless of signal row order", () => {
    const a = {
      count: 2,
      signals: [
        { player_name: "A", signal_type: "injury", effective_date: "2026-01-01" },
        { player_name: "B", signal_type: "trade", effective_date: "2026-01-02" },
      ],
    };
    const b = {
      count: 2,
      signals: [...a.signals].reverse(),
    };
    expect(fingerprintNewsSignalsPayload(a)).toBe(fingerprintNewsSignalsPayload(b));
  });

  it("changes when a row changes", () => {
    const base = {
      count: 1,
      signals: [
        { player_name: "A", signal_type: "injury", effective_date: "2026-01-01" },
      ],
    };
    const changed = {
      ...base,
      signals: [
        {
          player_name: "A",
          signal_type: "injury",
          effective_date: "2026-01-02",
        },
      ],
    };
    expect(fingerprintNewsSignalsPayload(base)).not.toBe(
      fingerprintNewsSignalsPayload(changed),
    );
  });
});
