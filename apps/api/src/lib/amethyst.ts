import axios from "axios";
import { getRequestIdFromStore } from "./requestContext";

// Instance is constructed at import time, before dotenv runs.
// Read env vars lazily in an interceptor so they're resolved at request time.
const DEFAULT_ENGINE_TIMEOUT_MS = 15_000;

export const amethyst = axios.create({ timeout: DEFAULT_ENGINE_TIMEOUT_MS });

amethyst.interceptors.request.use((config) => {
  const url = process.env.AMETHYST_API_URL;
  if (!url) throw new Error("AMETHYST_API_URL is not set");
  config.baseURL = url;
  const apiKey = process.env.AMETHYST_API_KEY;
  if (!apiKey) throw new Error("AMETHYST_API_KEY is not set");
  config.headers["x-api-key"] = apiKey;

  const customTimeout = Number(process.env.AMETHYST_ENGINE_TIMEOUT_MS);
  if (Number.isFinite(customTimeout) && customTimeout > 0) {
    config.timeout = customTimeout;
  } else {
    config.timeout = DEFAULT_ENGINE_TIMEOUT_MS;
  }

  const rid = getRequestIdFromStore();
  if (rid) {
    config.headers["X-Request-Id"] = rid;
  }

  return config;
});
