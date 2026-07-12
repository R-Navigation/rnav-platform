import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import {
  createAuthMiddleware,
  type AuthRepository,
  type SessionIdentity,
  type UserForLogin
} from "../middleware/auth.js";
import { createAuthRouter } from "./auth.js";
import { createConsoleRouter } from "./console.js";

const activePasswordHash = bcrypt.hashSync("correct horse battery staple", 4);

class MemoryAuthRepository implements AuthRepository {
  users = new Map<string, UserForLogin>();
  sessions = new Map<string, { userId: string; expiresAt: Date }>();
  permissions = new Map<string, string[]>();
  lastLoginAt = new Map<string, Date>();

  async findUserForLogin(username: string) {
    return this.users.get(username) ?? null;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    this.sessions.set(input.tokenHash, {
      userId: input.userId,
      expiresAt: input.expiresAt
    });
  }

  async updateLastLogin(userId: string, at: Date) {
    this.lastLoginAt.set(userId, at);
  }

  async findIdentityBySessionTokenHash(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= now) {
      return null;
    }

    const user = [...this.users.values()].find(
      (candidate) => candidate.id === session.userId
    );
    if (!user || user.status !== "active") {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      baseTier: user.baseTier,
      permissions: this.permissions.get(user.id) ?? []
    } satisfies SessionIdentity;
  }

  async revokeSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

function addUser(
  repository: MemoryAuthRepository,
  overrides: Partial<UserForLogin> = {}
) {
  const user: UserForLogin = {
    id: "00000000-0000-4000-8000-000000000001",
    username: "alice",
    displayName: "Alice",
    baseTier: "normal",
    status: "active",
    passwordHash: activePasswordHash,
    ...overrides
  };
  repository.users.set(user.username, user);
  return user;
}

type HarnessResponse = {
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
};

function createTestApp(repository: MemoryAuthRepository) {
  const app = express();
  const authMiddleware = createAuthMiddleware(repository);
  app.use(createAuthRouter({ repository, authMiddleware }));
  app.use(createConsoleRouter({ authMiddleware }));
  return app;
}

async function requestApp(
  repository: MemoryAuthRepository,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<HarnessResponse> {
  const app = createTestApp(repository);
  const requestHeaders = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  const request = {
    method: init.method ?? "GET",
    url: path,
    headers: requestHeaders,
    body: init.body,
    socket: {},
    connection: {}
  };
  const headerStore = new Map<string, string | string[]>();
  const chunks: Buffer[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    const response = {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: string | string[]) {
        headerStore.set(name.toLowerCase(), value);
        return this;
      },
      getHeader(name: string) {
        return headerStore.get(name.toLowerCase());
      },
      getHeaders() {
        return Object.fromEntries(headerStore);
      },
      removeHeader(name: string) {
        headerStore.delete(name.toLowerCase());
      },
      writeHead(statusCode: number) {
        this.statusCode = statusCode;
        this.headersSent = true;
        return this;
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        this.headersSent = true;
        resolve();
        return this;
      }
    };

    const appHandle = app as unknown as {
      handle(
        request: unknown,
        response: unknown,
        callback: (error?: unknown) => void
      ): void;
    };
    appHandle.handle(request, response, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  await completed;
  const body = Buffer.concat(chunks).toString("utf8");
  const headers = new Headers();
  for (const [name, value] of headerStore) {
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }
  return {
    status: (request as { res?: { statusCode: number } }).res?.statusCode ?? 200,
    headers,
    async json() {
      return JSON.parse(body);
    }
  };
}

function sessionCookie(token: string) {
  return `rnav_session=${token}`;
}

test("GET /api/console/bootstrap without a session returns 401", async () => {
  const repository = new MemoryAuthRepository();
  const response = await requestApp(repository, "/api/console/bootstrap");
  assert.equal(response.status, 401);
});

test("GET /api/console/bootstrap returns normal member modules", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository);
  repository.permissions.set(user.id, [
    "console.access",
    "lab_assets.read",
    "procurements.create",
    "procurements.read_own"
  ]);
  repository.sessions.set(createHash("sha256").update("normal-token").digest("hex"), {
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const response = await requestApp(repository, "/api/console/bootstrap", {
    headers: { cookie: sessionCookie("normal-token") }
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    user: { tier: string };
    consoleModules: Array<{ key: string }>;
  };
  assert.equal(body.user.tier, "normal");
  assert.deepEqual(
    body.consoleModules.map((module) => module.key),
    ["profile", "lab-assets", "procurements"]
  );
});

test("GET /api/console/bootstrap returns every module for a super user", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository, { baseTier: "super" });
  repository.sessions.set(createHash("sha256").update("super-token").digest("hex"), {
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const response = await requestApp(repository, "/api/console/bootstrap", {
    headers: { cookie: sessionCookie("super-token") }
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    user: { tier: string };
    permissions: string[];
    consoleModules: Array<{ key: string }>;
  };
  assert.equal(body.user.tier, "super");
  assert.equal(body.permissions.length > 0, true);
  assert.deepEqual(
    body.consoleModules.map((module) => module.key),
    [
      "profile",
      "lab-assets",
      "procurements",
      "monitor",
      "site",
      "media",
      "users",
      "permissions",
      "settings"
    ]
  );
});

test("POST /api/auth/login creates a hashed database session and secure cookie", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository);
  repository.permissions.set(user.id, ["console.access"]);

  const response = await requestApp(repository, "/api/auth/login", {
    method: "POST",
    body: {
      username: "alice",
      password: "correct horse battery staple"
    }
  });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie");
    assert.match(setCookie ?? "", /^rnav_session=[^;]+/);
    assert.match(setCookie ?? "", /HttpOnly/i);
    assert.match(setCookie ?? "", /SameSite=Lax/i);
    assert.equal(repository.sessions.size, 1);

    const rawToken = /^rnav_session=([^;]+)/.exec(setCookie ?? "")?.[1];
    assert.ok(rawToken);
    assert.equal(repository.sessions.has(rawToken), false);
    assert.equal(
      repository.sessions.has(createHash("sha256").update(rawToken).digest("hex")),
      true
    );
    assert.ok(repository.lastLoginAt.has(user.id));

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal("passwordHash" in body, false);
  assert.equal(JSON.stringify(body).includes(activePasswordHash), false);
  assert.deepEqual(body.permissions, ["console.access"]);
});

test("POST /api/auth/login hides whether credentials or status caused rejection", async () => {
  const repository = new MemoryAuthRepository();
  addUser(repository, { status: "disabled" });

  const attempts = [
    { username: "missing", password: "wrong" },
    { username: "alice", password: "wrong" },
    { username: "alice", password: "correct horse battery staple" }
  ];

  const results = [];
  for (const credentials of attempts) {
    const response = await requestApp(repository, "/api/auth/login", {
      method: "POST",
      body: credentials
    });
    results.push({ status: response.status, body: await response.json() });
  }

  assert.deepEqual(results, [
    { status: 401, body: { error: "Invalid username or password" } },
    { status: 401, body: { error: "Invalid username or password" } },
    { status: 401, body: { error: "Invalid username or password" } }
  ]);
  assert.equal(repository.sessions.size, 0);
});

test("GET /api/auth/session returns safe authenticated identity", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository);
  repository.permissions.set(user.id, ["console.access", "site.content.write"]);
  repository.sessions.set(createHash("sha256").update("session-token").digest("hex"), {
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const anonymous = await requestApp(repository, "/api/auth/session");
  assert.equal(anonymous.status, 401);

  const response = await requestApp(repository, "/api/auth/session", {
    headers: { cookie: sessionCookie("session-token") }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: {
      id: user.id,
      username: "alice",
      displayName: "Alice",
      tier: "plus"
    },
    permissions: ["console.access", "site.content.write"]
  });
});

test("GET /api/auth/session rejects an expired session", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository);
  repository.sessions.set(createHash("sha256").update("expired-token").digest("hex"), {
    userId: user.id,
    expiresAt: new Date(Date.now() - 1)
  });

  const response = await requestApp(repository, "/api/auth/session", {
    headers: { cookie: sessionCookie("expired-token") }
  });
  assert.equal(response.status, 401);
});

test("POST /api/auth/logout revokes the current session and clears the cookie", async () => {
  const repository = new MemoryAuthRepository();
  const user = addUser(repository);
  const tokenHash = createHash("sha256").update("logout-token").digest("hex");
  repository.sessions.set(tokenHash, {
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const response = await requestApp(repository, "/api/auth/logout", {
    method: "POST",
    headers: { cookie: sessionCookie("logout-token") }
  });
  assert.equal(response.status, 204);
  assert.equal(repository.sessions.has(tokenHash), false);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
});
