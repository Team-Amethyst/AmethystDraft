import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiOrigin } from "../api/client";

export const NEWS_SIGNALS_UPDATED_EVENT = "news_signals_updated";

/**
 * Subscribes to BFF Socket.IO pushes when Engine news/injury signals change.
 * Connect only while `enabled` (e.g. inside an active league session).
 */
export function useNewsSignalsRealtime(
  token: string | null,
  enabled: boolean,
  onSignalsUpdated: () => void,
): void {
  const cbRef = useRef(onSignalsUpdated);

  useEffect(() => {
    cbRef.current = onSignalsUpdated;
  }, [onSignalsUpdated]);

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

      socket.on(NEWS_SIGNALS_UPDATED_EVENT, () => {
        cbRef.current();
      });
    })();

    return () => {
      cancelled = true;
      socket?.removeAllListeners();
      socket?.close();
    };
  }, [enabled, token]);
}
