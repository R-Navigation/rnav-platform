import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.js";
import { UserAdminError } from "../services/user-admin/userAdminService.js";
import { createUsersRouter } from "./users.js";

const targetId = "00000000-0000-4000-8000-000000000002";
const identity = (
  baseTier: "normal" | "super",
  permissions: string[] = ["users.write"],
): AuthenticatedUser => ({
  id: "00000000-0000-4000-8000-000000000001",
  username: "admin",
  displayName: "Admin",
  baseTier,
  permissions,
});
const auth = (user?: AuthenticatedUser): RequestHandler =>
  (request, _response, next) => {
    request.authUser = user;
    next();
  };

async function request(
  method: string,
  path: string,
  options: {
    user?: AuthenticatedUser;
    origin?: boolean;
    service?: Record<string, (...args: any[]) => Promise<unknown>>;
  } = {},
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const defaults = {
    async getDeletionCheck() {
      return {
        deletable: true,
        target: { id: targetId, username: "test-user", displayName: "Test User" },
        dependencies: [],
      };
    },
    async deleteUser() {
      return { deleted: true, id: targetId };
    },
  };
  const implementations = { ...defaults, ...(options.service ?? {}) };
  const service = new Proxy(implementations, {
    get(target, property) {
      const implementation = target[property as keyof typeof target];
      if (implementation)
        return async (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return (implementation as (...values: unknown[]) => Promise<unknown>)(
            ...args,
          );
        };
      return async () => ({ users: [] });
    },
  });
  const app = express();
  app.use(express.json());
  app.use(
    createUsersRouter({
      authMiddleware: auth(options.user),
      service: service as never,
      trustProxy: false,
    }),
  );
  const server = await new Promise<ReturnType<typeof app.listen>>(
    (resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      listener.once("error", reject);
    },
  );
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: options.origin ? { origin: base } : undefined,
    });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("deletion precheck requires users.write and passes the actor to the service", async () => {
  assert.equal(
    (await request("GET", `/api/users/${targetId}/deletion-check`, {
      user: identity("super", []),
    })).status,
    403,
  );
  const allowed = await request("GET", `/api/users/${targetId}/deletion-check`, {
    user: identity("super"),
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.calls[0].method, "getDeletionCheck");
  assert.deepEqual(allowed.calls[0].args[1], {
    id: "00000000-0000-4000-8000-000000000001",
    baseTier: "super",
  });
});

test("a normal admin with users.write is still rejected by the service guard", async () => {
  const response = await request("GET", `/api/users/${targetId}/deletion-check`, {
    user: identity("normal"),
    service: {
      async getDeletionCheck(_id: unknown, actor: any) {
        if (actor.baseTier !== "super")
          throw new UserAdminError("Super required", "SUPER_REQUIRED", 403);
        return {};
      },
    },
  });
  assert.equal(response.status, 403);
  assert.equal((response.body as { code: string }).code, "SUPER_REQUIRED");

  const deletion = await request("DELETE", `/api/users/${targetId}`, {
    user: identity("normal"),
    origin: true,
    service: {
      async deleteUser(_id: unknown, actor: any) {
        if (actor.baseTier !== "super")
          throw new UserAdminError("Super required", "SUPER_REQUIRED", 403);
        return {};
      },
    },
  });
  assert.equal(deletion.status, 403);
  assert.equal((deletion.body as { code: string }).code, "SUPER_REQUIRED");
});

test("permanent deletion requires same-origin and returns the service result", async () => {
  const denied = await request("DELETE", `/api/users/${targetId}`, {
    user: identity("super"),
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.calls, []);

  const allowed = await request("DELETE", `/api/users/${targetId}`, {
    user: identity("super"),
    origin: true,
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { deleted: true, id: targetId });
  assert.equal(allowed.calls[0].method, "deleteUser");
});

test("missing users and dependency conflicts preserve their API status codes", async () => {
  const missing = await request("DELETE", `/api/users/${targetId}`, {
    user: identity("super"),
    origin: true,
    service: {
      async deleteUser() {
        throw new UserAdminError("User not found", "NOT_FOUND", 404);
      },
    },
  });
  assert.equal(missing.status, 404);
  assert.equal((missing.body as { code: string }).code, "NOT_FOUND");

  const blocked = await request("DELETE", `/api/users/${targetId}`, {
    user: identity("super"),
    origin: true,
    service: {
      async deleteUser() {
        throw new UserAdminError(
          "User has dependencies",
          "USER_HAS_DEPENDENCIES",
          409,
        );
      },
    },
  });
  assert.equal(blocked.status, 409);
  assert.equal(
    (blocked.body as { code: string }).code,
    "USER_HAS_DEPENDENCIES",
  );
});
