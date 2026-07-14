import { proxyInternalApi } from "@/lib/server/proxy";
async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxyInternalApi(request, `/api/users${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`, "用户管理服务暂时不可用");
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
