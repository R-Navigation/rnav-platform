import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { createConsoleRouter } from "./console.js";

const member: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "alice",
  displayName: "张三",
  baseTier: "normal",
  permissions: ["console.access"],
};

async function requestDashboard(authUser?: AuthenticatedUser) {
  const authMiddleware: RequestHandler = (request, _response, next) => {
    request.authUser = authUser;
    next();
  };
  const app = express();
  app.use(createConsoleRouter({
    authMiddleware,
    dashboardService: {
      async getDashboard(user) {
        return {
          user: { id: user.id, displayName: user.displayName, tier: "normal", roleLabels: ["普通成员"] },
        tasks: { procurementReviews: 0, procurementPurchases: 0, labUsageReviews: 0, incompleteProfiles: 0, staleProfiles: 0 },
          mine: { procurementOpen: 1, labUsageOpen: 0, assetsInUse: 0 },
          recentItems: [],
        };
      },
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    return await fetch(`http://127.0.0.1:${address.port}/api/console/dashboard`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("GET /api/console/dashboard requires an authenticated account", async () => {
  assert.equal((await requestDashboard()).status, 401);
});

test("GET /api/console/dashboard returns the role-aware aggregate", async () => {
  const response = await requestDashboard(member);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { mine: { procurementOpen: number } }).mine.procurementOpen, 1);
});

test("GET /api/console/dashboard respects the forced password change gate", async () => {
  assert.equal((await requestDashboard({ ...member, mustChangePassword: true })).status, 403);
});
