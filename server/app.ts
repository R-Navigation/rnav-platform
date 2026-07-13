import express, { type Request, type Response, type Router } from "express";

type NextHandler = (request: Request, response: Response) => unknown;

type Options = {
  routers: Router[];
  health: { database(): Promise<boolean> };
  nextHandler?: NextHandler;
};

export function createApp({ routers, health, nextHandler }: Options) {
  const app = express(); app.disable("x-powered-by"); app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", async (_request, response) => { try { response.json({ status: "ok", database: await health.database() ? "ok" : "error", timestamp: new Date().toISOString() }); } catch { response.status(503).json({ status: "error", database: "error", timestamp: new Date().toISOString() }); } });
  for (const router of routers) app.use(router);
  if (nextHandler) app.use((request, response) => nextHandler(request, response));
  else app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  app.use(((error, _request, response, _next) => { console.error(error); if (!response.headersSent) response.status(500).json({ error: "Internal server error" }); }) as express.ErrorRequestHandler);
  return app;
}
