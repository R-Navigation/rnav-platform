import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicSiteService,
  type PublicSiteRepository
} from "./service.js";

class MemoryPublicSiteRepository implements PublicSiteRepository {
  pages = new Map<string, unknown>();
  research: Record<string, unknown>[] = [];
  news: Record<string, unknown>[] = [];
  team: Record<string, unknown>[] = [];
  facilities: Record<string, unknown>[] = [];
  contacts = { primaryChannels: [], socialLinks: [], extraCards: [] };

  async getPageContent(key: string) {
    return this.pages.get(key) ?? null;
  }
  async getResearchItems() { return this.research; }
  async getNewsItems() { return this.news; }
  async getTeamMembers() { return this.team; }
  async getFacilityItems() { return this.facilities; }
  async getContactItems() { return this.contacts; }
}

test("bootstrap supplies bilingual defaults and the required public navigation", async () => {
  const service = createPublicSiteService(new MemoryPublicSiteRepository());
  const bootstrap = await service.getBootstrap();

  assert.equal(bootstrap.brand.name.zh, "R-Nav 研究组");
  assert.deepEqual(
    bootstrap.navigation.map((item) => item.href),
    ["/", "/research", "/team", "/facilities", "/news", "/monitor", "/contact"]
  );
  assert.equal(bootstrap.navigation[1].label.en, "Research");
});

test("research merges stored page content with normalized repository items", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("research_page", {
    header: { title: { zh: "成果", en: "Work" } }
  });
  repository.research = [{
    id: "paper-1",
    title: { en: "A Paper" },
    authors: [{ name: "Ada", highlight: true }]
  }];

  const research = await createPublicSiteService(repository).getResearch();
  assert.deepEqual(research.header.title, { zh: "成果", en: "Work" });
  assert.deepEqual(research.publications[0].title, { zh: "", en: "A Paper" });
  assert.deepEqual(research.publications[0].authors[0].name, { zh: "", en: "Ada" });
});

test("team groups members and derives a stable fallback slug", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.team = [
    { group: "phd", name: { zh: "张三", en: "Zhang San" }, enrollmentYear: "2024" },
    { group: "advisor", name: { zh: "李老师", en: "Professor Li" } }
  ];

  const team = await createPublicSiteService(repository).getTeam();
  assert.equal(team.facultyLead?.slug, "advisor-professor-li");
  assert.equal(team.phdStudents[0].slug, "phd-zhang-san");
  assert.deepEqual(team.phdStudents[0].degree, { zh: "博士", en: "PhD" });
});
