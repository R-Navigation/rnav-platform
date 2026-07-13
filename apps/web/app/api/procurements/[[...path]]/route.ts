import { NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/server/api";
import { createUpstreamHeaders, validateBodySize, validateIncomingOrigin, validateRequestSize } from "./proxy";

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const rejection = validateIncomingOrigin(request) ?? validateRequestSize(request); if (rejection) return rejection;
  const { path = [] } = await context.params; const incoming = new URL(request.url); const suffix = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  if (body) { const bodyRejection = validateBodySize(body); if (bodyRejection) return bodyRejection; }
  try {
    const upstream = await fetch(getInternalApiUrl(`/api/procurements${suffix}${incoming.search}`), { method: request.method, headers: createUpstreamHeaders(request), body, cache: "no-store" });
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
  } catch { return NextResponse.json({ error: "Procurement service unavailable" }, { status: 502 }); }
}

export const GET = proxy; export const POST = proxy;
