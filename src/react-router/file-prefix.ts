import { basename, dirname } from "node:path";
import type { Rule } from "../eslint.js";
import type { RoutesIndex } from "./app.js";
import { featureFileRule, kebabName } from "./rules.js";
import type { ReactRouterSettings } from "./settings.js";

/** A folder a file's name may start with; `isFeature` when it surely is a feature, so a fix may name it. */
type NameFolder = { prefix: string; isFeature: boolean };

/** `games` → `game`, `categories` → `category`: a feature's files may use the singular. */
const singular = (name: string) => name.replace(/ies$/, "y").replace(/s$/, "");

const INDEX = /^index\.[cm]?[jt]sx?$/;

/** Folders that hold route modules: `features/game` for `features/game/pages/game-page.tsx` (mode pages). */
function routedFolders(routes: RoutesIndex, settings: ReactRouterSettings): Set<string> {
  return new Set(
    [...routes.files].map((route) => {
      const dir = dirname(route);
      return settings.mode === "pages" && basename(dir) === settings.routeFolder ? dirname(dir) : dir;
    }),
  );
}

/**
 * The folders a file in `dir` may be named after, nearest last: from `featuresDir` down to the first
 * layer folder (`components/`, `pages/`…), `featuresDir` itself left out. The folder right after a
 * `featuresDir` always counts, even one named like a layer (`features/pages/`), and is a feature; so is
 * a folder that holds route modules (`features/admin/program/pages/`, a flat-mode sub-feature).
 * `features/billing/features/pricing/lib` → billing, pricing; `features/game/components/card` → game.
 */
function nameFolders(dir: string, routed: ReadonlySet<string>, settings: ReactRouterSettings): NameFolder[] {
  const layers = new Set(settings.nonRouteFolders);
  if (settings.mode === "pages") layers.add(settings.routeFolder);
  const segments = dir.split("/");
  const folders: NameFolder[] = [];
  for (const [index, segment] of segments.entries()) {
    if (segment === settings.featuresDir) continue;
    const afterFeaturesDir = segments[index - 1] === settings.featuresDir;
    if (!afterFeaturesDir && layers.has(segment)) break;
    const path = segments.slice(0, index + 1).join("/");
    folders.push({ prefix: kebabName(segment) ?? segment, isFeature: afterFeaturesDir || routed.has(path) });
  }
  return folders;
}

export const filePrefix: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Every file of a feature that is not a route module starts with its feature: features/game/… → game-…" },
    schema: [],
  },
  create: (context) =>
    featureFileRule(context, (file, routes, settings) => {
      const name = basename(file);
      // Without a routes file, route modules cannot be told apart (no-loose-files reports it). An index
      // file is named by module resolution, not by its author.
      if (routes === null || INDEX.test(name)) return null;
      // A shared feature (`features/common/`) is named after what it holds, as feature-cycles treats it.
      const segments = dirname(file).split("/");
      const featuresAt = segments.indexOf(settings.featuresDir);
      const top = featuresAt === -1 ? undefined : segments[featuresAt + 1];
      if (top !== undefined && settings.sharedFeatures.includes(top)) return null;
      const folders = nameFolders(dirname(file), routedFolders(routes, settings), settings);
      // None for a file loose in features/, which no-loose-files reports.
      const feature = folders.filter(({ isFeature }) => isFeature).at(-1);
      if (feature === undefined) return null;
      const kebab = kebabName(name) ?? name;
      const hook = kebab.startsWith("use-") ? "use-" : "";
      const stem = kebab.slice(hook.length);
      const prefixes = folders.flatMap(({ prefix }) => [prefix, singular(prefix)]);
      if (prefixes.some((prefix) => stem.startsWith(`${prefix}-`) || stem.startsWith(`${prefix}.`))) return null;
      return `the name does not start with its feature → rename it ${hook}${feature.prefix}-…`;
    }),
};
