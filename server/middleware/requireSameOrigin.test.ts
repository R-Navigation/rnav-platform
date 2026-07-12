import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireSameOrigin } from "./requireSameOrigin.js";

function run(headers: Record<string, string | undefined>, trustProxy = false, encrypted = false) {
  const request = { headers, socket: { encrypted } } as unknown as Request;
  let status = 200;
  let body: unknown;
  let nextCalled = false;
  const response = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; }
  } as unknown as Response;
  const next = (() => { nextCalled = true; }) as NextFunction;
  createRequireSameOrigin({ trustProxy })(request, response, next);
  return { status, body, nextCalled };
}

test("trusted proxy accepts normalized case and default HTTPS ports", () => {
  assert.deepEqual(run({
    origin: "HTTPS://ADMIN.EXAMPLE.COM:443",
    host: "ignored.example.com",
    "x-forwarded-host": "admin.example.com",
    "x-forwarded-proto": "https"
  }, true), { status: 200, body: undefined, nextCalled: true });
});

test("same-origin accepts an explicit matching non-default port", () => {
  assert.equal(run({ origin: "http://localhost:3000", host: "LOCALHOST:3000" }).nextCalled, true);
});

test("same-origin rejects missing origins", () => {
  assert.deepEqual(run({ host: "admin.example.com" }), {
    status: 403,
    body: { error: "Origin denied" },
    nextCalled: false
  });
});

test("same-origin rejects a spoofed Origin even when Host is present", () => {
  assert.equal(run({ origin: "https://evil.example", host: "admin.example.com" }).status, 403);
});

test("direct mode ignores forwarded headers", () => {
  assert.equal(run({
    origin: "http://internal:8080",
    host: "internal:8080",
    "x-forwarded-host": "admin.example.com",
    "x-forwarded-proto": "https"
  }).nextCalled, true);
});

test("trusted proxy rejects comma-separated forwarded values", () => {
  assert.equal(run({
    origin: "https://admin.example.com",
    host: "internal:8080",
    "x-forwarded-host": "admin.example.com, evil.example",
    "x-forwarded-proto": "https, http"
  }, true).status, 403);
});

test("same-origin rejects malformed forwarded host spoofing", () => {
  assert.equal(run({
    origin: "https://admin.example.com",
    host: "internal:8080",
    "x-forwarded-host": "admin.example.com@evil.example",
    "x-forwarded-proto": "https"
  }, true).status, 403);
});

test("trusted proxy requires exactly one valid forwarded host and protocol", () => {
  assert.equal(run({ origin: "https://admin.example.com", host: "internal:8080", "x-forwarded-host": "admin.example.com" }, true).status, 403);
  assert.equal(run({ origin: "https://admin.example.com", host: "internal:8080", "x-forwarded-host": "admin.example.com", "x-forwarded-proto": "ftp" }, true).status, 403);
  assert.equal(run({ origin: "https://admin.example.com", host: "internal:8080", "x-forwarded-host": "admin.example.com", "x-forwarded-proto": "https" }, true).nextCalled, true);
});
