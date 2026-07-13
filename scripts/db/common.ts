import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]; if (!key.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) args.set(key.slice(2), true);
    else { args.set(key.slice(2), value); index += 1; }
  }
  return args;
}

export function requiredArg(args: Map<string, string | boolean>, name: string) {
  const value = args.get(name); if (typeof value !== "string" || !value) throw new Error(`--${name} is required`); return value;
}

export async function writeJson(path: string, value: unknown) {
  const target = resolve(path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(resolve(path), "utf8")) as T; }
export function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function records(value: Record<string, unknown[]>) { return Object.values(value).reduce((sum, rows) => sum + rows.length, 0); }
