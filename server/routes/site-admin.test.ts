import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { AssetReferenceError } from "../services/site-admin/postgres-repository.js";
import { createSiteAdminRouter } from "./site-admin.js";

function auth(user?: AuthenticatedUser): RequestHandler {
  return (request, _response, next) => { request.authUser = user; next(); };
}

async function request(method: string, path: string, options: { user?: AuthenticatedUser; body?: unknown; origin?: string; trustProxy?: boolean; forwardedHost?: string; forwardedProto?: string; mutationError?: Error } = {}) {
  const calls: string[] = [];
  const service = {
    getSnapshot: async () => ({ pages: {}, researchItems: { items: [], updatedAt: "0" }, newsItems: { items: [], updatedAt: "0" }, teamMembers: { items: [], updatedAt: "0" }, facilityItems: { items: [], updatedAt: "0" }, contactItems: { items: {}, updatedAt: "0" } }),
    replacePage: async () => { calls.push("page"); return "1"; },
    replaceResearchItems: async () => { calls.push("research"); return "1"; },
    replaceNewsItems: async () => { calls.push("news"); if (options.mutationError) throw options.mutationError; return "1"; },
    replaceTeamMembers: async () => { calls.push("team"); return "1"; },
    replaceFacilityItems: async () => { calls.push("facility"); return "1"; },
    replaceContactItems: async () => { calls.push("contact"); return "1"; }
  };
  const app = express();
  app.use(express.json());
  app.use(createSiteAdminRouter({ authMiddleware: auth(options.user), service: service as never, trustProxy: options.trustProxy ?? false }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    const requestOrigin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${requestOrigin}${path}`, {
      method,
      headers: {
        ...(options.origin ? { origin: options.origin === "same-origin" ? requestOrigin : options.origin } : {}),
        ...(options.forwardedHost ? { "x-forwarded-host": options.forwardedHost } : {}),
        ...(options.forwardedProto ? { "x-forwarded-proto": options.forwardedProto } : {}),
        ...(options.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const text = await response.text();
    return { statusCode: response.status, body: text ? JSON.parse(text) : undefined, calls };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const user = (permissions: string[]): AuthenticatedUser => ({ id: "00000000-0000-4000-8000-000000000001", username: "alice", displayName: "Alice", baseTier: "normal", permissions });

test("snapshot requires login and allows either site administration permission", async () => {
  assert.equal((await request("GET", "/api/site-admin/snapshot")).statusCode, 401);
  assert.equal((await request("GET", "/api/site-admin/snapshot", { user: user([]) })).statusCode, 403);
  assert.equal((await request("GET", "/api/site-admin/snapshot", { user: user(["site.members.write"]) })).statusCode, 200);
});

test("content mutations require content permission and same origin", async () => {
  const body = { items: [], expectedUpdatedAt: "0" };
  assert.equal((await request("PUT", "/api/site-admin/news-items", { user: user(["site.members.write"]), body, origin: "https://admin.example.com" })).statusCode, 403);
  assert.equal((await request("PUT", "/api/site-admin/news-items", { user: user(["site.content.write"]), body })).statusCode, 403);
  assert.equal((await request("PUT", "/api/site-admin/news-items", { user: user(["site.content.write"]), body, origin: "https://evil.example" })).statusCode, 403);
  assert.equal((await request("PUT", "/api/site-admin/news-items", { user: user(["site.content.write"]), body, origin: "same-origin" })).statusCode, 200);
});

test("route factory passes explicit trusted proxy origin configuration", async () => {
  const body = { items: [], expectedUpdatedAt: "0" };
  const response = await request("PUT", "/api/site-admin/news-items", {
    user: user(["site.content.write"]), body, origin: "https://admin.example.com",
    trustProxy: true, forwardedHost: "admin.example.com", forwardedProto: "https"
  });
  assert.equal(response.statusCode, 200);
});

test("asset reference domain errors return 400", async () => {
  const response = await request("PUT", "/api/site-admin/news-items", {
    user: user(["site.content.write"]), body: { items: [], expectedUpdatedAt: "0" },
    origin: "same-origin", mutationError: new AssetReferenceError()
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Invalid asset reference" });
});

test("team mutations require members permission", async () => {
  const response = await request("PUT", "/api/site-admin/team-members", {
    user: user(["site.content.write"]), body: { items: [], expectedUpdatedAt: "0" }, origin: "http://admin.example.com"
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.calls, []);
});

test("invalid requests return 400 before the service runs", async () => {
  const response = await request("PUT", "/api/site-admin/pages/not-a-page", {
    user: user(["site.content.write"]), body: { content: {}, expectedUpdatedAt: "0" }, origin: "same-origin"
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.calls, []);
});

test("invalid contact entries return 400 before the service runs", async () => {
  const response = await request("PUT", "/api/site-admin/contact-items", {
    user: user(["site.content.write"]),
    body: { items: { primaryChannels: ["email"], socialLinks: [], extraCards: [] }, expectedUpdatedAt: "0" },
    origin: "same-origin"
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.calls, []);
});

test("invalid collection UUIDs and team groups return 400 before the service runs", async () => {
  const invalidUuid = await request("PUT", "/api/site-admin/research-items", {
    user: user(["site.content.write"]),
    body: { items: [{ id: "paper-1", image: { assetId: "nope", src: "/paper.jpg" } }], expectedUpdatedAt: "0" },
    origin: "same-origin"
  });
  assert.equal(invalidUuid.statusCode, 400);
  assert.deepEqual(invalidUuid.calls, []);

  const invalidGroup = await request("PUT", "/api/site-admin/team-members", {
    user: user(["site.members.write"]),
    body: { items: [{ slug: "alice", group: "visitor" }], expectedUpdatedAt: "0" },
    origin: "same-origin"
  });
  assert.equal(invalidGroup.statusCode, 400);
  assert.deepEqual(invalidGroup.calls, []);
});

test("duplicate collection IDs and team slugs return 400 before the service runs", async () => {
  const duplicateId = await request("PUT", "/api/site-admin/news-items", {
    user: user(["site.content.write"]),
    body: { items: [{ id: "news-1" }, { id: "news-1" }], expectedUpdatedAt: "0" },
    origin: "same-origin"
  });
  assert.equal(duplicateId.statusCode, 400);
  assert.deepEqual(duplicateId.calls, []);

  const duplicateSlug = await request("PUT", "/api/site-admin/team-members", {
    user: user(["site.members.write"]),
    body: { items: [{ slug: "alice", group: "phd" }, { slug: "alice", group: "alumni" }], expectedUpdatedAt: "0" },
    origin: "same-origin"
  });
  assert.equal(duplicateSlug.statusCode, 400);
  assert.deepEqual(duplicateSlug.calls, []);
});
