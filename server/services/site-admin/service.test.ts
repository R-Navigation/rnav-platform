import assert from "node:assert/strict";
import test from "node:test";
import { createSiteAdminService, type SiteAdminRepository } from "./service.js";

test("snapshot has exactly the frontend administration shape", async () => {
  const repository: SiteAdminRepository = {
    getSnapshot: async () => ({
      pages: { home: { content: { hero: {} }, updatedAt: "2" } },
      researchItems: { items: [], updatedAt: "3" },
      newsItems: { items: [], updatedAt: "4" },
      facilityItems: { items: [], updatedAt: "6" },
      contactItems: { items: { primaryChannels: [], socialLinks: [], extraCards: [] }, updatedAt: "7" }
    }),
    replacePage: async () => "0",
    replaceResearchItems: async () => "0",
    replaceNewsItems: async () => "0",
    replaceFacilityItems: async () => "0",
    replaceContactItems: async () => "0"
  };
  const service = createSiteAdminService(repository);
  const snapshot = await service.getSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), ["contactItems", "facilityItems", "newsItems", "pages", "researchItems"]);
  assert.deepEqual(snapshot.pages.home, { content: { hero: {} }, updatedAt: "2" });
  assert.deepEqual(snapshot.contactItems.items, { primaryChannels: [], socialLinks: [], extraCards: [] });
});
