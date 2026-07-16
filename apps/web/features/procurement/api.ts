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
export const loadProcurementCatalog = (options: { search?: string; categoryId?: string; includeInactive?: boolean } = {}) => {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.categoryId) query.set("categoryId", options.categoryId);
  if (options.includeInactive) query.set("includeInactive", "true");
  return request<{ categories: unknown[]; items: unknown[] }>(`/catalog${query.size ? `?${query}` : ""}`);
};
export const createCatalogCategory = (body: unknown) => request("/catalog/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const updateCatalogCategory = (id: string, body: unknown) => request(`/catalog/categories/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const createCatalogItem = (body: unknown) => request("/catalog/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const updateCatalogItem = (id: string, body: unknown) => request(`/catalog/items/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
