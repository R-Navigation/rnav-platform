import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import type { NotificationService } from "../services/notifications/notificationService.js";

export function createNotificationsRouter({ authMiddleware, service, trustProxy }: { authMiddleware: RequestHandler; service: NotificationService; trustProxy: boolean }) {
  const router = Router(); const same = createRequireSameOrigin({ trustProxy });
  router.use("/api/notifications", authMiddleware, requireLogin, requirePasswordChanged);
  router.get("/api/notifications", async (req, res, next) => { try { res.json(await service.list(req.authUser!.id)); } catch (error) { next(error); } });
  router.post("/api/notifications/read-all", same, async (req, res, next) => { try { await service.markAllRead(req.authUser!.id); res.status(204).end(); } catch (error) { next(error); } });
  router.post("/api/notifications/:id/read", same, async (req, res, next) => { try { await service.markRead(req.authUser!.id, z.string().uuid().parse(req.params.id)); res.status(204).end(); } catch (error) { if (error instanceof ZodError) res.status(400).json({ error: "Invalid notification id" }); else next(error); } });
  return router;
}

