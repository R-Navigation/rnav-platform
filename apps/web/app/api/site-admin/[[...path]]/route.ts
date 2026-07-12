import { NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/server/api";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy";

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const originRejection = validateIncomingOrigin(request);
  if (originRejection) return originRejection;

  const { path = [] } = await context.params;
  const incomingUrl = new URL(request.url);
  const upstreamUrl = getInternalApiUrl(`/api/site-admin/${path.join("/")}${incomingUrl.search}`);
  const headers = createUpstreamHeaders(request);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method.toUpperCase()) ? undefined : await request.arrayBuffer(),
      cache: "no-store"
    });
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" }
    });
  } catch {
    return NextResponse.json({ error: "Site administration service unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
