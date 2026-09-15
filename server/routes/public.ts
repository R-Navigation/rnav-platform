import { Router } from "express";
import type { PublicSiteService } from "../services/public-site/service.js";
import {
  createPublicImageService,
  PublicImageError,
} from "../services/public-site/images.js";

export function createPublicRouter({
  service,
}: {
  service: PublicSiteService;
}) {
  const router = Router();
  const image = createPublicImageService(() =>
    Promise.all([
      service.getHome(),
      service.getDirections(),
      service.getTeam(),
      service.getResearch(),
      service.getNews(),
      service.getFacilities(),
      service.getContact(),
    ]),
  );
  router.get("/api/public/image", async (request, response) => {
    try {
      const bytes = await image(request.query.src, request.query.w);
      response
        .set({
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        })
        .send(bytes);
    } catch (error) {
      const status = error instanceof PublicImageError ? error.status : 502;
      response.set("Cache-Control", "no-store");
      if (status === 503) response.set("Retry-After", "2");
      response.status(status).send("Public image unavailable");
    }
  });
  router.get("/api/public/team-members/:slug", async (request, response, next) => {
    try {
      const slug = String(request.params.slug ?? "").trim();
      if (!slug || slug.length > 200) { response.status(404).json({ error: "成员不存在" }); return; }
      const profile = await service.getTeamMemberProfile(slug);
      if (!profile) { response.status(404).json({ error: "成员不存在" }); return; }
      response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300").json(profile);
    } catch (error) {
      console.error("[public-site] GET /api/public/team-members/:slug failed", error);
      next(error);
    }
  });
  const routes = {
    bootstrap: service.getBootstrap,
    home: service.getHome,
    directions: service.getDirections,
    homepage: service.getHomepage,
    research: service.getResearch,
    news: service.getNews,
    team: service.getTeam,
    facilities: service.getFacilities,
    contact: service.getContact,
  };
  for (const [path, load] of Object.entries(routes)) {
    router.get(`/api/public/${path}`, async (_request, response, next) => {
      try {
        response.json(await load());
      } catch (error) {
        console.error(`[public-site] GET /api/public/${path} failed`, error);
        next(error);
      }
    });
  }
  return router;
}
