import type { RequestHandler } from "express";

function singleHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.includes(",")) return null;
  return raw.trim() || null;
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

function requestOrigin(request: Parameters<RequestHandler>[0], trustProxy: boolean) {
  const forwardedHost = singleHeader(request.headers["x-forwarded-host"]);
  const forwardedProto = singleHeader(request.headers["x-forwarded-proto"]);
  if (trustProxy && (!forwardedHost || !forwardedProto)) return null;
  const host = trustProxy ? forwardedHost : singleHeader(request.headers.host);
  if (!host || /[\s/@\\]/.test(host)) return null;
  const protocol = (trustProxy ? forwardedProto : ((request.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"))?.toLowerCase();
  if (protocol !== "http" && protocol !== "https") return null;
  return normalizeOrigin(`${protocol}://${host}`);
}

export function createRequireSameOrigin({ trustProxy = false }: { trustProxy?: boolean } = {}): RequestHandler {
  return (request, response, next) => {
    const origin = singleHeader(request.headers.origin);
    if (!origin || normalizeOrigin(origin) !== requestOrigin(request, trustProxy)) {
      response.status(403).json({ error: "Origin denied" });
      return;
    }
    next();
  };
}

export const requireSameOrigin = createRequireSameOrigin();
