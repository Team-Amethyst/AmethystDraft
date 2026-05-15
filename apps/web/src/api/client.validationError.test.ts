import { describe, expect, it } from "vitest";

/** Mirrors private helper in client.ts for API BFF validation payloads. */
function messageFromValidationErrors(
  errors: { field?: string; message?: string }[],
): string {
  return errors
    .map((e) => {
      const f = e.field?.trim() || "request";
      const m = e.message?.trim() || "invalid";
      return `${f}: ${m}`;
    })
    .join("; ");
}

describe("API validation error formatting", () => {
  it("formats error.details field messages like the API returns", () => {
    const message = messageFromValidationErrors([
      { field: "teams", message: "Number must be greater than or equal to 2" },
    ]);
    expect(message).toBe(
      "teams: Number must be greater than or equal to 2",
    );
  });
});
