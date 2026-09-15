import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createPublicRouter } from "./public.js";
import type { PublicSiteService } from "../services/public-site/service.js";

const methods = {
  bootstrap: "getBootstrap",
  home: "getHome",
  directions: "getDirections",
  homepage: "getHomepage",
  research: "getResearch",
  news: "getNews",
  team: "getTeam",
  facilities: "getFacilities",
  contact: "getContact",
} as const;

async function request(path: string, service: PublicSiteService) {
  const app = express();
  app.use(createPublicRouter({ service }));
  const chunks: Buffer[] = [];
  let statusCode = 200;
  await new Promise<void>((resolve, reject) => {
    const response = {
      get statusCode() { return statusCode; },
      set statusCode(code: number) { statusCode = code; },
      setHeader() {
        return this;
      },
      getHeader() {
        return undefined;
      },
      removeHeader() {},
      writeHead(code: number) {
        statusCode = code;
        return this;
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk) chunks.push(Buffer.from(chunk));
        resolve();
      },
    };
    (
      app as unknown as {
        handle(
          req: unknown,
          res: unknown,
          next: (error?: unknown) => void,
        ): void;
      }
    ).handle(
      { method: "GET", url: path, headers: {}, socket: {} },
      response,
      (error?: unknown) => (error ? reject(error) : resolve()),
    );
  });
  return {
    statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
  };
}

for (const [route, method] of Object.entries(methods)) {
  test(`GET /api/public/${route} returns the ${route} payload`, async () => {
    const service = Object.fromEntries(
      Object.values(methods).map((name) => [
        name,
        async () => ({ source: name }),
      ]),
    ) as unknown as PublicSiteService;
    const response = await request(`/api/public/${route}`, service);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { source: method });
  });
}

test("GET /api/public/team-members/:slug returns a profile and hides unknown members", async () => {
  const found = await request("/api/public/team-members/alice", { getTeamMemberProfile: async (slug: string) => ({ member: { slug }, publications: [] }) } as unknown as PublicSiteService);
  assert.equal(found.statusCode, 200);
  assert.deepEqual(found.body, { member: { slug: "alice" }, publications: [] });
  const missing = await request("/api/public/team-members/private", { getTeamMemberProfile: async () => null } as unknown as PublicSiteService);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { error: "成员不存在" });
});
