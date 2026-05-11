import { describe, it, expect } from "vitest";
import { extractEngineNewsWebhookSnapshotHint } from "./engineNewsWebhookHint";

const FP =
  "a".repeat(64);

describe("extractEngineNewsWebhookSnapshotHint", () => {
  it("returns null when event is not signals_updated", () => {
    expect(
      extractEngineNewsWebhookSnapshotHint({
        event: "custom",
        fingerprint: FP,
      }),
    ).toBeNull();
  });

  it("returns null when fingerprint missing or invalid", () => {
    expect(
      extractEngineNewsWebhookSnapshotHint({
        event: "signals_updated",
      }),
    ).toBeNull();
    expect(
      extractEngineNewsWebhookSnapshotHint({
        event: "signals_updated",
        fingerprint: "short",
      }),
    ).toBeNull();
  });

  it("parses valid signals_updated with fingerprint and count", () => {
    expect(
      extractEngineNewsWebhookSnapshotHint({
        event: "signals_updated",
        fingerprint: FP,
        count: 12,
      }),
    ).toEqual({ fingerprint: FP, count: 12 });
  });

  it("defaults count when absent", () => {
    expect(
      extractEngineNewsWebhookSnapshotHint({
        event: "signals_updated",
        fingerprint: FP,
      }),
    ).toEqual({ fingerprint: FP, count: 0 });
  });
});
