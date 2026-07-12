const controlOrBackslash = /[\u0000-\u001f\u007f\\]/;
const encodedControl = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
const invalidPercentEncoding = /%(?![0-9a-f]{2})/i;
const scheme = /^[a-z][a-z0-9+.-]*:/i;
const mailto = /^mailto:[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?:\?[a-z0-9._~!$&'()*+,;=:@/?%-]*)?$/i;
const tel = /^tel:\+?[0-9(). -]+(?:;ext=[0-9]+)?$/i;
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

export function sanitizeActionUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (
    !url ||
    controlOrBackslash.test(url) ||
    encodedControl.test(url) ||
    invalidPercentEncoding.test(url)
  ) return "";
  if (mailto.test(url) || tel.test(url)) return url;
  return sanitizePublicUrl(url);
}

export function sanitizeEmbedUrl(value: unknown): string {
  const url = sanitizePublicUrl(value);
  if (!url.startsWith("https://")) return "";
  try {
    const parsed = new URL(url);
    return embedHosts.has(parsed.hostname.toLowerCase()) ? parsed.href : "";
  } catch {
    return "";
  }
}
