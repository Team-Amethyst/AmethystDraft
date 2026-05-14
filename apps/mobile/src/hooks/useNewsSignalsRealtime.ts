import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiOrigin } from "../api/client";

export type NewsSocketConnectionState = boolean | null;

export const NEWS_SIGNALS_UPDATED_EVENT = "news_signals_updated";

type NewsSignalsSocketPayload = {
  ping?: boolean;
  message?: string;
  count?: number;
  fingerprint?: string;
};

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
    const authToken = token?.trim();

    if (!enabled || !authToken) {
      connRef.current?.(false);
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;

    async function connectSocket() {
      let origin = "";

      try {
        origin = await getApiOrigin();
      } catch {
        connRef.current?.(false);
        return;
      }

      if (cancelled) return;

      connRef.current?.(null);

      socket = io(origin, {
        auth: { token: authToken },
        path: "/socket.io",
        transports: ["polling", "websocket"],
        autoConnect: true,
        timeout: 20000,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      socket.on("connect", () => {
        connRef.current?.(true);
      });

      socket.on("disconnect", () => {
        connRef.current?.(false);
      });

      socket.on("connect_error", () => {
        connRef.current?.(false);
      });

      socket.on(
        NEWS_SIGNALS_UPDATED_EVENT,
        (payload?: NewsSignalsSocketPayload) => {
          if (payload?.ping) {
            pingRef.current?.(
              payload.message?.trim() ||
                "Webhook test received — live connection OK.",
            );
            return;
          }

          cbRef.current();
        },
      );
    }

    void connectSocket();

    return () => {
      cancelled = true;
      connRef.current?.(false);
      socket?.removeAllListeners();
      socket?.close();
    };
  }, [enabled, token]);
}