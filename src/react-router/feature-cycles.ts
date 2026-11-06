import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { staticString, type AstNode, type ExportDeclaration, type ImportDeclaration, type Rule, type Visitor } from "../eslint.js";
import { appPath, findRouterApp, resolveImportPath, type RouterApp } from "./app.js";
import { readSettings, type ReactRouterSettings } from "./settings.js";

/**
 * `react-router-feature-cycles`: feature A imports feature B and B imports A, so neither can move or be
 * understood alone. Only the side with fewer imports is reported, once per file it imports: it is the
 * cheaper side to fix. An import counts as a distinct (file, imported file) pair, tests left out on both
 * sides. Telling the cycle requires the other feature's imports, so the rule reads the files of the
 * features involved, each cached until its mtime changes.
 */

type ImportExpression = AstNode & { type: "ImportExpression"; source: AstNode };
/** `import("x")` and `Program:exit` are not in the shared `Visitor`: this rule alone listens to them. */
type CyclesVisitor = Visitor & {
  ImportExpression?: (node: ImportExpression) => void;
  "Program:exit"?: (node: AstNode) => void;
};

const SOURCE_FILE = /\.(?:tsx?|jsx?|mjs)$/;
const isTest = (file: string) => /[.-](test|spec)\.[cm]?[jt]sx?$/.test(file) || file.endsWith(".d.ts");
// The same reading of a file's imports as the route config's (`app.ts`): comments out, then each specifier.
const COMMENT = /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm;
const MODULE_SPECIFIER = /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** Where a file's imports lead inside the app's source folder, as app paths. Cached by mtime. */
const importsByFile = new Map<string, { mtime: number; tsconfig: number | null; targets: readonly string[] }>();

function importsOf(app: RouterApp, file: string, tsconfig: number | null): readonly string[] {
  const mtime = mtimeOf(file);
  if (mtime === null) return [];
  const cached = importsByFile.get(file);
  if (cached?.mtime === mtime && cached.tsconfig === tsconfig) return cached.targets;
  const targets = new Set<string>();
  const text = readFileSync(file, "utf8").replace(COMMENT, "");
  for (const match of text.matchAll(MODULE_SPECIFIER)) {
    const target = resolveImportPath(app, file, match[1] ?? match[2] ?? "");
    if (target !== null) targets.add(appPath(app, target));
  }
  const entry = { mtime, tsconfig, targets: [...targets] };
  importsByFile.set(file, entry);
  return entry.targets;
}

/** The source files of a feature folder, tests left out. Cached until a folder in it changes. */
const filesByFeature = new Map<string, { dirs: ReadonlyMap<string, number | null>; files: readonly string[] }>();

function featureFiles(featureDir: string): readonly string[] {
  const cached = filesByFeature.get(featureDir);
  if (cached && [...cached.dirs].every(([dir, mtime]) => mtimeOf(dir) === mtime)) return cached.files;
  const dirs = new Map<string, number | null>();
  const files: string[] = [];
  const walk = (dir: string) => {
    dirs.set(dir, mtimeOf(dir));
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") walk(path);
      else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !isTest(entry.name)) files.push(path);
    }
  };
  walk(featureDir);
  filesByFeature.set(featureDir, { dirs, files });
  return files;
}

/** The feature an app path belongs to: `features/<feature>/…`; null for a file loose in `features/` or outside. */
function featureOf(path: string, settings: ReactRouterSettings): string | null {
  const segments = path.split("/");
  return segments.length > 2 && segments[0] === settings.featuresDir ? (segments[1] ?? null) : null;
}

const plural = (count: number) => `${count} import${count === 1 ? "" : "s"}`;

const featureCycles: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Two features never import each other: the side with fewer imports moves what it uses out, or the two merge.",
    },
    schema: [],
  },
  create(context) {
    const settings = readSettings(context.settings);
    const app = findRouterApp(context.filename);
    if (!app) return {};
    const file = appPath(app, context.filename);
    const feature = featureOf(file, settings);
    if (feature === null || isTest(file) || settings.sharedFeatures.includes(feature)) return {};

    const tsconfig = mtimeOf(join(app.root, "tsconfig.json"));
    const featuresRoot = join(app.srcDir, settings.featuresDir);
    /** Per feature: target feature → distinct (file, target file) pairs into it. Read once per linted file. */
    const outgoing = new Map<string, Map<string, number>>();
    const importCount = (from: string, to: string) => {
      let counts = outgoing.get(from);
      if (counts === undefined) {
        counts = new Map();
        for (const source of featureFiles(join(featuresRoot, from))) {
          for (const target of importsOf(app, source, tsconfig)) {
            const into = featureOf(target, settings);
            if (into !== null && into !== from && !isTest(target)) counts.set(into, (counts.get(into) ?? 0) + 1);
          }
        }
        outgoing.set(from, counts);
      }
      return counts.get(to) ?? 0;
    };
    // This file's imports are read the way the index reads every file, so both sides are counted alike, and
    // the AST is only walked, to find the import to report on, when one of them is on a cycle's minority side.
    const filename = resolve(context.filename);
    const dir = settings.featuresDir;
    /** Target app path → message, for each import to report. */
    const due = new Map<string, string>();
    for (const target of importsOf(app, filename, tsconfig)) {
      const other = featureOf(target, settings);
      if (other === null || other === feature || settings.sharedFeatures.includes(other) || isTest(target)) continue;
      const theirs = importCount(other, feature);
      const mine = importCount(feature, other);
      // The minority side is reported; on a tie, the side of the feature whose name sorts first.
      if (theirs === 0 || mine > theirs || (mine === theirs && feature > other)) continue;
      const moved = target.slice(`${dir}/${other}/`.length);
      due.set(
        target,
        `${file}: imports ${dir}/${other}, which imports ${dir}/${feature} (${plural(theirs)}) → move ${moved} out of ${other} (to lib/ or ${feature}), or merge the two features`,
      );
    }
    if (due.size === 0) return {};

    const onSource = (source: AstNode | null | undefined) => {
      const specifier = source ? staticString(source) : null;
      if (!source || specifier === null) return;
      const resolved = resolveImportPath(app, filename, specifier);
      const target = resolved === null ? null : appPath(app, resolved);
      const message = target === null ? undefined : due.get(target);
      if (target === null || message === undefined) return;
      // Once per imported file, on its first import.
      due.delete(target);
      context.report({ node: source, message });
    };
    const visitor: CyclesVisitor = {
      ImportDeclaration: (node: ImportDeclaration) => onSource(node.source),
      ExportNamedDeclaration: (node: ExportDeclaration) => onSource(node.source),
      ExportAllDeclaration: (node: ExportDeclaration) => onSource(node.source),
      ImportExpression: (node: ImportExpression) => onSource(node.source),
      // An import the text reading found and the AST does not hold (the file on disk differs from the one
      // linted): still reported, on the file.
      "Program:exit": (node: AstNode) => {
        for (const message of due.values()) context.report({ node, message });
      },
    };
    return visitor;
  },
};

export default featureCycles;
