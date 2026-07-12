import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import {
  normalizeAuthenticatedUser,
  type AuthenticatedUser
} from "./auth.js";
import { requirePermission } from "./requirePermission.js";

function runMiddleware(authUser?: AuthenticatedUser) {
  const request = { authUser } as Request;
  let status = 200;
  let body: unknown;
  let nextCalled = false;
  const response = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    }
  } as unknown as Response;
  const next = (() => {
    nextCalled = true;
  }) as NextFunction;

  requirePermission("console.access")(request, response, next);
  return { status, body, nextCalled };
}

function authenticatedUser(
  overrides: Partial<AuthenticatedUser> = {}
): AuthenticatedUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "alice",
    displayName: "Alice",
    baseTier: "normal",
    permissions: [],
    ...overrides
  };
}

test("requirePermission returns 401 for anonymous requests", () => {
  assert.deepEqual(runMiddleware(), {
    status: 401,
    body: { error: "Authentication required" },
    nextCalled: false
  });
});

test("requirePermission returns 403 when permission is missing", () => {
  assert.deepEqual(runMiddleware(authenticatedUser()), {
    status: 403,
    body: { error: "Permission denied" },
    nextCalled: false
  });
});

test("requirePermission continues when permission is granted", () => {
  assert.deepEqual(
    runMiddleware(authenticatedUser({ permissions: ["console.access"] })),
    { status: 200, body: undefined, nextCalled: true }
  );
});

test("requirePermission continues for super users with no stored grants", () => {
  assert.deepEqual(
    runMiddleware(
      normalizeAuthenticatedUser({
        id: "00000000-0000-4000-8000-000000000001",
        username: "alice",
        displayName: "Alice",
        baseTier: "super",
        permissions: []
      })
    ),
    { status: 200, body: undefined, nextCalled: true }
  );
});
