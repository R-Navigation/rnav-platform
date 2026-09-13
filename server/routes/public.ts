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
  const routes = {
    bootstrap: service.getBootstrap,
    home: service.getHome,
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
