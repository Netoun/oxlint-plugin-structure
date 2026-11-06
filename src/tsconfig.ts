import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isRecord } from "./eslint.js";

/** One entry of `compilerOptions.paths`: `@/*` → prefix `@/`, suffix ``, targets made absolute. */
type Alias = { prefix: string; suffix: string; wildcard: boolean; targets: readonly string[] };

/** The aliases a tsconfig declares, and every config file read to find them (the cache key). */
export type PathAliases = { aliases: readonly Alias[]; files: readonly string[] };

/** The index after the string that opens at `start`, escapes included. */
function stringEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
  return index + 1;
}

/** JSON as tsconfig writes it: comments and trailing commas allowed. Throws on anything else. */
function parseJsonc(text: string): unknown {
  let json = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      const end = stringEnd(text, index);
      json += text.slice(index, end);
      index = end - 1;
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index++;
      json += "\n";
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 1;
    } else if (char === "," && /^\s*[}\]]/.test(text.slice(index + 1))) {
      // A trailing comma: dropped.
    } else {
      json += char;
    }
  }
  return JSON.parse(json);
}

type Options = { paths?: { value: Record<string, unknown>; dir: string }; baseUrl?: string };

/**
 * The `paths` and `baseUrl` a tsconfig ends up with, its relative `extends` merged first, as TypeScript
 * does: a key the file sets replaces the inherited one. An unreadable file adds nothing.
 */
function readOptions(file: string, files: string[]): Options {
  if (files.includes(file)) return {};
  files.push(file);
  let config: unknown;
  try {
    config = parseJsonc(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (!isRecord(config)) return {};
  const dir = dirname(file);
  const parents = Array.isArray(config.extends) ? config.extends : [config.extends];
  let options: Options = {};
  for (const parent of parents) {
    if (typeof parent !== "string" || !/^\.{1,2}\//.test(parent)) continue;
    const path = resolve(dir, parent);
    options = { ...options, ...readOptions(existsSync(path) || path.endsWith(".json") ? path : `${path}.json`, files) };
  }
  const own = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  if (isRecord(own.paths)) options.paths = { value: own.paths, dir };
  if (typeof own.baseUrl === "string") options.baseUrl = resolve(dir, own.baseUrl);
  return options;
}

/**
 * The aliases of `tsconfig` (`compilerOptions.paths`), the way Vite's `tsconfigPaths` reads them:
 * targets relative to `baseUrl`, else to the file that declares `paths`.
 */
export function readPathAliases(tsconfig: string): PathAliases {
  const files: string[] = [];
  const { paths, baseUrl } = readOptions(tsconfig, files);
  if (paths === undefined) return { aliases: [], files };
  const base = baseUrl ?? paths.dir;
  const aliases: Alias[] = [];
  for (const [pattern, targets] of Object.entries(paths.value)) {
    if (!Array.isArray(targets)) continue;
    const [prefix = "", suffix = ""] = pattern.split("*");
    aliases.push({
      prefix,
      suffix,
      wildcard: pattern.includes("*"),
      targets: targets.filter((target) => typeof target === "string").map((target) => resolve(base, target)),
    });
  }
  return { aliases, files };
}

/**
 * The paths `specifier` may point at through an alias, in order; null when no alias matches. An exact
 * entry wins, then the wildcard with the longest prefix, as in TypeScript.
 */
export function aliasTargets({ aliases }: PathAliases, specifier: string): string[] | null {
  const exact = aliases.find((alias) => !alias.wildcard && alias.prefix === specifier);
  if (exact) return [...exact.targets];
  const matching = aliases
    .filter((alias) => alias.wildcard && specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix))
    .filter((alias) => specifier.length >= alias.prefix.length + alias.suffix.length)
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const alias = matching[0];
  if (alias === undefined) return null;
  const captured = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
  return alias.targets.map((target) => target.replace("*", captured));
}
