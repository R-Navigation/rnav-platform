import assert from "node:assert/strict";
import test from "node:test";
import { filterPublications, groupPublications } from "./research.ts";

const publications = [
  { id: "b", year: 2023, topic: "mapping", type: "journal", title: { zh: "建图", en: "Mapping" }, venue: { en: "TRO" }, authors: [{ name: { en: "Ada" } }], keywords: [{ en: "SLAM" }] },
  { id: "a", year: 2024, topic: "navigation", type: "conference", title: { zh: "导航", en: "Navigation" }, venue: { en: "ICRA" }, authors: [{ name: { en: "Lin" } }], keywords: [{ en: "Planning" }] },
  { id: "c", year: 2022, topic: "other", type: "workshop", title: { en: "Embodied Systems" }, venue: { en: "RSS" }, authors: [] }
];

test("filterPublications searches localized titles, venues, authors, and keywords", () => {
  assert.deepEqual(filterPublications(publications, "slam", "en").map((item) => item.id), ["b"]);
  assert.deepEqual(filterPublications(publications, "导航", "zh").map((item) => item.id), ["a"]);
  assert.deepEqual(filterPublications(publications, "lin", "en").map((item) => item.id), ["a"]);
});

test("groupPublications uses configured topic order then appends remaining groups", () => {
  const groups = groupPublications(publications, "topic", ["navigation", "mapping"]);
  assert.deepEqual(groups.map(([key]) => key), ["navigation", "mapping", "other"]);
});

test("groupPublications keeps chronological groups newest first", () => {
  const groups = groupPublications(publications, "chronological", []);
  assert.deepEqual(groups.map(([key]) => key), ["2024", "2023", "2022"]);
});
