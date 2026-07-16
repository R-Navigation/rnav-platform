export type PasswordPolicyResult =
  | { success: true }
  | { success: false; issues: string[] };

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const issues: string[] = [];
  if (password.length < 8) issues.push("至少 8 个字符");
  return issues.length ? { success: false, issues } : { success: true };
}
