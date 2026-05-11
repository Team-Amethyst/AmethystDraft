import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { getApiOrigin } from "../api/client";

/** `null` while resolving API origin / connecting; then live boolean. */
export type NewsSocketConnectionState = boolean | null;

export const NEWS_SIGNALS_UPDATED_EVENT = "news_signals_updated";

type NewsSignalsSocketPayload = {
  ping?: boolean;
  message?: string;
  count?: number;
  fingerprint?: string;
};

/**
 * Subscribes to BFF Socket.IO pushes when Engine news/injury signals change.
 * Connect only while `enabled` (e.g. inside an active league session).
 *
 * `onWebhookPing` fires for Engine portal test webhooks (`event: "custom"`).
 * The server emits `ping: true`; we toast here and callers can mirror into UI (e.g. alerts panel).
 *
 * `onSocketConnectionChange`: `null` while connecting, `true` when the socket is up,
 * `false` when disabled, handshake failed, or disconnected (custom pings will not arrive).
 */
export function useNewsSignalsRealtime(
  token: string | null,
  enabled: boolean,
  onSignalsUpdated: () => void,
  onWebhookPing?: (message?: string) => void,
  onSocketConnectionChange?: (state: NewsSocketConnectionState) => void,
): void {
  const cbRef = useRef(onSignalsUpdated);
  const pingRef = useRef(onWebhookPing);
  const connRef = useRef(onSocketConnectionChange);

  useEffect(() => {
    cbRef.current = onSignalsUpdated;
  }, [onSignalsUpdated]);

  useEffect(() => {
    pingRef.current = onWebhookPing;
  }, [onWebhookPing]);

  useEffect(() => {
    connRef.current = onSocketConnectionChange;
  }, [onSocketConnectionChange]);

  useEffect(() => {
    if (!enabled || !token?.trim()) {
      connRef.current?.(false);
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      let origin: string;
      try {
        origin = await getApiOrigin();
      } catch {
        connRef.current?.(false);
        return;
      }
      if (cancelled) return;

      connRef.current?.(null);

      // Long-polling only: many proxies (including some AWS App Runner / Envoy setups)
      // accept Engine.IO HTTP polling but fail WebSocket upgrade — then custom webhook
      // pings never reach the tab. Polling is fine for infrequent news pushes.
      socket = io(origin, {
        auth: { token: token.trim() },
        path: "/socket.io",
        transports: ["polling"],
        upgrade: false,
        autoConnect: true,
        timeout: 20_000,
        reconnectionAttempts: 10,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
      });

      socket.on("connect", () => {
        connRef.current?.(true);
        if (import.meta.env.DEV) {
          console.debug("[newsRealtime] socket connected", origin);
        }
      });

      socket.on("disconnect", () => {
        connRef.current?.(false);
      });

      socket.on("connect_error", (err: Error) => {
        connRef.current?.(false);
        if (import.meta.env.DEV) {
          console.warn("[newsRealtime] connect_error", err.message);
        }
      });

      socket.on(
        NEWS_SIGNALS_UPDATED_EVENT,
        (payload?: NewsSignalsSocketPayload) => {
          if (payload?.ping) {
            const text =
              payload.message?.trim() ||
              "Webhook test received — live connection OK.";
            toast.message(text, {
              duration: 6000,
              id: "draftroom-news-webhook-ping",
            });
            pingRef.current?.(payload.message);
            return;
          }
          cbRef.current();
        },
      );
    })();

    return () => {
      cancelled = true;
      connRef.current?.(false);
      socket?.removeAllListeners();
      socket?.close();
    };
  }, [enabled, token]);
}
