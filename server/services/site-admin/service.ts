import type { ContactItems, PageKey, SiteRecord } from "./schemas.js";

export interface SiteAdminRepository {
  getSnapshot(): Promise<SiteAdminSnapshot>;
  replacePage(pageKey: PageKey, content: unknown, expectedRevision: string, actorId: string): Promise<string>;
  replaceResearchItems(items: SiteRecord[], expectedRevision: string, actorId: string): Promise<string>;
  replaceNewsItems(items: SiteRecord[], expectedRevision: string, actorId: string): Promise<string>;
  replaceTeamMembers(items: SiteRecord[], expectedRevision: string, actorId: string): Promise<string>;
  replaceFacilityItems(items: SiteRecord[], expectedRevision: string, actorId: string): Promise<string>;
  replaceContactItems(items: ContactItems, expectedRevision: string, actorId: string): Promise<string>;
}

export type SiteAdminSnapshot = {
  pages: Record<string, { content: unknown; updatedAt: string }>;
  researchItems: { items: SiteRecord[]; updatedAt: string };
  newsItems: { items: SiteRecord[]; updatedAt: string };
  teamMembers: { items: SiteRecord[]; updatedAt: string };
  facilityItems: { items: SiteRecord[]; updatedAt: string };
  contactItems: { items: ContactItems; updatedAt: string };
};

export function createSiteAdminService(repository: SiteAdminRepository) {
  return {
    getSnapshot: () => repository.getSnapshot(),
    replacePage: (...args: Parameters<SiteAdminRepository["replacePage"]>) => repository.replacePage(...args),
    replaceResearchItems: (...args: Parameters<SiteAdminRepository["replaceResearchItems"]>) => repository.replaceResearchItems(...args),
    replaceNewsItems: (...args: Parameters<SiteAdminRepository["replaceNewsItems"]>) => repository.replaceNewsItems(...args),
    replaceTeamMembers: (...args: Parameters<SiteAdminRepository["replaceTeamMembers"]>) => repository.replaceTeamMembers(...args),
    replaceFacilityItems: (...args: Parameters<SiteAdminRepository["replaceFacilityItems"]>) => repository.replaceFacilityItems(...args),
    replaceContactItems: (...args: Parameters<SiteAdminRepository["replaceContactItems"]>) => repository.replaceContactItems(...args)
  };
}

export type SiteAdminService = ReturnType<typeof createSiteAdminService>;
