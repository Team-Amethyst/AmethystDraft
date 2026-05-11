import { test, expect, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";
import {
  E2E_API_ORIGIN,
  E2E_INTERNAL_API_KEY,
  E2E_JWT_SECRET,
  E2E_USER_ID,
} from "./constants.ts";

async function signInAndWaitForNewsSocket(page: Page): Promise<void> {
  const token = jwt.sign({ userId: E2E_USER_ID }, E2E_JWT_SECRET);
  const userPayload = {
    id: E2E_USER_ID,
    displayName: "E2E User",
    email: "e2e@test.local",
    createdAt: new Date().toISOString(),
  };

  await page.goto("/leagues");
  await page.evaluate(
    ({ token: t, user }) => {
      sessionStorage.setItem("token", t);
      sessionStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("token", t);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { token, user: userPayload },
  );

  await page.goto("/leagues");
  await page.reload();

  await expect(page.locator(".nb-alerts-btn")).toBeVisible({
    timeout: 30_000,
  });

  await expect
    .poll(
      async () => {
        const hasWarn = await page
          .locator(".nb-alerts-btn--socket-off")
          .count();
        return hasWarn === 0;
      },
      { message: "wait for Socket.IO (no amber disconnect ring)", timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("Intelligence alerts (news webhook → Socket.IO)", () => {
  test.beforeEach(async ({ page }) => {
    await signInAndWaitForNewsSocket(page);
  });

  test("custom webhook shows toast and persists row in bell dropdown", async ({
    page,
    request,
  }) => {
    const pingText = `E2E ping ${Date.now()}`;
    const hookRes = await request.post(
      `${E2E_API_ORIGIN}/api/internal/news-signals/hook`,
      {
        headers: {
          Authorization: `Bearer ${E2E_INTERNAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          event: "custom",
          message: pingText,
        },
      },
    );

    expect(hookRes.status()).toBe(204);
    const conn =
      hookRes.headers()["x-draftroom-socket-connections"] ??
      hookRes.headers()["X-Draftroom-Socket-Connections"];
    expect(conn, "need ≥1 browser socket or toast will not fire").toMatch(/^[1-9]/);

    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: pingText }),
    ).toBeVisible({ timeout: 20_000 });

    await page.locator(".nb-alerts-btn").click();
    await expect(page.getByText("Live webhook message")).toBeVisible();
    await expect(
      page.locator(".nb-alerts-dropdown").getByText(pingText),
    ).toBeVisible();
  });

  test("GET news-signals/debug reports at least one browser socket and route hints", async ({
    request,
  }) => {
    const res = await request.get(
      `${E2E_API_ORIGIN}/api/internal/news-signals/debug`,
      {
        headers: {
          Authorization: `Bearer ${E2E_INTERNAL_API_KEY}`,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      socketIoConnections: number;
      newsSignalsPollerRefcount: number;
      pollerIntervalActive: boolean;
      postWebhookPath: string;
      socketIoPath: string;
    };

    expect(body.socketIoConnections, "signed-in tab should hold a Socket.IO client").toBeGreaterThanOrEqual(1);
    expect(body.newsSignalsPollerRefcount).toBeGreaterThanOrEqual(1);
    expect(body.pollerIntervalActive).toBe(true);
    expect(body.postWebhookPath).toBe("/api/internal/news-signals/hook");
    expect(body.socketIoPath).toBe("/socket.io");
  });
});
