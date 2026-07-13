import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { MonitorAudience } from "./monitorService.js";

type Options = {
  publicPath?: string;
  consolePath?: string;
  authorizeConsole: (request: IncomingMessage) => Promise<boolean>;
};

function send(socket: WebSocket, type: string, payload: unknown) {
  socket.send(JSON.stringify({ type, emittedAt: new Date().toISOString(), payload }));
}

function rejectUpgrade(socket: Duplex, statusCode: number, statusText: string) {
  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function createMonitorWebSocketHub({
  publicPath = "/ws",
  consolePath = "/ws/console",
  authorizeConsole,
}: Options) {
  const server = new WebSocketServer({ noServer: true });
  const clients: Record<MonitorAudience, Set<WebSocket>> = { public: new Set(), console: new Set() };

  server.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const audience: MonitorAudience = pathname === consolePath ? "console" : "public";
    clients[audience].add(socket);
    send(socket, "connection.ready", { audience, subscribers: clients[audience].size });
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message?.type === "ping") send(socket, "pong", {});
      } catch {
        // Invalid client frames are ignored; server messages remain JSON-only.
      }
    });
    socket.on("close", () => clients[audience].delete(socket));
  });

  return {
    async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname !== publicPath && pathname !== consolePath) return false;
      if (pathname === consolePath && !(await authorizeConsole(request))) {
        rejectUpgrade(socket, 401, "Unauthorized");
        return true;
      }
      server.handleUpgrade(request, socket, head, (websocket) => server.emit("connection", websocket, request));
      return true;
    },

    broadcast(type: string, payload: unknown, audience: MonitorAudience) {
      for (const socket of clients[audience]) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        try { send(socket, type, payload); } catch { socket.terminate(); }
      }
    },

    async close() {
      for (const audience of Object.values(clients)) for (const socket of audience) socket.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
