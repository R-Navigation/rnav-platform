import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAlexStatusMonitor } from "./openAlexStatus.js";

test("OpenAlex status reports missing keys without making a provider request", async () => {
  const monitor = createOpenAlexStatusMonitor(false); let calls = 0;
  const status = await monitor.check({ checkRateLimit: async () => { calls += 1; return {}; } } as never);
  assert.equal(status.health, "key_missing"); assert.equal(calls, 0);
});

test("OpenAlex status caches successful observations for sixty seconds", async () => {
  const monitor = createOpenAlexStatusMonitor(true); let calls = 0;
  const client = { checkRateLimit: async () => { calls += 1; monitor.observe({ health: "healthy", checkedAt: new Date().toISOString(), httpStatus: 200, rateLimit: { limit: 10000, remaining: 9000, creditsUsed: 0, resetSeconds: 30, resetAt: new Date(Date.now() + 30_000).toISOString() }, message: "OpenAlex 连接正常" }); return {}; } };
  await monitor.check(client as never); await monitor.check(client as never);
  assert.equal(calls, 1); assert.equal(monitor.getStatus().health, "healthy"); assert.ok(monitor.getStatus().lastSuccessAt);
});
