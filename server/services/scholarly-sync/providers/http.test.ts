import assert from "node:assert/strict";
import test from "node:test";
import { fetchProviderJson, parseProviderRateLimit, ProviderHttpError, type ProviderObservation } from "./http.js";

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
  let observation: ProviderObservation | undefined;
  await assert.rejects(() => fetchProviderJson("OpenAlex", new URL("https://example.test"), { retries: 0, timeoutMs: 1, onObservation: (value) => { observation = value; }, fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))) }), (error: unknown) => error instanceof ProviderHttpError && error.code === "OPENALEX_TIMEOUT");
  assert.equal(observation?.health, "timeout");
});

test("provider HTTP classifies OpenAlex budget, rate, auth, and server failures", async () => {
  const cases = [
    { status: 429, remaining: "0", health: "budget_exhausted", code: "OPENALEX_BUDGET_EXHAUSTED" },
    { status: 429, remaining: "3", health: "rate_limited", code: "OPENALEX_RATE_LIMITED" },
    { status: 401, remaining: "3", health: "auth_error", code: "OPENALEX_AUTH_ERROR" },
    { status: 500, remaining: "3", health: "provider_error", code: "OPENALEX_PROVIDER_ERROR" },
  ] as const;
  for (const item of cases) {
    let observation: ProviderObservation | undefined;
    await assert.rejects(() => fetchProviderJson("OpenAlex", new URL("https://example.test"), { retries: 0, onObservation: (value) => { observation = value; }, fetchImpl: async () => new Response("{}", { status: item.status, headers: { "x-ratelimit-limit": "10000", "x-ratelimit-remaining": item.remaining, "x-ratelimit-credits-used": "1", "x-ratelimit-reset": "60" } }) }), (error: unknown) => error instanceof ProviderHttpError && error.code === item.code);
    assert.equal(observation?.health, item.health); assert.equal(observation?.rateLimit.remaining, Number(item.remaining));
  }
});

test("rate limit headers are parsed as credits with an absolute reset time", () => {
  const value = parseProviderRateLimit(new Headers({ "x-ratelimit-limit": "10000", "x-ratelimit-remaining": "9642", "x-ratelimit-credits-used": "10", "x-ratelimit-reset": "3600" }), new Date("2026-09-15T00:00:00.000Z"));
  assert.deepEqual(value, { limit: 10000, remaining: 9642, creditsUsed: 10, resetSeconds: 3600, resetAt: "2026-09-15T01:00:00.000Z" });
});
