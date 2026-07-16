import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createMediaRouter } from "./media.js";

function auth(user?: AuthenticatedUser): RequestHandler {
  return (request, _response, next) => { request.authUser = user; next(); };
}

const user = (permissions: string[]): AuthenticatedUser => ({
  id: "00000000-0000-4000-8000-000000000001",
  username: "alice",
  displayName: "Alice",
  baseTier: "normal",
  permissions,
});

async function upload(permissions: string[], mimeType: string, filename: string) {
  const calls: Array<{ filename: string; mimeType: string }> = [];
  const service = {
    async upload(input: { filename: string; mimeType: string }) {
      calls.push({ filename: input.filename, mimeType: input.mimeType });
      return { id: "asset-1", url: "https://cdn.example.com/asset-1" };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createMediaRouter({
    authMiddleware: auth(user(permissions)),
    service: service as never,
    trustProxy: false,
    maxBytes: 1024,
    publicBaseUrl: "https://cdn.example.com",
    pathPrefix: "media",
  }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  try {
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    const form = new FormData();
    form.append("file", new Blob(["content"], { type: mimeType }), filename);
    const response = await fetch(`${origin}/api/media/upload`, { method: "POST", headers: { origin }, body: form });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("profile editors can upload multipart images without media administration", async () => {
  const response = await upload(["profile.write_own"], "image/png", "avatar.png");
  assert.equal(response.status, 201);
  assert.deepEqual(response.calls, [{ filename: "avatar.png", mimeType: "image/png" }]);
});

test("profile-only uploads reject documents while media administrators may upload them", async () => {
  assert.equal((await upload(["profile.write_own"], "application/pdf", "paper.pdf")).status, 400);
  assert.equal((await upload(["site.media.write"], "application/pdf", "paper.pdf")).status, 201);
  assert.equal((await upload([], "image/png", "avatar.png")).status, 403);
});
