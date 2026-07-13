const readMethods = new Set(["GET", "HEAD"]);
const maximumBodyBytes = 1024 * 1024;
const sessionCookieName = "rnav_session";

function normalizedOrigin(value: string) {
  const url = new URL(value);
  if (!url.protocol || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid origin");
  return url.origin;
}

export function validateIncomingOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return readMethods.has(request.method.toUpperCase()) ? null : Response.json({ error: "Forbidden origin" }, { status: 403 });
  if (origin.includes(",")) return Response.json({ error: "Forbidden origin" }, { status: 403 });
  try { if (normalizedOrigin(origin) !== new URL(request.url).origin) return Response.json({ error: "Forbidden origin" }, { status: 403 }); }
  catch { return Response.json({ error: "Forbidden origin" }, { status: 403 }); }
  return null;
}

export function validateRequestSize(request: Request): Response | null {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maximumBodyBytes) return Response.json({ error: "Request body too large" }, { status: 413 });
  return null;
}

export function createUpstreamHeaders(request: Request) {
  const incomingUrl = new URL(request.url); const headers = new Headers();
  const rawCookie = request.headers.get("cookie") ?? "";
  const session = rawCookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`));
  if (session) headers.set("cookie", session);
  headers.set("accept", request.headers.get("accept") ?? "application/json");
  const contentType = request.headers.get("content-type"); if (contentType) headers.set("content-type", contentType);
  headers.set("host", incomingUrl.host); headers.set("origin", incomingUrl.origin); headers.set("x-forwarded-host", incomingUrl.host); headers.set("x-forwarded-proto", incomingUrl.protocol.slice(0, -1));
  return headers;
}
