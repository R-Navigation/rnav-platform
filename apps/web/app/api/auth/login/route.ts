import { NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/server/api";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(getInternalApiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody || null, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 502 });
  }
}
