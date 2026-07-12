import { getLocalizedText, type Locale } from "./i18n.ts";

type Publication = {
  title?: unknown;
  venue?: unknown;
  authors?: Array<{ name?: unknown }>;
  keywords?: unknown[];
  year?: unknown;
  topic?: unknown;
  type?: unknown;
};
export type ResearchMode = "chronological" | "topic" | "type";

export function filterPublications<T extends Publication>(publications: T[], query: string, locale: Locale): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return publications;
  return publications.filter((publication) => {
    const values = [
      getLocalizedText(publication.title, locale),
      getLocalizedText(publication.venue, locale),
      ...(publication.authors ?? []).map((author) => getLocalizedText(author.name, locale)),
      ...(publication.keywords ?? []).map((keyword: unknown) => getLocalizedText(keyword, locale))
    ];
    return values.some((value) => value.toLocaleLowerCase().includes(needle));
  });
}

export function groupPublications<T extends Publication>(publications: T[], mode: ResearchMode, preferredOrder: string[]): Array<[string, T[]]> {
  const sorted = [...publications].sort((left, right) => Number(right.year || 0) - Number(left.year || 0) || getLocalizedText(left.title, "en").localeCompare(getLocalizedText(right.title, "en")));
  const grouped = new Map<string, T[]>();
  for (const publication of sorted) {
    const key = mode === "topic" ? String(publication.topic || "") : mode === "type" ? String(publication.type || "") : String(publication.year || "");
    grouped.set(key, [...(grouped.get(key) ?? []), publication]);
  }
  if (mode === "chronological") return [...grouped.entries()].sort((left, right) => Number(right[0]) - Number(left[0]));
  const remaining = [...grouped.keys()].filter((key) => !preferredOrder.includes(key)).sort();
  return [...preferredOrder.filter((key) => grouped.has(key)), ...remaining].map((key) => [key, grouped.get(key)!]);
}
