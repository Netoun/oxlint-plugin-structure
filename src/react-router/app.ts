import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** A React Router app: the folder `react-router.config.*` sits in, and its `appDirectory`. */
export type RouterApp = { configName: string; appDirectory: string; srcDir: string };

/**
 * What the app's route config declares, read from the text of its files: the route modules, the files
 * that make up the config (`routes.ts` and what it imports), and whether any of them calls `flatRoutes()`.
 * Paths are relative to the app's source folder, with `/` separators.
 */
export type RoutesIndex = {
  files: ReadonlySet<string>;
  configFiles: ReadonlySet<string>;
  fileSystemRoutes: boolean;
};

const CONFIG_NAMES = ["react-router.config.ts", "react-router.config.js", "react-router.config.mjs"];
const ROUTES_NAMES = ["routes.ts", "routes.tsx", "routes.js", "routes.jsx", "routes.mjs"];
const ROUTE_PATH = /["'`]((?:\.\/)?[^"'`\s]+\.[cm]?[jt]sx?)["'`]/g;
const COMMENT = /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
/** `import … from "x"`, `export … from "x"`, `import "x"` and `import("x")`: the specifier is group 1 or 2. */
const MODULE_SPECIFIER = /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;
const RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;

export const toPosix = (path: string): string => path.split(sep).join("/");

const appByDir = new Map<string, RouterApp | null>();

function readApp(dir: string, configName: string): RouterApp {
  const config = readFileSync(join(dir, configName), "utf8");
  const appDirectory = /appDirectory\s*:\s*["'`]([^"'`]+)["'`]/.exec(config)?.[1] ?? "app";
  return { configName, appDirectory, srcDir: resolve(dir, appDirectory) };
}

/** The React Router app `file` belongs to, or null. The search stops at the nearest package root. */
export function findRouterApp(file: string): RouterApp | null {
  const visited: string[] = [];
  let dir = dirname(resolve(file));
  let app: RouterApp | null = null;
  for (;;) {
    const cached = appByDir.get(dir);
    if (cached !== undefined) {
      app = cached;
      break;
    }
    visited.push(dir);
    const configName = CONFIG_NAMES.find((name) => existsSync(join(dir, name)));
    if (configName !== undefined) {
      app = readApp(dir, configName);
      break;
    }
    const parent = dirname(dir);
    if (existsSync(join(dir, "package.json")) || parent === dir) break;
    dir = parent;
  }
  for (const visitedDir of visited) appByDir.set(visitedDir, app);
  return app;
}

/** The app's routes file, or null when `appDirectory` has none. Not cached: it may appear later. */
export function routesFileOf(app: RouterApp): string | null {
  const name = ROUTES_NAMES.find((candidate) => existsSync(join(app.srcDir, candidate)));
  return name === undefined ? null : join(app.srcDir, name);
}

/** `file` relative to the app's source folder, with `/` separators. */
export const appPath = (app: RouterApp, file: string): string => toPosix(relative(app.srcDir, resolve(file)));

/** `mtimeMs` of the file at `path`; null when there is none (or it is a folder). */
function mtimeOf(path: string): number | null {
  try {
    const stats = statSync(path);
    return stats.isFile() ? stats.mtimeMs : null;
  } catch {
    return null;
  }
}

const isInside = (dir: string, path: string): boolean => {
  const from = relative(dir, path);
  return from !== "" && from !== ".." && !from.startsWith(`..${sep}`) && !isAbsolute(from);
};

/**
 * The file a relative `specifier` names, as the bundler resolves it: the exact file, `./x` → `x.ts`…,
 * `./x.js` → `x.ts` (how ESM TypeScript spells it), a folder → its `index.*`. Null when nothing is there
 * or it lies outside the app's source folder. Every path tried goes into `probed`, so a file that
 * appears later is noticed.
 */
function resolveImport(app: RouterApp, from: string, specifier: string, probed: Map<string, number | null>): string | null {
  const base = resolve(dirname(from), specifier);
  if (!isInside(app.srcDir, base)) return null;
  const stem = base.replace(/\.[cm]?jsx?$/, "");
  const candidates = [
    ...(SOURCE_EXTENSIONS.some((extension) => base.endsWith(extension)) ? [base] : []),
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    const mtime = mtimeOf(candidate);
    probed.set(candidate, mtime);
    if (mtime !== null) return candidate;
  }
  return null;
}

/**
 * Reads `routesFile` and, recursively, every file it imports through a relative specifier: React Router
 * resolves a route module's path against `appDirectory` whichever file calls `route()`, so a config
 * split across files declares its routes the same way. `probed` ends up with the mtime of every path
 * looked at, the cache key.
 */
function scanRoutes(app: RouterApp, routesFile: string, probed: Map<string, number | null>): RoutesIndex {
  const files = new Set<string>();
  const configFiles = new Set<string>();
  let fileSystemRoutes = false;
  const seen = new Set([routesFile]);
  const pending = [routesFile];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const mtime = mtimeOf(file);
    probed.set(file, mtime);
    if (mtime === null) continue;
    configFiles.add(appPath(app, file));
    const text = readFileSync(file, "utf8").replace(COMMENT, "");
    for (const match of text.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? "";
      const imported = RELATIVE_SPECIFIER.test(specifier) ? resolveImport(app, file, specifier, probed) : null;
      if (imported !== null && !seen.has(imported)) {
        seen.add(imported);
        pending.push(imported);
      }
    }
    // The import specifiers go first: `from "./x.ts"` names a config file, not a route module.
    const code = text.replace(MODULE_SPECIFIER, "");
    for (const match of code.matchAll(ROUTE_PATH)) files.add((match[1] ?? "").replace(/^\.\//, ""));
    fileSystemRoutes ||= /\bflatRoutes\s*\(/.test(code);
  }
  return { files, configFiles, fileSystemRoutes };
}

const routesByFile = new Map<string, { probed: ReadonlyMap<string, number | null>; index: RoutesIndex }>();

const isFresh = (probed: ReadonlyMap<string, number | null>): boolean =>
  [...probed].every(([path, mtime]) => mtimeOf(path) === mtime);

/**
 * What the app's route config declares, ignoring commented-out routes: `routesFile` plus the files it
 * imports. Cached until one of them changes, appears or goes away.
 */
export function readRoutes(app: RouterApp, routesFile: string): RoutesIndex {
  const cached = routesByFile.get(routesFile);
  if (cached && isFresh(cached.probed)) return cached.index;
  const probed = new Map<string, number | null>();
  const index = scanRoutes(app, routesFile, probed);
  routesByFile.set(routesFile, { probed, index });
  return index;
}
