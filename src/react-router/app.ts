import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** A React Router app: the folder `react-router.config.*` sits in, and its `appDirectory`. */
export type RouterApp = { configName: string; appDirectory: string; srcDir: string };

/** What a routes file declares, read from its text. */
export type RoutesIndex = { files: ReadonlySet<string>; fileSystemRoutes: boolean };

const CONFIG_NAMES = ["react-router.config.ts", "react-router.config.js", "react-router.config.mjs"];
const ROUTES_NAMES = ["routes.ts", "routes.tsx", "routes.js", "routes.jsx", "routes.mjs"];
const ROUTE_PATH = /["'`]((?:\.\/)?[^"'`\s]+\.[cm]?[jt]sx?)["'`]/g;
const COMMENT = /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm;

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

const routesByFile = new Map<string, { mtimeMs: number; index: RoutesIndex }>();

/** The module paths a routes file declares, ignoring commented-out routes. Cached until it changes. */
export function readRoutes(routesFile: string): RoutesIndex {
  const { mtimeMs } = statSync(routesFile);
  const cached = routesByFile.get(routesFile);
  if (cached?.mtimeMs === mtimeMs) return cached.index;

  const code = readFileSync(routesFile, "utf8").replace(COMMENT, "");
  const index: RoutesIndex = {
    files: new Set([...code.matchAll(ROUTE_PATH)].map((match) => (match[1] ?? "").replace(/^\.\//, ""))),
    fileSystemRoutes: /\bflatRoutes\s*\(/.test(code),
  };
  routesByFile.set(routesFile, { mtimeMs, index });
  return index;
}
