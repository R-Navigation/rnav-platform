import { normalizeMonitorSnapshot, type MonitorSnapshot } from "./model";

export async function loadMonitorSnapshot(scope: "public" | "console"): Promise<MonitorSnapshot> {
  const response = await fetch(`/api/monitor/${scope}/bootstrap`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "登录状态已失效。" : response.status === 403 ? "当前账号没有监控权限。" : "无法加载监控数据。");
  return normalizeMonitorSnapshot(await response.json());
}

export async function mutateMonitor(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(`/api/monitor/console${path}`, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(typeof payload.error === "string" ? payload.error : "监控设置保存失败。"); }
  return response.json();
}
