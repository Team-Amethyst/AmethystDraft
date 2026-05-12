import type { Server } from "socket.io";

type RedisClient = import("redis").RedisClientType;

let pubClient: RedisClient | null = null;
let subClient: RedisClient | null = null;

/**
 * When `REDIS_URL` is set, fan-out Socket.IO across all Draft API processes
 * (Engine webhooks and browser sockets may land on different App Runner tasks).
 */
export async function attachRedisAdapterIfConfigured(io: Server): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return;

  try {
    const { createClient } = await import("redis");
    const { createAdapter } = await import("@socket.io/redis-adapter");
    pubClient = createClient({ url });
    subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[socket.io] Redis adapter enabled (REDIS_URL)");
  } catch (err) {
    console.error(
      "[socket.io] Redis adapter failed — continuing without it (set REDIS_URL only when Redis is reachable):",
      err,
    );
    await shutdownRedisAdapter();
  }
}

export async function shutdownRedisAdapter(): Promise<void> {
  try {
    await subClient?.quit();
  } catch {
    /* ignore */
  }
  try {
    await pubClient?.quit();
  } catch {
    /* ignore */
  }
  subClient = null;
  pubClient = null;
}
