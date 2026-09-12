import { Router } from "express";
import type { PublicSiteService } from "../services/public-site/service.js";

export function createPublicRouter({
  service,
}: {
  service: PublicSiteService;
}) {
  const router = Router();
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
