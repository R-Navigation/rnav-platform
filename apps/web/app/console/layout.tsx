import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/features/console/ConsoleShell";
import { ConsoleState } from "@/features/console/ConsoleState";
import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { ConsolePasswordGate } from "@/features/console/ConsolePasswordGate";

export default async function ConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const result = await getConsoleBootstrap();

  if (result.status === "anonymous") {
    redirect("/login?next=/console");
  }
  if (result.status === "forbidden") {
    return (
      <ConsoleState
        description="当前账号已登录，但没有访问管理控制台的权限。请联系管理员调整账号权限。"
        title="无控制台访问权限"
      />
    );
  }
  if (result.status === "error") {
    return <ConsoleState description={result.message} title="控制台暂时不可用" />;
  }

  const { consoleModules, user } = result.data;

  return <ConsoleShell modules={consoleModules} user={user}><ConsolePasswordGate required={user.mustChangePassword}>{children}</ConsolePasswordGate></ConsoleShell>;
}
