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
