import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { getApiOrigin } from "../api/client";

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
 */
export function useNewsSignalsRealtime(
  token: string | null,
  enabled: boolean,
  onSignalsUpdated: () => void,
  onWebhookPing?: (message?: string) => void,
): void {
  const cbRef = useRef(onSignalsUpdated);
  const pingRef = useRef(onWebhookPing);

  useEffect(() => {
    cbRef.current = onSignalsUpdated;
  }, [onSignalsUpdated]);

  useEffect(() => {
    pingRef.current = onWebhookPing;
  }, [onWebhookPing]);

  useEffect(() => {
    if (!enabled || !token?.trim()) return;

    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      let origin: string;
      try {
        origin = await getApiOrigin();
      } catch {
        return;
      }
      if (cancelled) return;

      socket = io(origin, {
        auth: { token: token.trim() },
        path: "/socket.io",
        transports: ["websocket", "polling"],
        autoConnect: true,
      });

      if (import.meta.env.DEV) {
        socket.on("connect", () => {
          console.debug("[newsRealtime] socket connected", origin);
        });
        socket.on("connect_error", (err: Error) => {
          console.warn("[newsRealtime] connect_error", err.message);
        });
      }

      socket.on(
        NEWS_SIGNALS_UPDATED_EVENT,
        (payload?: NewsSignalsSocketPayload) => {
          if (payload?.ping) {
            const text =
              payload.message?.trim() ||
              "Webhook test received — live connection OK.";
            toast.message(text, { duration: 6000 });
            pingRef.current?.(payload.message);
            return;
          }
          cbRef.current();
        },
      );
    })();

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.close();
    };
  }, [enabled, token]);
}
