import { describe, expect, it, vi, afterEach } from "vitest";
import { createClientUuid } from "./randomUuid";

describe("createClientUuid", () => {
  const orig = globalThis.crypto;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      value: orig,
      configurable: true,
      writable: true,
    });
  });

  it("uses getRandomValues when randomUUID is missing", () => {
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    });
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues },
      configurable: true,
    });
    const id = createClientUuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(getRandomValues).toHaveBeenCalled();
  });

  it("uses randomUUID when available", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID, getRandomValues: orig?.getRandomValues },
      configurable: true,
    });
    expect(createClientUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });
});
