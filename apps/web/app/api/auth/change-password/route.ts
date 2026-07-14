import { proxyInternalApi } from "@/lib/server/proxy";
export function POST(request: Request) { return proxyInternalApi(request, "/api/auth/change-password", "认证服务暂时不可用"); }
