export type PasswordPolicyResult =
  | { success: true }
  | { success: false; issues: string[] };

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const issues: string[] = [];
  if (password.length < 12) issues.push("至少 12 个字符");
  if (!/[A-Z]/.test(password)) issues.push("至少一个大写字母");
  if (!/[a-z]/.test(password)) issues.push("至少一个小写字母");
  if (!/[0-9]/.test(password)) issues.push("至少一个数字");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("至少一个特殊字符");
  return issues.length ? { success: false, issues } : { success: true };
}
