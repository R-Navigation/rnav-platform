import type { RequestHandler } from "express";

function firstHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",", 1)[0].trim() || null;
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function requestOrigin(request: Parameters<RequestHandler>[0]) {
  const host = firstHeader(request.headers["x-forwarded-host"]) ?? firstHeader(request.headers.host);
  if (!host || /[\s/@\\]/.test(host)) return null;
  const forwardedProto = firstHeader(request.headers["x-forwarded-proto"]);
  const protocol = (forwardedProto ?? ((request.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http")).toLowerCase();
  if (protocol !== "http" && protocol !== "https") return null;
  return normalizeOrigin(`${protocol}://${host}`);
}

export const requireSameOrigin: RequestHandler = (request, response, next) => {
  const origin = firstHeader(request.headers.origin);
  if (!origin || normalizeOrigin(origin) !== requestOrigin(request)) {
    response.status(403).json({ error: "Origin denied" });
    return;
  }
  next();
};
