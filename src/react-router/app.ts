import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { nearestPackage } from "../package.js";
import { aliasTargets, readPathAliases, type PathAliases } from "../tsconfig.js";

/** A React Router app: the folder `react-router.config.*` sits in (`root`), and its `appDirectory`. */
export type RouterApp = { configName: string; root: string; appDirectory: string; srcDir: string };

/**
 * What the app's route config declares, read from the text of its files: the route modules, the files
 * that make up the config (`routes.ts` and what it imports), whether any of them calls `flatRoutes()`,
 * and, per config file, the imports it could not follow (neither relative, nor an alias, nor a package).
 * Paths are relative to the app's source folder, with `/` separators.
 */
export type RoutesIndex = {
  files: ReadonlySet<string>;
  configFiles: ReadonlySet<string>;
  fileSystemRoutes: boolean;
  unfollowed: ReadonlyMap<string, ReadonlySet<string>>;
};

const CONFIG_NAMES = ["react-router.config.ts", "react-router.config.js", "react-router.config.mjs"];
const ROUTES_NAMES = ["routes.ts", "routes.tsx", "routes.js", "routes.jsx", "routes.mjs"];
const ROUTE_PATH = /["'`]((?:\.\/)?[^"'`\s]+\.[cm]?[jt]sx?)["'`]/g;
const COMMENT = /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
/** `import … from "x"`, `export … from "x"`, `import "x"` and `import("x")`: the specifier is group 1 or 2. */
const MODULE_SPECIFIER = /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;
const RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;
/** `relative(import.meta.dirname)`: the file's route paths start from its own folder. */
const RELATIVE_HELPERS = /\brelative\s*\(\s*(?:import\.meta\.dirname|__dirname)\s*\)/;
const BUILTINS = new Set(builtinModules);
/** A file that imports React Router's route helpers declares routes. */
const ROUTE_HELPERS_IMPORT = /["']@react-router\/(?:dev\/routes|fs-routes)["']/;

export const toPosix = (path: string): string => path.split(sep).join("/");

const appByDir = new Map<string, RouterApp | null>();

function readApp(dir: string, configName: string): RouterApp {
  const config = readFileSync(join(dir, configName), "utf8");
  const appDirectory = /appDirectory\s*:\s*["'`]([^"'`]+)["'`]/.exec(config)?.[1] ?? "app";
  return { configName, root: dir, appDirectory, srcDir: resolve(dir, appDirectory) };
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
 * The file at `base`, as the bundler resolves an import: the exact file, `x` → `x.ts`…, `x.js` → `x.ts`
 * (how ESM TypeScript spells it), a folder → its `index.*`. Null when nothing is there or it lies
 * outside the app's source folder. Every path tried goes into `probed`, so a file that appears later is
 * noticed.
 */
function resolveFile(app: RouterApp, base: string, probed: Map<string, number | null>): string | null {
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

/** `@scope/name/x` → `@scope/name`, `name/x` → `name`. */
const packageName = (specifier: string) =>
  specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

/** Whether `specifier` names a package the bundler finds in `node_modules`, not a file of the app. */
function isPackage(specifier: string, dependencies: ReadonlySet<string>): boolean {
  return (
    specifier.startsWith("node:") ||
    specifier.startsWith("@react-router/") ||
    BUILTINS.has(specifier) ||
    dependencies.has(packageName(specifier))
  );
}

/** Where an import of a route config file leads: a file to read, nothing to read, or nowhere known. */
type Import = { file: string } | "skip" | "unfollowed";

function followImport(
  app: RouterApp,
  from: string,
  specifier: string,
  aliases: PathAliases,
  dependencies: ReadonlySet<string>,
  probed: Map<string, number | null>,
): Import {
  const targets = RELATIVE_SPECIFIER.test(specifier) ? [resolve(dirname(from), specifier)] : aliasTargets(aliases, specifier);
  if (targets === null) return isPackage(specifier, dependencies) ? "skip" : "unfollowed";
  for (const target of targets) {
    const file = resolveFile(app, target, probed);
    if (file !== null) return { file };
  }
  // A path out of the app folder, or a broken import TypeScript reports: no route config to read.
  return "skip";
}

/**
 * Reads `routesFile` and, recursively, every route config file it imports through a relative specifier
 * or an alias of the app's `tsconfig.json`: React Router resolves a route module's path against `appDirectory`
 * whichever file calls `route()`, or against the file's folder through `relative(import.meta.dirname)`.
 * `probed` ends up with the mtime of every path looked at, the cache key.
 */
function scanRoutes(app: RouterApp, routesFile: string, probed: Map<string, number | null>): RoutesIndex {
  const files = new Set<string>();
  const configFiles = new Set<string>();
  const unfollowed = new Map<string, Set<string>>();
  let fileSystemRoutes = false;
  const aliases = readPathAliases(join(app.root, "tsconfig.json"));
  for (const file of aliases.files) probed.set(file, mtimeOf(file));
  const dependencies = nearestPackage(routesFile)?.dependencies ?? new Set<string>();
  const seen = new Set([routesFile]);
  const pending = [routesFile];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const mtime = mtimeOf(file);
    probed.set(file, mtime);
    if (mtime === null) continue;
    const text = readFileSync(file, "utf8").replace(COMMENT, "");
    // A route config file declares routes or only re-exports them (a barrel). Any other file routes.ts
    // reaches (ids, constants) is an ordinary file: its imports are not followed, so a common alias
    // like `@/` does not pull the whole app into the config.
    const reExportsOnly = /\bexport\b/.test(text) && text.replace(MODULE_SPECIFIER, "").replace(/[\s;]/g, "") === "";
    if (file !== routesFile && !ROUTE_HELPERS_IMPORT.test(text) && !reExportsOnly) continue;
    const configFile = appPath(app, file);
    configFiles.add(configFile);
    for (const match of text.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? "";
      const imported = followImport(app, file, specifier, aliases, dependencies, probed);
      if (imported === "unfollowed") {
        unfollowed.set(configFile, (unfollowed.get(configFile) ?? new Set()).add(specifier));
      } else if (imported !== "skip" && !seen.has(imported.file)) {
        seen.add(imported.file);
        pending.push(imported.file);
      }
    }
    // The import specifiers go first: `from "./x.ts"` names a config file, not a route module.
    const code = text.replace(MODULE_SPECIFIER, "");
    // Text alone does not say which helper takes a path: in a file that uses relative() helpers, a path
    // counts both from the app folder and from the file's folder. A wrong reading can only make a file
    // count as routed, never report one.
    const fromFileFolder = RELATIVE_HELPERS.test(code);
    for (const match of code.matchAll(ROUTE_PATH)) {
      const path = match[1] ?? "";
      files.add(path.replace(/^\.\//, ""));
      if (fromFileFolder) files.add(appPath(app, resolve(dirname(file), path)));
    }
    fileSystemRoutes ||= /\bflatRoutes\s*\(/.test(code);
  }
  return { files, configFiles, fileSystemRoutes, unfollowed };
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
