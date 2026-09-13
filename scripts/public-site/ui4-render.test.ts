import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "../../apps/web/features/public-site/LanguageProvider";
import { ResearchPage } from "../../apps/web/features/public-site/ResearchPage";
import { NewsPage } from "../../apps/web/features/public-site/NewsPage";
import { FacilitiesPage } from "../../apps/web/features/public-site/FacilitiesPage";

// The command-line renderer uses the classic JSX transform, unlike Next's build.
Object.assign(globalThis, { React });
const bilingual = (value: string) => ({ zh: value, en: value });
const render = (
  component: React.ComponentType<any>,
  props: any,
  locale: "zh" | "en" = "zh",
) =>
  renderToStaticMarkup(
    React.createElement(LanguageProvider, {
      initialLocale: locale,
      children: React.createElement(component, props),
    }),
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
