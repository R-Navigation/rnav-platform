import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "./app.js";

test("unified app exposes health and mounts feature routers before Next fallback", async () => {
  const nextRequests: string[] = [];
  const argumentCounts: number[] = [];
  const app = createApp({ health: { database: async () => true }, routers: [], nextHandler: function (request, response) { argumentCounts.push(arguments.length); nextRequests.push(request.url); response.status(418).end(); } });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); listener.once("error", reject); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${base}/api/health`); assert.equal(health.status, 200); assert.equal(((await health.json()) as { database: string }).database, "ok");
    assert.equal((await fetch(`${base}/some-page`)).status, 418); assert.deepEqual(nextRequests, ["/some-page"]); assert.deepEqual(argumentCounts, [2]);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
