import assert from "node:assert/strict";
import test from "node:test";
import { consoleApi, ConsoleApiError } from "./consoleApi.ts";

test("console API surfaces string validation issues", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: "Password does not meet policy",
    issues: ["至少 8 个字符"],
  }), { status: 400, headers: { "content-type": "application/json" } });

  try {
    await assert.rejects(consoleApi("/api/auth/change-password"), (error: unknown) => {
      assert.ok(error instanceof ConsoleApiError);
      assert.equal(error.message, "至少 8 个字符");
      assert.equal(error.status, 400);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("console API surfaces structured validation issues", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    issues: [{ message: "两次输入的新密码不一致" }],
  }), { status: 400, headers: { "content-type": "application/json" } });

  try {
    await assert.rejects(consoleApi("/api/auth/change-password"), {
      message: "两次输入的新密码不一致",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("console API maps profile validation paths to readable field names", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    issues: [{ path: ["personalLinks", 0, "url"], message: "Invalid url" }],
  }), { status: 400, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(consoleApi("/api/profile"), { message: "个人链接：Invalid url" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("console API lets the browser set multipart boundaries for FormData", async () => {
  const originalFetch = globalThis.fetch;
  let headers: HeadersInit | undefined;
  globalThis.fetch = async (_input, init) => {
    headers = init?.headers;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const form = new FormData();
    form.append("file", new Blob(["image"], { type: "image/png" }), "avatar.png");
    await consoleApi("/api/media/upload", { method: "POST", body: form });
    assert.equal(new Headers(headers).has("content-type"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
