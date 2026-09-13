import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime.js";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";
import nextConfig from "../../apps/web/next.config";
import { LanguageProvider } from "../../apps/web/features/public-site/LanguageProvider";
// Node's CJS interop differs from Next's bundler. Keep the real Image component.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/next/image.js"))
      return {
        format: "module",
        shortCircuit: true,
        source:
          'export { Image as default } from "next/dist/client/image-component.js";',
      };
    if (url.endsWith(".css"))
      return {
        format: "module",
        shortCircuit: true,
        source: "export default {};",
      };
    return nextLoad(url, context);
  },
});
const { ResearchPage } =
  await import("../../apps/web/features/public-site/ResearchPage");
const { NewsPage } =
  await import("../../apps/web/features/public-site/NewsPage");
const { FacilitiesPage } =
  await import("../../apps/web/features/public-site/FacilitiesPage");
const { TeamPage } =
  await import("../../apps/web/features/public-site/TeamPage");

// The command-line renderer uses the classic JSX transform, unlike Next's build.
Object.assign(globalThis, { React });
const bilingual = (value: string) => ({ zh: value, en: value });
const render = (
  component: React.ComponentType<any>,
  props: any,
  locale: "zh" | "en" = "zh",
) =>
  renderToStaticMarkup(
    React.createElement(
      ImageConfigContext.Provider,
      { value: { ...imageConfigDefault, ...nextConfig.images } },
      React.createElement(LanguageProvider, {
        initialLocale: locale,
        children: React.createElement(component, props),
      }),
    ),
  );

test("formal publications render in both languages and topic links constrain results", () => {
  const publications = [
    {
      id: "one",
      title: bilingual("Learning from a Single Example"),
      authors: [{ name: bilingual("Author One") }],
      year: "2026",
      topic: "slam",
      type: "conference",
      pdf: { src: "javascript:alert(1)", label: bilingual("PDF") },
    },
    {
      id: "two",
      title: bilingual("Cooperative navigation"),
      authors: [{ name: bilingual("Author Two") }],
      year: "2025",
      topic: "multi-robot",
      type: "journal",
    },
  ];
  for (const locale of ["zh", "en"] as const) {
    const html = render(
      ResearchPage,
      {
        data: { publications, topicOrder: ["slam", "multi-robot"] },
        initialTopic: "slam",
      },
      locale,
    );
    assert.match(html, /Learning from a Single Example/);
    assert.doesNotMatch(html, /Cooperative navigation|javascript:|alert\(1\)/);
    assert.match(html, /v41-publications-layout/);
  }
});

test("team renders each identity in order with every member and a single landscape hero", () => {
  const members = Array.from({ length: 19 }, (_, index) => ({
    slug: `master-${index}`,
    name: bilingual(`Member ${index}`),
  }));
  const lead = { slug: "lead", name: bilingual("Lead") };
  const html = render(TeamPage, {
    data: {
      facultyLead: lead,
      advisors: [lead],
      masterStudents: members,
      alumni: [{ slug: "alumni", name: bilingual("Graduate") }],
    },
  });
  assert.equal((html.match(/class="rnav-member-card"/g) || []).length, 21);
  assert.equal((html.match(/id="lead"/g) || []).length, 1);
  assert.ok(html.indexOf('id="lead"') < html.indexOf('id="master-0"'));
  assert.ok(html.indexOf('id="master-18"') < html.indexOf('id="alumni"'));
  assert.doesNotMatch(html, /v41-team-mosaic|v41-group-more|v41-lead/);
  assert.match(html, /202501233.png/);
});

test("formal news uses featured and archive compositions with real category labels", () => {
  const html = render(NewsPage, {
    data: {
      items: [
        {
          id: "one",
          title: bilingual("Featured actual update"),
          date: bilingual("2026-08-01"),
          category: bilingual("Seminar"),
          featured: true,
        },
        {
          id: "two",
          title: bilingual("Archived actual update"),
          date: bilingual("2025-04-01"),
          category: bilingual("Research"),
        },
        {
          id: "demo",
          title: bilingual("【示意新闻】Test"),
          date: bilingual("2026-09-01"),
        },
      ],
    },
  });
  assert.match(html, /Featured actual update/);
  assert.match(html, /Archived actual update/);
  assert.match(html, /Seminar/);
  assert.doesNotMatch(html, /【示意新闻】/);
});

test("facility detail renders only selected public fields even if extra internal fields arrive", () => {
  const html = render(FacilitiesPage, {
    data: {
      facilitySections: [
        {
          kind: "platform",
          items: [
            {
              id: 4,
              title: bilingual("Public robot"),
              description: bilingual("Public description"),
              specs: [
                { label: bilingual("Payload"), value: bilingual("5 kg") },
              ],
              serialNumber: "SECRET_SERIAL",
              location: "PRIVATE_STORE",
              assignedUser: "PRIVATE_USER",
              purchaseSource: "PRIVATE_VENDOR",
            },
          ],
        },
      ],
    },
  });
  assert.match(html, /Public robot/);
  assert.match(html, /5 kg/);
  assert.doesNotMatch(
    html,
    /SECRET_SERIAL|PRIVATE_STORE|PRIVATE_USER|PRIVATE_VENDOR/,
  );
});
