import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetNewsSignalsWebhookIngressForTests,
  decideNewsSignalsWebhookIngress,
  getNewsSignalsWebhookIngressCounters,
  stableJsonForWebhookFingerprint,
  webhookPayloadFingerprint,
} from "./newsSignalsWebhookIngress";

describe("newsSignalsWebhookIngress", () => {
  beforeEach(() => {
    __resetNewsSignalsWebhookIngressForTests();
  });

  it("canonicalizes JSON key order for fingerprinting", () => {
    const a = { z: 1, a: { m: 2, b: 1 } };
    const b = { a: { b: 1, m: 2 }, z: 1 };
    expect(stableJsonForWebhookFingerprint(a)).toBe(
      stableJsonForWebhookFingerprint(b),
    );
    expect(webhookPayloadFingerprint(a)).toBe(webhookPayloadFingerprint(b));
  });

  it("first call is full, identical body within TTL is dedupe_body", () => {
    const body = { event: "signals_updated", fingerprint: "a".repeat(64) };
    expect(decideNewsSignalsWebhookIngress(body)).toBe("full");
    expect(decideNewsSignalsWebhookIngress(body)).toBe("dedupe_body");
    const c = getNewsSignalsWebhookIngressCounters();
    expect(c.forcePollInvoked).toBe(1);
    expect(c.dedupeSkipped).toBe(1);
  });

  it("different bodies within poll spacing get throttle_poll_only", () => {
    expect(decideNewsSignalsWebhookIngress({ a: 1 })).toBe("full");
    expect(decideNewsSignalsWebhookIngress({ b: 2 })).toBe("throttle_poll_only");
    const c = getNewsSignalsWebhookIngressCounters();
    expect(c.forcePollInvoked).toBe(1);
    expect(c.pollThrottled).toBe(1);
  });
});
