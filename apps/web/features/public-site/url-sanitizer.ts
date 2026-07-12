const controlOrBackslash = /[\u0000-\u001f\u007f\\]/;
const scheme = /^[a-z][a-z0-9+.-]*:/i;
const embedHosts = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "player.bilibili.com"
]);

export function sanitizePublicUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (!url || controlOrBackslash.test(url) || url.startsWith("//")) return "";
  if (!scheme.test(url)) return url.startsWith("/") || url.startsWith("#") ? url : `/${url}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function sanitizeEmbedUrl(value: unknown): string {
  const url = sanitizePublicUrl(value);
  if (!url.startsWith("https://")) return "";
  try {
    return embedHosts.has(new URL(url).hostname.toLowerCase()) ? url : "";
  } catch {
    return "";
  }
}

export function isExternalPublicUrl(value: unknown) {
  return /^https?:\/\//i.test(sanitizePublicUrl(value));
}
