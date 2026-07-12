type ErrorIssue = { message?: unknown; path?: unknown };

const statusMessages: Record<number, string> = {
  400: "提交内容未通过验证。",
  401: "登录状态已失效，请重新登录。",
  403: "当前账号没有执行此操作的权限。",
  409: "内容已被其他人更新，请重新加载最新版本。",
  502: "官网管理服务暂时不可用，请稍后重试。",
};

export function parseSiteAdminError(payload: unknown, status: number) {
  const data = payload && typeof payload === "object" ? payload as { error?: unknown; issues?: unknown } : {};
  const message = typeof data.error === "string" ? data.error : statusMessages[status] ?? `请求失败（${status}）。`;
  if (!Array.isArray(data.issues) || data.issues.length === 0) return message;

  const details = data.issues
    .map((issue: ErrorIssue) => {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      const issueMessage = typeof issue.message === "string" ? issue.message : "内容无效";
      return path ? `${path} - ${issueMessage}` : issueMessage;
    })
    .join("；");
  return `${message}: ${details}`;
}

export async function readSiteAdminError(response: Response) {
  try {
    return parseSiteAdminError(await response.json(), response.status);
  } catch {
    return parseSiteAdminError({}, response.status);
  }
}
