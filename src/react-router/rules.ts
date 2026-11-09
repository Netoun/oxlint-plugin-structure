import { basename, dirname, extname, resolve } from "node:path";
import {
  destructuredNames,
  isOwnFolder,
  mayHoldRoutes,
  isRecord,
  namedImports,
  staticString,
  type AstNode,
  type ExportDeclaration,
  type ImportDeclaration,
  type Rule,
  type RuleContext,
  type Visitor,
} from "../eslint.js";
import { appPath, findRouterApp, readRoutes, routesFileOf, type RouterApp, type RoutesIndex } from "./app.js";
import { filePrefix } from "./file-prefix.js";
import featureCycles from "./feature-cycles.js";
import { readSettings, type ReactRouterSettings } from "./settings.js";
import { sharedImports } from "./shared-imports.js";

type RouteHelper = "route" | "layout" | "index";
/** A `route()`/`layout()`/`index()` call: the route module it names, and the config file it is written in. */
type Declaration = { file: string; node: AstNode; hasChildren: boolean; configFile: string };

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

/** A route helper in scope: which one, and the folder its paths start from (null: the app folder). */
type HelperBinding = { helper: RouteHelper; base: string | null };

const ROUTES_MODULE = "@react-router/dev/routes";

/**
 * Visits the files of the app's route config: `routes.ts` and the files it imports through relative
 * specifiers or tsconfig aliases. `check` gets each `route()`/`layout()`/`index()` declaration, imported
 * under any local name or destructured from `relative(import.meta.dirname)`. `onUnchecked` gets each
 * part of the config the rules cannot read (`flatRoutes()`, a computed path, another `relative()`, an
 * import nothing resolves), with the problem and its fix.
 */
function routesFileRule(
  context: RuleContext,
  check: (declaration: Declaration, settings: ReactRouterSettings) => string[],
  onUnchecked?: (node: AstNode, problem: string, configFile: string) => void,
): Visitor {
  const settings = readSettings(context.settings);
  const app = findRouterApp(context.filename);
  const routesFile = app ? routesFileOf(app) : null;
  if (!app || routesFile === null) return {};
  const configFile = appPath(app, context.filename);
  const routes = readRoutes(app, routesFile);
  if (!routes.configFiles.has(configFile)) return {};

  const helpers = new Map<string, HelperBinding>();
  const fileSystemRoutes = new Set<string>();
  const relativeNames = new Set<string>();
  const readRelativeCalls = new Set<AstNode>();
  const unfollowed = routes.unfollowed.get(configFile);
  const onImport = (node: ImportDeclaration | ExportDeclaration) => {
    const source = node.source;
    if (source === null || typeof source.value !== "string" || !unfollowed?.has(source.value)) return;
    onUnchecked?.(
      source,
      `"${source.value}" is not followed, so the routes it declares are not checked → import it with a relative path, or declare its alias in tsconfig.json compilerOptions.paths`,
      configFile,
    );
  };
  return {
    ImportDeclaration(node) {
      onImport(node);
      for (const [local, imported] of namedImports(node)) {
        if (node.source.value === ROUTES_MODULE && isHelper(imported)) helpers.set(local, { helper: imported, base: null });
        if (node.source.value === ROUTES_MODULE && imported === "relative") relativeNames.add(local);
        if (node.source.value === "@react-router/fs-routes" && imported === "flatRoutes") fileSystemRoutes.add(local);
      }
    },
    ExportNamedDeclaration: onImport,
    ExportAllDeclaration: onImport,
    // `const { route, index } = relative(import.meta.dirname)`: helpers whose paths start from this file's folder.
    VariableDeclarator(node) {
      const { init } = node;
      if (init?.type !== "CallExpression" || !("callee" in init) || !("arguments" in init)) return;
      const { callee, arguments: args } = init;
      if (!isRecord(callee) || typeof callee.name !== "string" || !relativeNames.has(callee.name)) return;
      const names = destructuredNames(node.id);
      if (names === null || !Array.isArray(args) || args.length !== 1 || !isOwnFolder(args[0])) return;
      readRelativeCalls.add(init);
      for (const [local, key] of names) {
        if (isHelper(key)) helpers.set(local, { helper: key, base: dirname(resolve(context.filename)) });
      }
    },
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || !("name" in node.callee) || typeof node.callee.name !== "string") return;
      const callee = node.callee.name;
      if (fileSystemRoutes.has(callee)) {
        onUnchecked?.(
          node,
          "file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app",
          configFile,
        );
        return;
      }
      if (relativeNames.has(callee) && !readRelativeCalls.has(node)) {
        onUnchecked?.(
          node,
          "the routes declared through this relative() call are not checked → write const { route, index, layout } = relative(import.meta.dirname)",
          configFile,
        );
        return;
      }
      const binding = helpers.get(callee);
      if (binding === undefined) return;
      const { helper, base } = binding;
      const fileIndex = helper === "route" ? 1 : 0;
      const fileNode = node.arguments[fileIndex];
      if (fileNode === undefined) return;
      const file = staticString(fileNode);
      if (file === null) {
        onUnchecked?.(fileNode, "a route module path is computed, so it is not checked → write it as a string literal", configFile);
        return;
      }
      // `route(path, file, children?)`, `layout(file, children?)`, and with options before the children
      // (`route(path, file, options, children?)`): only the last argument can hold them. `index()` has none.
      const last = helper === "index" ? undefined : node.arguments.slice(fileIndex + 1).at(-1);
      const declaration = {
        file: base === null ? file.replace(/^\.\//, "") : appPath(app, resolve(base, file)),
        node: fileNode,
        hasChildren: last !== undefined && mayHoldRoutes(last),
        configFile,
      };
      for (const problem of check(declaration, settings)) {
        context.report({ node: fileNode, message: `${declaration.file}: ${problem}` });
      }
    },
  };
}

/**
 * Checks files under `featuresDir` that the route config does not declare, and that are not part of
 * it (a route config file is neither a route module nor a loose file). `check` returns one problem or
 * null; it also gets null `routes` when the app has no routes file. The check needs the path alone, so
 * it runs in `create`: only a file with a problem asks oxlint for its AST, to report on `Program`.
 */
export function featureFileRule(
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
  const routesFile = routesFileOf(app);
  const routes = routesFile === null ? null : readRoutes(app, routesFile);
  if (routes?.fileSystemRoutes || routes?.files.has(file) || routes?.configFiles.has(file)) return {};
  const problem = check(file, routes, settings, app);
  if (problem === null) return {};
  return {
    Program(node) {
      context.report({ node, message: `${file}: ${problem}` });
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
      ({ file, configFile }, settings) =>
        file.startsWith(`${settings.featuresDir}/`) && isInRouteFolder(dirname(file), settings)
          ? []
          : [`route modules live in ${routeHome(settings)} → move it there and update ${configFile}`],
      (node, problem, configFile) => context.report({ node, message: `${configFile}: ${problem}` }),
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

const foldersByIndex = new WeakMap<RoutesIndex, ReadonlySet<string>>();

/** The folders route modules sit in; computed once per route index (replaced when the config changes). */
function routeFolders(routes: RoutesIndex): ReadonlySet<string> {
  let folders = foldersByIndex.get(routes);
  if (folders === undefined) foldersByIndex.set(routes, (folders = new Set([...routes.files].map((route) => dirname(route)))));
  return folders;
}

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
      return routeFolders(routes).has(dir) ? `only route modules live in ${routeHome(settings)} → ${moveIt(settings)}` : null;
    }),
};

const KEBAB_NAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;

/** `GameCard.test.tsx` → `game-card.test.tsx`; null when a part has nothing usable left (`$.ts`). */
export function kebabName(name: string): string | null {
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
  "react-router-shared-imports": sharedImports,
  "react-router-file-prefix": filePrefix,
  "react-router-feature-cycles": featureCycles,
};
