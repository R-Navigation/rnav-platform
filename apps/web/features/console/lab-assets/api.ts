type ErrorIssue = { message?: unknown; path?: unknown };

const statusMessages: Record<number, string> = {
  400: "提交内容未通过验证。",
  401: "登录状态已失效，请重新登录。",
  403: "当前账号没有执行此操作的权限。",
  409: "数据已被其他成员更新，请重新加载后再试。",
  502: "实验室资产服务暂时不可用，请稍后重试。",
};

export function parseLabAssetsError(payload: unknown, status: number) {
  const data = payload && typeof payload === "object" ? payload as { error?: unknown; issues?: unknown } : {};
  const message = status === 409 ? statusMessages[409] : typeof data.error === "string" ? data.error : statusMessages[status] ?? `请求失败（${status}）。`;
  if (!Array.isArray(data.issues) || data.issues.length === 0) return message;
  const details = data.issues.map((issue: ErrorIssue) => {
    const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
    const issueMessage = typeof issue.message === "string" ? issue.message : "内容无效";
    return path ? `${path} - ${issueMessage}` : issueMessage;
  }).join("；");
  return `${message}: ${details}`;
}

export class LabAssetsRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LabAssetsRequestError";
    this.status = status;
  }
}

export async function readLabAssetsError(response: Response) {
  try {
    return parseLabAssetsError(await response.json(), response.status);
  } catch {
    return parseLabAssetsError({}, response.status);
  }
}

export async function mutateLabAssets(endpoint: string, method: "POST" | "PUT" | "DELETE", body: Record<string, unknown>) {
  const response = await fetch(`/api/lab-assets${endpoint}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new LabAssetsRequestError(await readLabAssetsError(response), response.status);
  const payload = await response.json() as { revision?: unknown };
  if (typeof payload.revision !== "string") throw new Error("资产服务未返回有效修订版本。");
  return payload.revision;
}

export function batchLabAssets(body: Record<string, unknown>) {
  return mutateLabAssets("/assets/batch", "POST", body);
}

export type AssetImportReport = {
  summary: { total: number; valid: number; warnings: number; errors: number };
  rows: Array<{ index: number; row: Record<string, string>; issues: Array<{ field: string; message: string; severity: "error" | "warning" }> }>;
};

export async function validateLabAssetImport(body: Record<string, unknown>) {
  const response = await fetch("/api/lab-assets/assets/import/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new LabAssetsRequestError(await readLabAssetsError(response), response.status);
  const report = await response.json() as AssetImportReport;
  if (!report?.summary || !Array.isArray(report.rows)) throw new Error("资产导入服务未返回有效校验结果。");
  return report;
}

export function commitLabAssetImport(body: Record<string, unknown>) {
  return mutateLabAssets("/assets/import/commit", "POST", body);
}
