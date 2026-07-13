import type { ProcurementAction } from "./model";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/procurements${path}`, { cache: "no-store", ...init });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(typeof payload.error === "string" ? payload.error : "采购服务请求失败。"); }
  return response.json();
}

export const loadProcurements = (scope: "mine" | "all") => request<unknown[]>(`?scope=${scope}`);
export const loadProcurement = (id: string) => request<Record<string, unknown>>(`/${encodeURIComponent(id)}`);
export const createProcurement = (body: unknown) => request("", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const transitionProcurement = (id: string, action: ProcurementAction, note: string) => request(`/${encodeURIComponent(id)}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note }) });
export const addProcurementComment = (id: string, body: string) => request(`/${encodeURIComponent(id)}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
