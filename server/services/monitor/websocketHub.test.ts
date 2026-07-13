import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import WebSocket from "ws";
import { createMonitorWebSocketHub } from "./websocketHub.js";

function nextMessage(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
    socket.once("error", reject);
  });
}

test("websocket hub separates public and authorized console audiences", async () => {
  const hub = createMonitorWebSocketHub({ authorizeConsole: async (request) => request.headers.cookie === "session=valid" });
  const server = createServer();
  server.on("upgrade", (request, socket, head) => {
    void hub.handleUpgrade(request, socket, head).then((handled) => { if (!handled) socket.destroy(); });
  });
  await new Promise<void>((resolve, reject) => { server.listen(0, "127.0.0.1", resolve); server.once("error", reject); });
  const base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const publicSocket = new WebSocket(`${base}/ws`);
  const consoleSocket = new WebSocket(`${base}/ws/console`, { headers: { cookie: "session=valid" } });
  try {
    await Promise.all([nextMessage(publicSocket), nextMessage(consoleSocket)]);
    hub.broadcast("public-update", { code: "DOG-1" }, "public");
    assert.equal((await nextMessage(publicSocket)).type, "public-update");
    hub.broadcast("private-update", { id: "device-1" }, "console");
    assert.equal((await nextMessage(consoleSocket)).type, "private-update");

    const unauthorized = new WebSocket(`${base}/ws/console`);
    const status = await new Promise<number | undefined>((resolve) => {
      unauthorized.once("unexpected-response", (_request, response) => resolve(response.statusCode));
      unauthorized.once("error", () => resolve(undefined));
    });
    assert.equal(status, 401);
  } finally {
    publicSocket.close();
    consoleSocket.close();
    await hub.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
