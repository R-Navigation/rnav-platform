import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4090),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  DEVICE_TOKEN_PEPPER: z.string().min(32),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  MONITOR_WS_PATH: z.string().regex(/^\/[a-z0-9/_-]*$/i).default("/ws"),
  MONITOR_OFFLINE_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
}).passthrough();

export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const parsed = schema.parse(source);
  return {
    nodeEnv: parsed.NODE_ENV, host: parsed.HOST, port: parsed.PORT, databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET, passwordPepper: parsed.PASSWORD_PEPPER, deviceTokenPepper: parsed.DEVICE_TOKEN_PEPPER,
    cookieSecure: parsed.COOKIE_SECURE === undefined ? undefined : parsed.COOKIE_SECURE === "true",
    monitorWsPath: parsed.MONITOR_WS_PATH.replace(/\/$/, "") || "/ws",
    monitorOfflineTimeoutSeconds: parsed.MONITOR_OFFLINE_TIMEOUT_SECONDS,
  };
}
