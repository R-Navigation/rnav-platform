const readMethods = new Set(["GET", "HEAD"]);

function normalizedOrigin(value: string) {
  const url = new URL(value);
  if (!url.protocol || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid origin");
  }
  return url.origin;
}

export function validateIncomingOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return readMethods.has(request.method.toUpperCase())
      ? null
      : Response.json({ error: "Forbidden origin" }, { status: 403 });
  }
  if (origin.includes(",")) return Response.json({ error: "Forbidden origin" }, { status: 403 });

  try {
    if (normalizedOrigin(origin) !== new URL(request.url).origin) {
      return Response.json({ error: "Forbidden origin" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }
  return null;
}

export function createUpstreamHeaders(request: Request) {
  const incomingUrl = new URL(request.url);
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");

  if (cookie) headers.set("cookie", cookie);
  headers.set("accept", accept ?? "application/json");
  if (contentType) headers.set("content-type", contentType);

  headers.set("host", incomingUrl.host);
  headers.set("origin", incomingUrl.origin);
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.slice(0, -1));
  return headers;
}
