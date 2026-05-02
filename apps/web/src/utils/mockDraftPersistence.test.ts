import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockDraftState,
  loadMockDraftState,
  mockDraftStorageKey,
  saveMockDraftState,
} from "./mockDraftPersistence";
import { initialMockDraftState } from "../domain/mockDraftState";

function memoryLocalStorage(): Storage {
  const mem: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(mem).length;
    },
    clear() {
      for (const k of Object.keys(mem)) delete mem[k];
    },
    getItem(key: string) {
      return mem[key] ?? null;
    },
    key(index: number) {
      return Object.keys(mem)[index] ?? null;
    },
    removeItem(key: string) {
      delete mem[key];
    },
    setItem(key: string, value: string) {
      mem[key] = value;
    },
  } as Storage;
}

describe("mockDraftPersistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a stable storage key per league", () => {
    expect(mockDraftStorageKey("lg-1")).toBe("amethyst-mock-draft-lg-1");
  });

  it("round-trips state", () => {
    const state = {
      ...initialMockDraftState,
      phase: "nomination" as const,
      message: "hi",
    };
    saveMockDraftState("lg-x", state);
    expect(loadMockDraftState("lg-x")).toEqual(state);
    clearMockDraftState("lg-x");
    expect(loadMockDraftState("lg-x")).toBeNull();
  });
});
