import assert from "node:assert/strict";
import test from "node:test";
import { fetchProviderJson, ProviderHttpError } from "./http.js";

test("provider HTTP retries 429 with bounded backoff", async () => {
  let calls = 0;
  const result = await fetchProviderJson("Provider", new URL("https://example.test"), { retries: 1, fetchImpl: async () => ++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : Response.json({ ok: true }) });
  assert.deepEqual(result, { ok: true }); assert.equal(calls, 2);
});
test("provider HTTP does not retry ordinary 4xx responses", async () => {
  let calls = 0;
  await assert.rejects(() => fetchProviderJson("Provider", new URL("https://example.test"), { retries: 2, fetchImpl: async () => { calls += 1; return new Response("", { status: 404 }); } }), (error: unknown) => error instanceof ProviderHttpError && error.status === 404);
  assert.equal(calls, 1);
});

test("provider HTTP aborts a timed out request", async () => {
  await assert.rejects(() => fetchProviderJson("Provider", new URL("https://example.test"), { retries: 0, timeoutMs: 1, fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) }));
});
