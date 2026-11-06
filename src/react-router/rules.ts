import { basename, dirname, extname } from "node:path";
import {
  isNonEmptyArray,
  namedImports,
  staticString,
  type AstNode,
  type Rule,
  type RuleContext,
  type Visitor,
} from "../eslint.js";
import { appPath, findRouterApp, readRoutes, routesFileOf, type RouterApp, type RoutesIndex } from "./app.js";
import { readSettings, type ReactRouterSettings } from "./settings.js";

type RouteHelper = "route" | "layout" | "index";
type Declaration = { file: string; node: AstNode; hasChildren: boolean };

const HELPERS: readonly string[] = ["route", "layout", "index"];
const isHelper = (name: string): name is RouteHelper => HELPERS.includes(name);
const COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx"]);
const isTest = (file: string) => /[.-](test|spec)\.[cm]?[jt]sx?$/.test(file) || file.endsWith(".d.ts");

/** `*-page.tsx or *-redirect.tsx`, `*-page.tsx, *-redirect.tsx and *-layout.tsx`. */
function suffixList(suffixes: readonly string[], extension: string, last: "or" | "and"): string {
  const items = suffixes.map((suffix) => `*-${suffix}${extension}`);
  return items.length === 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;
}

const routeHome = (settings: ReactRouterSettings) =>
  settings.mode === "pages"
    ? `${settings.featuresDir}/<feature>/${settings.routeFolder}/`
    : `${settings.featuresDir}/<feature>/`;

const moveIt = (settings: ReactRouterSettings) =>
  `move it to a subfolder (${settings.nonRouteFolders.slice(0, 3).map((folder) => `${folder}/`).join(", ")}…)`;

function isInRouteFolder(dir: string, settings: ReactRouterSettings): boolean {
  const segments = dir.split("/");
  const last = segments.at(-1) ?? "";
  if (settings.mode === "pages") return last === settings.routeFolder && segments.at(-3) === settings.featuresDir;
  return segments.length > 1 && last !== settings.featuresDir && !settings.nonRouteFolders.includes(last);
}

/** Feature folder names a route module may be prefixed with: `features/a/features/b/pages` → a, b. */
function featureNames(dir: string, settings: ReactRouterSettings): string[] {
  const segments = dir.split("/").filter((segment) => segment !== settings.featuresDir);
  if (settings.mode === "pages" && segments.at(-1) === settings.routeFolder) segments.pop();
  return segments;
}

const reservedSuffix = (settings: ReactRouterSettings) =>
  new RegExp(`-(${[...settings.leafSuffixes, ...settings.layoutSuffixes].join("|")})\\.[jt]sx$`);

/**
 * Visits the app's routes file only. `check` gets each `route()`/`layout()`/`index()` declaration,
 * imported under any local name; `onFileSystemRoutes` gets each `flatRoutes()` call.
 */
function routesFileRule(
  context: RuleContext,
  check: (declaration: Declaration, settings: ReactRouterSettings) => string[],
  onFileSystemRoutes?: (node: AstNode, routesFile: string) => void,
): Visitor {
  const settings = readSettings(context.settings);
  const app = findRouterApp(context.filename);
  const routesFile = app ? routesFileOf(app) : null;
  if (!app || routesFile === null || appPath(app, routesFile) !== appPath(app, context.filename)) return {};

  const helpers = new Map<string, RouteHelper>();
  const fileSystemRoutes = new Set<string>();
  return {
    ImportDeclaration(node) {
      for (const [local, imported] of namedImports(node)) {
        if (node.source.value === "@react-router/dev/routes" && isHelper(imported)) helpers.set(local, imported);
        if (node.source.value === "@react-router/fs-routes" && imported === "flatRoutes") fileSystemRoutes.add(local);
      }
    },
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || !("name" in node.callee) || typeof node.callee.name !== "string") return;
      const callee = node.callee.name;
      if (fileSystemRoutes.has(callee)) {
        onFileSystemRoutes?.(node, appPath(app, routesFile));
        return;
      }
      const helper = helpers.get(callee);
      if (helper === undefined) return;
      const fileNode = helper === "route" ? node.arguments[1] : node.arguments[0];
      const file = staticString(fileNode);
      if (fileNode === undefined || file === null) return;
      const declaration = {
        file: file.replace(/^\.\//, ""),
        node: fileNode,
        hasChildren: node.arguments.slice(1).some(isNonEmptyArray),
      };
      for (const problem of check(declaration, settings)) {
        context.report({ node: fileNode, message: `${declaration.file}: ${problem}` });
      }
    },
  };
}

/**
 * Visits files under `featuresDir` that the routes file does not declare. `check` returns one
 * problem or null; it also gets null `routes` when the app has no routes file.
 */
function featureFileRule(
  context: RuleContext,
  check: (
    file: string,
    routes: RoutesIndex | null,
    settings: ReactRouterSettings,
    app: RouterApp,
  ) => string | null,
): Visitor {
  const settings = readSettings(context.settings);
  const app = findRouterApp(context.filename);
  if (!app) return {};
  const file = appPath(app, context.filename);
  if (!file.startsWith(`${settings.featuresDir}/`) || isTest(file)) return {};
  return {
    Program(node) {
      const routesFile = routesFileOf(app);
      const routes = routesFile === null ? null : readRoutes(routesFile);
      if (routes?.fileSystemRoutes || routes?.files.has(file)) return;
      const problem = check(file, routes, settings, app);
      if (problem !== null) context.report({ node, message: `${file}: ${problem}` });
    },
  };
}

const roleSuffix: Rule = {
  meta: {
    type: "problem",
    docs: { description: "A route module with child routes is named *-layout; a leaf route, *-page or *-redirect." },
    schema: [],
  },
  create: (context) =>
    routesFileRule(context, ({ file, hasChildren }, settings) => {
      const extension = extname(file);
      if (!COMPONENT_EXTENSIONS.has(extension)) return [];
      const name = basename(file, extension);
      const suffixes = hasChildren ? settings.layoutSuffixes : settings.leafSuffixes;
      if (suffixes.some((suffix) => name.endsWith(`-${suffix}`))) return [];
      return [
        hasChildren
          ? `has child routes, so it is a layout → name it ${suffixList(suffixes, extension, "or")}`
          : `leaf route → name it ${suffixList(suffixes, extension, "or")}`,
      ];
    }),
};

const featurePrefix: Rule = {
  meta: {
    type: "problem",
    docs: { description: "A route module's name starts with its feature: features/game/… → game-…" },
    schema: [],
  },
  create: (context) =>
    routesFileRule(context, ({ file }, settings) => {
      if (!file.startsWith(`${settings.featuresDir}/`) || !COMPONENT_EXTENSIONS.has(extname(file))) return [];
      const features = featureNames(dirname(file), settings);
      const name = basename(file);
      if (features.length === 0 || features.some((feature) => name.startsWith(`${feature}-`))) return [];
      return [`the name does not start with its feature → rename it ${features.at(-1)}-…`];
    }),
};

const location: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Route modules live in one place: features/<f>/pages/ (mode pages) or features/<f>/ (mode flat)." },
    schema: [],
  },
  create: (context) =>
    routesFileRule(
      context,
      ({ file }, settings) =>
        file.startsWith(`${settings.featuresDir}/`) && isInRouteFolder(dirname(file), settings)
          ? []
          : [`route modules live in ${routeHome(settings)} → move it there and update routes.ts`],
      (node, routesFile) =>
        context.report({
          node,
          message: `${routesFile}: file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app`,
        }),
    ),
};

const reservedSuffixes: Rule = {
  meta: {
    type: "problem",
    docs: { description: "The route suffixes (-page, -layout, -redirect) belong to files declared in routes.ts." },
    schema: [],
  },
  create: (context) =>
    featureFileRule(context, (file, routes, settings) => {
      if (routes === null || !reservedSuffix(settings).test(file)) return null;
      const all = suffixList([...settings.leafSuffixes, ...settings.layoutSuffixes], extname(file), "and");
      return `${all} are reserved for files declared in routes.ts → rename it, or route it`;
    }),
};

const noLooseFiles: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Only route modules live where route modules live; other files go to subfolders." },
    schema: [],
  },
  create: (context) =>
    featureFileRule(context, (file, routes, settings, app) => {
      if (routes === null) {
        return `${app.configName} points at ${app.appDirectory}/, which has no routes.ts → add ${app.appDirectory}/routes.ts, or fix appDirectory`;
      }
      if (reservedSuffix(settings).test(file)) return null;
      const dir = dirname(file);
      const segments = dir.split("/");
      if (segments.at(-1) === settings.featuresDir) {
        return `no loose file directly in ${settings.featuresDir}/ → move it into a feature`;
      }
      if (settings.mode === "pages") {
        if (segments.at(-2) === settings.featuresDir) return `no loose file at a feature root → ${moveIt(settings)}`;
        if (isInRouteFolder(dir, settings)) return `only route modules live in ${routeHome(settings)} → ${moveIt(settings)}`;
        return null;
      }
      const routeFolders = new Set([...routes.files].map((route) => dirname(route)));
      return routeFolders.has(dir) ? `only route modules live in ${routeHome(settings)} → ${moveIt(settings)}` : null;
    }),
};

const KEBAB_NAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;

/** `GameCard.test.tsx` → `game-card.test.tsx`; null when a part has nothing usable left (`$.ts`). */
function kebabName(name: string): string | null {
  const parts = name.split(".").map((part) =>
    part
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase(),
  );
  return parts.every((part) => part !== "") ? parts.join(".") : null;
}

const fileCase: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Every file under features/ is named in kebab-case: game-card.tsx." },
    schema: [],
  },
  create(context) {
    const settings = readSettings(context.settings);
    const app = findRouterApp(context.filename);
    if (!app) return {};
    const file = appPath(app, context.filename);
    const name = basename(file);
    if (!file.startsWith(`${settings.featuresDir}/`) || KEBAB_NAME.test(name)) return {};
    const fix = kebabName(name);
    return {
      Program(node) {
        context.report({
          node,
          message: `${file}: the name is not kebab-case → rename it ${fix ?? "with lowercase words joined by -"}`,
        });
      },
    };
  },
};

const CONTENT_FOLDERS = ["hooks", "components", "lib", "utils"] as const;
type ContentFolder = (typeof CONTENT_FOLDERS)[number];
const isContentFolder = (name: string): name is ContentFolder => CONTENT_FOLDERS.some((folder) => folder === name);

/** The nearest hooks/components/lib/utils folder `dir` sits in. A feature named `hooks` is not one. */
function contentFolder(dir: string, settings: ReactRouterSettings): ContentFolder | undefined {
  const segments = dir.split("/");
  let found: ContentFolder | undefined;
  segments.forEach((segment, index) => {
    const isFeatureName = segments[index - 1] === settings.featuresDir;
    if (segment !== settings.featuresDir && !isFeatureName && isContentFolder(segment)) found = segment;
  });
  return found;
}

/** What is wrong with `name` in `folder`, with where it goes; null when it belongs there. */
function contentsProblem(folder: ContentFolder, name: string): string | null {
  const extension = extname(name);
  const isComponent = COMPONENT_EXTENSIONS.has(extension);
  switch (folder) {
    case "hooks":
      return name.startsWith("use-") ? null : `hooks/ holds hooks → name it use-…${extension}, or move it to lib/`;
    case "components":
      return isComponent
        ? null
        : `components/ holds components (.tsx) → move it to ${name.startsWith("use-") ? "hooks/" : "lib/"}`;
    case "lib":
    case "utils":
      return isComponent ? `${folder}/ holds no component → move it to components/` : null;
  }
}

const folderContents: Rule = {
  meta: {
    type: "problem",
    docs: { description: "hooks/ holds use-* files, components/ holds .tsx, lib/ and utils/ hold no component." },
    schema: [],
  },
  create(context) {
    const settings = readSettings(context.settings);
    const app = findRouterApp(context.filename);
    if (!app) return {};
    const file = appPath(app, context.filename);
    if (!file.startsWith(`${settings.featuresDir}/`) || isTest(file)) return {};
    const folder = contentFolder(dirname(file), settings);
    const problem = folder === undefined ? null : contentsProblem(folder, basename(file));
    if (problem === null) return {};
    return {
      Program(node) {
        context.report({ node, message: `${file}: ${problem}` });
      },
    };
  },
};

export const reactRouterRules: Record<string, Rule> = {
  "react-router-role-suffix": roleSuffix,
  "react-router-feature-prefix": featurePrefix,
  "react-router-location": location,
  "react-router-reserved-suffixes": reservedSuffixes,
  "react-router-no-loose-files": noLooseFiles,
  "react-router-file-case": fileCase,
  "react-router-folder-contents": folderContents,
};
