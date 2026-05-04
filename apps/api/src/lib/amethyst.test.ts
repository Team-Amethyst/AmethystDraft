import { afterEach, describe, expect, it } from "vitest";
import { resolveAmethystEngineBaseUrl } from "./amethyst";

describe("resolveAmethystEngineBaseUrl", () => {
  afterEach(() => {
    delete process.env.AMETHYST_API_BASE_URL;
    delete process.env.AMETHYST_API_URL;
  });

  it("prefers AMETHYST_API_BASE_URL over AMETHYST_API_URL", () => {
    process.env.AMETHYST_API_BASE_URL = "https://engine.example/api/";
    process.env.AMETHYST_API_URL = "https://legacy.example";
    expect(resolveAmethystEngineBaseUrl()).toBe("https://engine.example/api");
  });

  it("falls back to AMETHYST_API_URL when base is unset", () => {
    delete process.env.AMETHYST_API_BASE_URL;
    process.env.AMETHYST_API_URL = "https://only-legacy/";
    expect(resolveAmethystEngineBaseUrl()).toBe("https://only-legacy");
  });

  it("throws when neither base env is set", () => {
    delete process.env.AMETHYST_API_BASE_URL;
    delete process.env.AMETHYST_API_URL;
    expect(() => resolveAmethystEngineBaseUrl()).toThrow(/AMETHYST_API_BASE_URL/);
  });
});
