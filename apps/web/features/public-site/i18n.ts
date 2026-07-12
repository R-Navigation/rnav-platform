export type Locale = "zh" | "en";
export type LocalizedText = { zh: string; en: string };

export function getLocalizedText(value: unknown, locale: Locale = "zh") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const text = value as Partial<Record<Locale, unknown>>;
    if ("zh" in text || "en" in text) {
      return String(text[locale] || text.en || text.zh || "").trim();
    }
  }
  return String(value || "").trim();
}

const unsafeProtocol = /^(?:javascript|data|vbscript):/i;
const allowedExternalProtocol = /^(?:https?:|mailto:|tel:)/i;

export function normalizeInternalHref(href: unknown) {
  const value = String(href || "").trim();
  if (!value || unsafeProtocol.test(value) || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  if (allowedExternalProtocol.test(value) || value.startsWith("#")) {
    return value;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "/";
  }
  const normalized = value
    .replace(/^index\.html$/i, "/")
    .replace(/\.html$/i, "")
    .replace(/^\/?index$/i, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function isExternalHref(href: unknown) {
  const value = normalizeInternalHref(href);
  return allowedExternalProtocol.test(value) || value.startsWith("#");
}
