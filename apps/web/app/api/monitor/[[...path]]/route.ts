import { NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/server/api";
import { createUpstreamHeaders, isAllowedMonitorPath, validateBodySize, validateIncomingOrigin, validateRequestSize } from "./proxy";

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const originRejection = validateIncomingOrigin(request); if (originRejection) return originRejection;
  const sizeRejection = validateRequestSize(request); if (sizeRejection) return sizeRejection;
  const { path = [] } = await context.params;
  if (!isAllowedMonitorPath(path)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const incomingUrl = new URL(request.url); const suffix = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const body = ["GET", "HEAD"].includes(request.method.toUpperCase()) ? undefined : await request.arrayBuffer();
  if (body) { const rejection = validateBodySize(body); if (rejection) return rejection; }
  try {
    const upstream = await fetch(getInternalApiUrl(`/api/monitor${suffix}${incomingUrl.search}`), { method: request.method, headers: createUpstreamHeaders(request), body, cache: "no-store" });
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
  } catch { return NextResponse.json({ error: "Monitor service unavailable" }, { status: 502 }); }
}

export const GET = proxy; export const POST = proxy; export const PUT = proxy; export const DELETE = proxy;
