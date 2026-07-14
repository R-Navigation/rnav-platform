import { proxyInternalApi } from "@/lib/server/proxy";
export function GET(request: Request) { return proxyInternalApi(request, "/api/auth/session", "认证服务暂时不可用"); }
