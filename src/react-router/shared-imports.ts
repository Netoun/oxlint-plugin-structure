import { dirname } from "node:path";
import type { AstNode, Rule, Visitor } from "../eslint.js";
import { appPath, findRouterApp, readRoutes, resolveImportPath, routesFileOf } from "./app.js";
import { readSettings } from "./settings.js";

/** React Router's app modules, at the top of the import graph: nothing imports them, so they share nothing. */
const APP_MODULE = /^(root|entry\.client|entry\.server)\.[cm]?[jt]sx?$/;

/** `x.test.tsx` → `x.tsx`: a test stands where the file it tests stands. */
const subjectOf = (file: string) => file.replace(/[.-](test|spec)(\.[cm]?[jt]sx?)$/, "$2");

/** `import("x")`, which the shared `Visitor` type does not list. */
type ImportVisitor = Visitor & { ImportExpression?: (node: AstNode & { source: AstNode }) => void };

/** `features/billing/features/pricing/lib/price.ts` → `features/billing/features/pricing`; null for a file loose in `features/`. */
function featureFolder(file: string, featuresDir: string): string | null {
  const segments = dirname(file).split("/");
  let end = 0;
  segments.forEach((segment, index) => {
    if (segment === featuresDir && index + 1 < segments.length) end = index + 2;
  });
  return end === 0 ? null : segments.slice(0, end).join("/");
}

/**
 * Shared code, a file of the app's source folder outside `featuresDir`, imports no file of a feature:
 * through an import, a type import, a re-export or `import()`. Route modules, route config files and
 * the app modules (`root.tsx`, `entry.*`) are not shared code. Silent with file-system routes, where
 * route modules are unknown (`react-router-location` reports them), and without a routes file.
 */
export const sharedImports: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Shared code (outside features/) imports no file of a feature." },
    schema: [],
  },
  create(context) {
    const settings = readSettings(context.settings);
    const app = findRouterApp(context.filename);
    if (!app) return {};
    const file = appPath(app, context.filename);
    const subject = subjectOf(file);
    if (file.startsWith("../") || file.startsWith(`${settings.featuresDir}/`) || APP_MODULE.test(subject)) return {};
    const routesFile = routesFileOf(app);
    if (routesFile === null) return {};
    const routes = readRoutes(app, routesFile);
    if (routes.fileSystemRoutes || routes.files.has(subject) || routes.configFiles.has(file)) return {};

    const check = (source: (AstNode & { value: unknown }) | null) => {
      if (source === null || typeof source.value !== "string") return;
      const target = resolveImportPath(app, context.filename, source.value);
      const imported = target === null ? null : appPath(app, target);
      if (imported === null || !imported.startsWith(`${settings.featuresDir}/`)) return;
      const feature = featureFolder(imported, settings.featuresDir);
      const fix =
        feature === null
          ? `move what it imports out of ${settings.featuresDir}/`
          : `move it into ${feature}, or move what it imports out of the feature`;
      context.report({ node: source, message: `${file}: shared code imports ${imported} → ${fix}` });
    };
    const visitor: ImportVisitor = {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => {
        if ("value" in node.source) check(node.source);
      },
    };
    return visitor;
  },
};
