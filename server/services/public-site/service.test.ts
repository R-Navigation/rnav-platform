import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicSiteService,
  type PublicSiteRepository,
} from "./service.js";

class MemoryPublicSiteRepository implements PublicSiteRepository {
  pages = new Map<string, unknown>();
  research: Record<string, unknown>[] = [];
  news: Record<string, unknown>[] = [];
  team: Record<string, unknown>[] = [];
  facilities: Record<string, unknown>[] = [];
  publicPlatforms: Record<string, unknown>[] = [];
  publicAssets: Record<string, unknown>[] = [];
  contacts = { primaryChannels: [], socialLinks: [], extraCards: [] };

  async getPageContent(key: string) {
    return this.pages.get(key) ?? null;
  }
  async getResearchItems() {
    return this.research;
  }
  async getNewsItems() {
    return this.news;
  }
  async getTeamMembers() {
    return this.team;
  }
  async getFacilityItems() {
    return this.facilities;
  }
  async getPublicLabPlatforms(){return this.publicPlatforms;}
  async getPublicLabAssets(){return this.publicAssets;}
  async getContactItems() {
    return this.contacts;
  }
}

test("editable page hero images survive public projection without leaking extra fields", async () => {
  const repository = new MemoryPublicSiteRepository();
  const image = { src: "https://example.com/campus.jpg", alt: "Campus", secret: "PRIVATE" };
  for (const key of ["team_page", "research_page", "news_page", "facilities_page", "contact_page"]) repository.pages.set(key, { header: { image } });
  repository.pages.set("home", { hero: { image }, directionsHeroImage: image });
  const service = createPublicSiteService(repository);
  for (const data of await Promise.all([service.getTeam(), service.getResearch(), service.getNews(), service.getFacilities(), service.getContact()])) {
    assert.equal(data.header.image.src, image.src);
    assert.equal(data.header.image.secret, undefined);
  }
  assert.equal((await service.getHome()).directionsHeroImage.src, image.src);
  repository.pages.set("team_page", { header: { image: { src: "javascript:alert(1)" } } });
  assert.equal((await service.getTeam()).header.image, null);
});

test("member normalization does not restore explicitly hidden academic fields", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.team = [{ group: "master", name: { zh: "成员" }, degree: { zh: "", en: "" } }];
  assert.deepEqual((await createPublicSiteService(repository).getTeam()).masterStudents[0].degree, { zh: "", en: "" });
});

test("bootstrap supplies bilingual defaults and the required public navigation", async () => {
  const service = createPublicSiteService(new MemoryPublicSiteRepository());
  const bootstrap = await service.getBootstrap();

  assert.equal(bootstrap.brand.name.zh, "R-Nav 研究组");
  assert.deepEqual(
    bootstrap.navigation.map((item) => item.href),
    ["/", "/directions", "/research", "/facilities", "/team", "/news", "/contact"],
  );
  assert.equal(bootstrap.navigation[1].label.en, "Directions");
  assert.equal(bootstrap.navigation[2].label.zh, "论文成果");
});

test("research merges stored page content with normalized repository items", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("research_page", {
    header: { title: { zh: "成果", en: "Work" } },
  });
  repository.research = [
    {
      id: "paper-1",
      title: { en: "A Paper" },
      authors: [{ name: "Ada", highlight: true }],
    },
  ];

  const research = await createPublicSiteService(repository).getResearch();
  assert.deepEqual(research.header.title, { zh: "成果", en: "Work" });
  assert.deepEqual(research.publications[0].title, { zh: "", en: "A Paper" });
  assert.deepEqual(research.publications[0].authors[0].name, {
    zh: "",
    en: "Ada",
  });
});

test("team groups members and derives a stable fallback slug", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.team = [
    {
      group: "phd",
      name: { zh: "张三", en: "Zhang San" },
      enrollmentYear: "2024",
    },
    { group: "advisor", name: { zh: "李老师", en: "Professor Li" } },
  ];

  const team = await createPublicSiteService(repository).getTeam();
  assert.equal(team.facultyLead?.slug, "advisor-professor-li");
  assert.equal(team.phdStudents[0].slug, "phd-zhang-san");
  assert.deepEqual(team.phdStudents[0].degree, { zh: "博士", en: "PhD" });
});

test("homepage returns only configured authoritative records in configured order", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("home", {
    featuredResearchIds: ["paper-2"],
    featuredFacilityIds: ["facility-2"],
    featuredMemberSlugs: ["phd-second"],
    newsPreviewIds: ["news-2"],
  });
  repository.research = [{ id: "paper-1" }, { id: "paper-2" }];
  repository.publicPlatforms = [{ id: "facility-1" }, { id: "facility-2" }];
  repository.team = [
    { slug: "phd-first", group: "phd", name: { en: "First" } },
    { slug: "phd-second", group: "phd", name: { en: "Second" } },
  ];
  repository.news = [{ id: "news-1" }, { id: "news-2" }];

  const homepage = await createPublicSiteService(repository).getHomepage();
  assert.deepEqual(
    homepage.research.publications.map(
      (item: Record<string, unknown>) => item.id,
    ),
    ["paper-2"],
  );
  assert.deepEqual(
    homepage.facilities.facilitySections[0].items.map(
      (item: Record<string, unknown>) => item.id,
    ),
    ["facility-2"],
  );
  assert.deepEqual(
    homepage.team.advisors.map((item: Record<string, unknown>) => item.slug),
    ["phd-second"],
  );
  assert.deepEqual(
    homepage.news.items.map((item: Record<string, unknown>) => item.id),
    ["news-2"],
  );
});

test("facilities groups flat legacy items by configured category order and metadata", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("facilities_page", {
    categoryOrder: ["aerialPlatforms", "quadrupeds"],
    sectionTitles: {
      quadrupeds: { zh: "四足平台", en: "Quadruped Platforms" },
      aerialPlatforms: { zh: "空中平台", en: "Aerial Platforms" },
    },
    sectionConfig: {
      aerialPlatforms: {
        subtitle: { zh: "无人机系统", en: "UAV Systems" },
        video: {
          title: { zh: "飞行演示", en: "Flight Demo" },
          embedUrl: "https://www.youtube.com/embed/flight-demo",
        },
      },
    },
  });
  repository.facilities = [
    {
      category: "quadrupeds",
      title: { zh: "机器狗", en: "Robot Dog" },
      specs: [{ label: { zh: "重量", en: "Weight" }, value: "12 kg" }],
    },
    {
      category: "aerialPlatforms",
      title: { zh: "无人机", en: "Drone" },
      specs: [{ label: "Range", value: "5 km" }],
    },
  ];

  const facilities = await createPublicSiteService(repository).getFacilities();
  assert.deepEqual(
    facilities.facilitySections.map(
      (section: Record<string, unknown>) => section.category,
    ),
    ["aerialPlatforms", "quadrupeds"],
  );
  assert.deepEqual(facilities.facilitySections[0].subtitle, {
    zh: "无人机系统",
    en: "UAV Systems",
  });
  assert.equal(
    facilities.facilitySections[0].video.embedUrl,
    "https://www.youtube.com/embed/flight-demo",
  );
  assert.deepEqual(facilities.facilitySections[0].items[0].specs[0].value, {
    zh: "",
    en: "5 km",
  });
  assert.deepEqual(facilities.facilitySections[1].subtitle, {
    zh: "四足平台",
    en: "Quadruped Platforms",
  });
});

test("facilities preserves an explicitly empty facilitySections array", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("facilities_page", { facilitySections: [] });
  repository.facilities = [
    { category: "quadrupeds", title: { en: "Robot Dog" } },
  ];

  const facilities = await createPublicSiteService(repository).getFacilities();
  assert.deepEqual(facilities.facilitySections, []);
});

test("facilities uses asset-backed public profiles and suppresses legacy duplicates",async()=>{const repository=new MemoryPublicSiteRepository();repository.publicPlatforms=[{id:"platform-1",category:"robot",categoryLabel:{zh:"机器人",en:"Robots"},title:{zh:"导航平台",en:"Navigation platform"},components:[{role:{zh:"前视",en:"Front"},deviceType:"相机",manufacturer:"Intel",model:"D455",count:1}]}];repository.publicAssets=[{id:"asset-1",category:"lidar",categoryLabel:{zh:"激光雷达",en:"LiDAR"},title:{zh:"核心雷达",en:"Core LiDAR"}}];repository.facilities=[{id:"legacy-1",category:"quadrupeds",title:{zh:"旧设施",en:"Legacy"}}];const facilities=await createPublicSiteService(repository).getFacilities();assert.deepEqual(facilities.facilitySections.map((section:any)=>section.category),["platform:robot","asset:lidar"]);assert.deepEqual(facilities.facilitySections[0].subtitle,{zh:"机器人",en:"Robots"});assert.equal(facilities.facilitySections[0].items[0].components[0].role.zh,"前视");});

test("directions prefers the independent page, falls back to legacy home, and shares homepage authority",async()=>{const repository=new MemoryPublicSiteRepository();repository.pages.set("home",{hero:{description:{zh:"旧简介"}},researchAreas:[{title:{zh:"旧方向"}}],directionsHeroImage:{src:"/legacy.jpg"}});const service=createPublicSiteService(repository);const legacy=await service.getDirections();assert.equal(legacy.directions[0].title.zh,"旧方向");assert.equal(legacy.header.description.zh,"旧简介");assert.equal(legacy.hero.image.src,"/legacy.jpg");repository.pages.set("directions_page",{header:{title:{zh:"新方向"}},hero:{image:{src:"/new.jpg"}},directions:[{key:"new",topicKey:"slam",title:{zh:"新权威"}}]});const current=await service.getDirections(),homepage=await service.getHomepage();assert.equal(current.directions[0].topicKey,"slam");assert.equal(homepage.directions.directions[0].title.zh,"新权威");assert.equal(homepage.home.researchAreas[0].title.zh,"新权威");});

test("directions preserves an explicitly empty authoritative collection",async()=>{const repository=new MemoryPublicSiteRepository();repository.pages.set("home",{researchAreas:[{title:{zh:"旧方向"}}]});repository.pages.set("directions_page",{directions:[]});const service=createPublicSiteService(repository);assert.deepEqual((await service.getDirections()).directions,[]);assert.deepEqual((await service.getHomepage()).home.researchAreas,[]);});

test("public page projections recursively strip unknown and internal JSON fields", async () => {
  const repository = new MemoryPublicSiteRepository();
  const secret = {
    internalNotes: "do not publish",
    draftMetadata: { approvedBy: "admin", secret: "nested" },
  };
  repository.pages.set("site", {
    brandName: { zh: "公开品牌", en: "Public Brand", secret: "hidden" },
    footerLinks: [{ label: { en: "Lab" }, href: "/lab", ...secret }],
    ...secret,
  });
  repository.pages.set("home", {
    hero: {
      title: { en: "Public Home", secret: "hidden" },
      actions: [{ label: { en: "Read" }, href: "/research", ...secret }],
      ...secret,
    },
    researchAreas: [
      { title: { en: "Area" }, description: { en: "Description" }, ...secret },
    ],
    ...secret,
  });
  repository.pages.set("research_page", {
    header: { title: { en: "Research", secret: "hidden" }, ...secret },
    ...secret,
  });
  repository.pages.set("news_page", {
    header: { title: { en: "News", secret: "hidden" }, ...secret },
    ...secret,
  });
  repository.pages.set("team_page", {
    recruitment: { title: { en: "Join", secret: "hidden" }, ...secret },
    ...secret,
  });
  repository.pages.set("facilities_page", {
    facilitySections: [
      {
        category: "quadrupeds",
        title: { en: "Robot" },
        video: {
          title: { en: "Demo" },
          embedUrl: "https://www.youtube.com/embed/demo",
          ...secret,
        },
        ...secret,
      },
    ],
    ...secret,
  });
  repository.pages.set("contact_page", {
    header: { title: { en: "Contact", secret: "hidden" }, ...secret },
    ...secret,
  });

  const service = createPublicSiteService(repository);
  const payloads = await Promise.all([
    service.getBootstrap(),
    service.getHome(),
    service.getResearch(),
    service.getNews(),
    service.getTeam(),
    service.getFacilities(),
    service.getContact(),
  ]);

  for (const payload of payloads) {
    const json = JSON.stringify(payload);
    assert.equal(json.includes("internalNotes"), false);
    assert.equal(json.includes("draftMetadata"), false);
    assert.equal(json.includes("approvedBy"), false);
    assert.equal(json.includes('"secret"'), false);
  }
  assert.deepEqual(payloads[1].hero.title, {
    zh: "R-Nav：面向复杂环境的韧性导航与",
    en: "Public Home",
  });
});

test("public payloads sanitize hostile media, document, link, and embed URLs", async () => {
  const repository = new MemoryPublicSiteRepository();
  repository.pages.set("home", {
    hero: {
      image: { src: "data:image/svg+xml,<svg onload=alert(1)>", alt: "unsafe" },
      actions: [
        { label: { en: "Relative" }, href: "/research" },
        { label: { en: "HTTPS" }, href: "https://example.org/paper" },
        { label: { en: "Script" }, href: "java\u0000script:alert(1)" },
        { label: { en: "Protocol relative" }, href: "//evil.example/path" },
        { label: { en: "Backslash" }, href: "https:\\evil.example/path" },
      ],
    },
  });
  repository.research = [
    {
      id: "paper-1",
      title: { en: "Paper" },
      image: { src: "https://cdn.example.org/paper.png", alt: "Paper" },
      pdf: { src: "file:///etc/passwd", label: { en: "PDF" } },
      links: [
        { label: { en: "Code" }, href: "http://example.org/code" },
        { label: { en: "Bad" }, href: "data:text/html,pwned" },
      ],
    },
  ];
  repository.pages.set("facilities_page", {
    facilitySections: [
      {
        category: "safe",
        video: { embedUrl: "https://www.youtube.com/embed/demo" },
      },
      {
        category: "http",
        video: { embedUrl: "http://www.youtube.com/embed/demo" },
      },
      {
        category: "host",
        video: { embedUrl: "https://evil.example/embed/demo" },
      },
    ],
  });

  const service = createPublicSiteService(repository);
  const [home, research, facilities] = await Promise.all([
    service.getHome(),
    service.getResearch(),
    service.getFacilities(),
  ]);

  assert.equal(home.hero.image, null);
  assert.deepEqual(
    home.hero.actions.map((action: Record<string, unknown>) => action.href),
    ["/research", "https://example.org/paper", "", "", ""],
  );
  assert.equal(
    research.publications[0].image.src,
    "https://cdn.example.org/paper.png",
  );
  assert.equal(research.publications[0].pdf, null);
  assert.deepEqual(
    research.publications[0].links.map(
      (link: Record<string, unknown>) => link.href,
    ),
    ["http://example.org/code", ""],
  );
  assert.deepEqual(
    facilities.facilitySections.map((section: Record<string, any>) => ({
      category: section.category,
      embedUrl: section.video?.embedUrl,
    })),
    [
      { category: "safe", embedUrl: "https://www.youtube.com/embed/demo" },
      { category: "http", embedUrl: "" },
      { category: "host", embedUrl: "" },
    ],
  );
});
