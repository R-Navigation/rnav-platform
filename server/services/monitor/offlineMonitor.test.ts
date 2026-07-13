import assert from "node:assert/strict";
import test from "node:test";
import { startOfflineMonitor } from "./offlineMonitor.js";

test("offline monitor runs immediately, repeats, and can be stopped", async () => {
  let count = 0;
  let callback: (() => void) | undefined;
  let cleared: unknown;
  const stop = startOfflineMonitor({
    service: { markOfflineDevices: async (seconds) => { assert.equal(seconds, 30); count += 1; return { count: 0 }; } },
    offlineTimeoutSeconds: 30,
    intervalMs: 5_000,
    setIntervalFn: (handler: () => void) => { callback = handler; return "timer" as never; },
    clearIntervalFn: (timer) => { cleared = timer; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(count, 1);
  callback?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(count, 2);
  stop();
  assert.equal(cleared, "timer");
});
