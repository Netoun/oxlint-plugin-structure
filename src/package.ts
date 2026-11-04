import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isRecord } from "./eslint.js";

/** The nearest package around a file: its folder and every dependency name it declares. */
export type PackageInfo = { dir: string; dependencies: ReadonlySet<string> };

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const packageByDir = new Map<string, PackageInfo | null>();

function readPackage(dir: string): PackageInfo {
  const manifest: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const dependencies = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = isRecord(manifest) ? manifest[field] : undefined;
    if (isRecord(deps)) for (const name of Object.keys(deps)) dependencies.add(name);
  }
  return { dir, dependencies };
}

/** The package whose `package.json` is nearest above `file`, or null. */
export function nearestPackage(file: string): PackageInfo | null {
  const visited: string[] = [];
  let dir = dirname(resolve(file));
  let found: PackageInfo | null = null;
  for (;;) {
    const cached = packageByDir.get(dir);
    if (cached !== undefined) {
      found = cached;
      break;
    }
    visited.push(dir);
    if (existsSync(join(dir, "package.json"))) {
      found = readPackage(dir);
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const visitedDir of visited) packageByDir.set(visitedDir, found);
  return found;
}
