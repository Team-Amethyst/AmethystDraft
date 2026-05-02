import { describe, expect, it } from "vitest";
import { DRAFT_SESSION_NOTE_PLAYER_ID } from "./draftNoteIds";

describe("DRAFT_SESSION_NOTE_PLAYER_ID", () => {
  it("is a stable sentinel id", () => {
    expect(DRAFT_SESSION_NOTE_PLAYER_ID).toBe("__draft__");
  });
});
