import { getLocalizedText } from "../i18n.ts";

// Explicit CMS demo markers are presentation exclusions, never database deletions.
export function isDemoContent(
  item:
    | {
        title?: unknown;
        description?: unknown;
        excerpt?: unknown;
        value?: unknown;
      }
    | null
    | undefined,
) {
  return [item?.title, item?.description, item?.excerpt, item?.value].some(
    (value) =>
      /【(?:示意|示例|example)|\[(?:demo|example)\]|示意(?:论文|新闻|设备|数据|内容)|(?:简介|联系页|联系信息)示意|这里可以填写|可在这里填写|用于演示|\b(?:demo (?:advisor|contact|facility|news|data|content)|bilingual demo|replace this|use this section)\b/i.test(
        [getLocalizedText(value, "zh"), getLocalizedText(value, "en")].join(
          " ",
        ),
      ),
  );
}

export const publishedItems = <
  T extends {
    title?: unknown;
    description?: unknown;
    excerpt?: unknown;
    value?: unknown;
  },
>(
  items: T[] = [],
) => items.filter((item) => !isDemoContent(item));

type Facility = {
  id?: string | number;
  kind?: string;
  subtitle?: unknown;
  categoryLabel?: unknown;
  tag?: unknown;
  title?: unknown;
  image?: { src?: string; alt?: string };
  description?: unknown;
  specs?: { label?: unknown; value?: unknown }[];
  components?: Facility[];
  items?: Facility[];
};
export function flattenFacilities(data: { facilitySections?: Facility[] }) {
  return (data?.facilitySections ?? []).flatMap((section, index) =>
    (section.items?.length ? section.items : [section]).map(
      (item, itemIndex) => ({
        ...item,
        displayKey: String(item.id ?? `section-${index}-${itemIndex}`),
        sectionKind: section.kind,
        categoryTitle:
          section.subtitle || item.categoryLabel || item.tag || item.title,
      }),
    ),
  );
}

export function selectConfigured<T extends Record<string, unknown>>(
  items: T[],
  ids: unknown[],
  field = "id",
  limit = 4,
): T[] {
  const selected = ids?.length
    ? ids.flatMap((id) =>
        items.filter((item) => String(item[field]) === String(id)),
      )
    : items;
  return selected
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other[field] === item[field]) === index,
    )
    .slice(0, limit);
}

export function homeSlots(order: string[] = []) {
  const mapping: Record<string, string> = {
    researchAreas: "directions",
    featuredResearch: "work",
    facilities: "work",
    members: "people",
    news: "people",
    monitor: "status",
    contact: "contact",
  };
  return [
    ...new Set(
      [...order, ...Object.keys(mapping)]
        .map((key) => mapping[key])
        .filter(Boolean),
    ),
  ];
}
