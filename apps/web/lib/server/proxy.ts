import { NextResponse } from "next/server";
import { getInternalApiUrl } from "./api";

const readMethods = new Set(["GET", "HEAD"]);

export async function proxyInternalApi(
  request: Request,
  upstreamPath: string,
  unavailableMessage: string,
) {
  const incoming = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!readMethods.has(request.method.toUpperCase()) && origin !== incoming.origin) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("host", incoming.host);
  headers.set("origin", incoming.origin);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  try {
    const upstream = await fetch(getInternalApiUrl(`${upstreamPath}${incoming.search}`), {
      method: request.method,
      headers,
      body: readMethods.has(request.method.toUpperCase()) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });
    const response = new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  } catch {
    return NextResponse.json({ error: unavailableMessage }, { status: 502 });
  }
}
