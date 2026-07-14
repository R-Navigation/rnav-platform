import assert from "node:assert/strict";
import test from "node:test";
import { loadEnv } from "./env.js";

const valid = { DATABASE_URL: "postgres://rnav:rnav@127.0.0.1/rnav", SESSION_SECRET: "s".repeat(32), PASSWORD_PEPPER: "p".repeat(32), DEVICE_TOKEN_PEPPER: "d".repeat(32) };

test("server environment applies safe local defaults", () => {
  const env = loadEnv(valid);
  assert.equal(env.host, "127.0.0.1"); assert.equal(env.port, 4090); assert.equal(env.monitorWsPath, "/ws"); assert.equal(env.monitorOfflineTimeoutSeconds, 60);
});

test("server environment rejects missing secrets and invalid ranges", () => {
  assert.throws(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL }), /SESSION_SECRET/);
  assert.throws(() => loadEnv({ ...valid, PORT: "70000" }), /PORT/);
  assert.throws(() => loadEnv({ ...valid, MONITOR_WS_PATH: "ws" }), /MONITOR_WS_PATH/);
});

test("server environment treats an empty optional COS URL as unset", () => {
  const env = loadEnv({ ...valid, COS_PUBLIC_BASE_URL: "" });
  assert.equal(env.cosPublicBaseUrl, undefined);
});
