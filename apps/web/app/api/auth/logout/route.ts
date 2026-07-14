import { proxyInternalApi } from "@/lib/server/proxy";
export function POST(request: Request) { return proxyInternalApi(request, "/api/auth/logout", "认证服务暂时不可用"); }
