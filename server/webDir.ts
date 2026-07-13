import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveWebDir(
  moduleUrl: string,
  exists: (path: string) => boolean = existsSync
) {
  const serverDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    resolve(serverDir, "../apps/web"),
    resolve(serverDir, "../../apps/web")
  ];
  const webDir = candidates.find((candidate) =>
    exists(resolve(candidate, "package.json"))
  );

  if (!webDir) {
    throw new Error("Could not locate the Next.js app directory");
  }
  return webDir;
}
