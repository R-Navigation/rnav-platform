import type { ProcurementAction } from "./model";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/procurements${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      issues?: unknown;
    };
    const issues = Array.isArray(payload.issues)
      ? payload.issues
          .map((issue) =>
            issue && typeof issue === "object" && "message" in issue
              ? String(issue.message)
              : "",
          )
          .filter(Boolean)
          .join("；")
      : "";
    throw new Error(
      issues ||
        (typeof payload.error === "string"
          ? payload.error
          : "采购服务请求失败。"),
    );
  }
  return response.json();
}

export const loadProcurements = (scope: "mine" | "all") =>
  request<unknown[]>(`?scope=${scope}`);
export const loadProcurement = (id: string) =>
  request<Record<string, unknown>>(`/${encodeURIComponent(id)}`);
export const createProcurement = (body: unknown) =>
  request("", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const reviseProcurement = (id: string, body: unknown) =>
  request(`/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const transitionProcurement = (
  id: string,
  action: ProcurementAction,
  note: string,
) =>
  request(`/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
export const addProcurementComment = (id: string, body: string) =>
  request(`/${encodeURIComponent(id)}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
export const loadProcurementCatalog = (
  options: {
    search?: string;
    categoryId?: string;
    subcategoryId?: string;
    attributes?: Record<string, string[]>;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) => {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.categoryId) query.set("categoryId", options.categoryId);
  if (options.subcategoryId) query.set("subcategoryId", options.subcategoryId);
  if (options.attributes && Object.keys(options.attributes).length)
    query.set("attributes", JSON.stringify(options.attributes));
  if (options.includeInactive) query.set("includeInactive", "true");
  if (options.limit) query.set("limit", String(options.limit));
  if (options.offset) query.set("offset", String(options.offset));
  return request<{
    categories: unknown[];
    subcategories: unknown[];
    attributes: unknown[];
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
  }>(`/catalog${query.size ? `?${query}` : ""}`);
};
export const createCatalogCategory = (body: unknown) =>
  request("/catalog/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateCatalogCategory = (id: string, body: unknown) =>
  request(`/catalog/categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteCatalogCategory = (id: string) =>
  request(`/catalog/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const createCatalogSubcategory = (body: unknown) =>
  request("/catalog/subcategories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateCatalogSubcategory = (id: string, body: unknown) =>
  request(`/catalog/subcategories/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteCatalogSubcategory = (id: string) =>
  request(`/catalog/subcategories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const createCatalogItem = (body: unknown) =>
  request("/catalog/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateCatalogItem = (id: string, body: unknown) =>
  request(`/catalog/items/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteCatalogItem = (id: string) =>
  request(`/catalog/items/${encodeURIComponent(id)}`, { method: "DELETE" });
export const saveProcurementProcessing = (id: string, body: unknown) =>
  request(`/${encodeURIComponent(id)}/processing`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const completeProcurementProcessing = (id: string, body: unknown) =>
  request(`/${encodeURIComponent(id)}/processing/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
export const confirmProcurementReceived = (id: string) =>
  request(`/${encodeURIComponent(id)}/received`, { method: "POST" });
