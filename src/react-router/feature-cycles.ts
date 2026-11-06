import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { staticString, type AstNode, type ExportDeclaration, type ImportDeclaration, type Rule, type Visitor } from "../eslint.js";
import { appPath, findRouterApp, resolveImportPath, type RouterApp } from "./app.js";
import { readSettings, type ReactRouterSettings } from "./settings.js";

/**
 * `react-router-feature-cycles`: feature A imports feature B and B imports A, so neither can move or be
 * understood alone. Only the side with fewer imports is reported, once per file it imports: it is the
 * cheaper side to fix. An import counts as a distinct (file, imported file) pair, tests left out on both
 * sides. Telling the cycle requires the other feature's imports, so the rule reads the files of the
 * features involved once and keeps what they import. A file is read again when it is linted and has
 * changed, when a folder of its feature changes (a file added, removed or saved through a rename), or
 * when tsconfig.json changes. So an edit made in place, outside the editor, to another feature's file
 * shows once that file is linted or its folder changes: checking every file of both features for each
 * linted file cost a stat per file of the two features, for every file.
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
    return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? null;
  } catch {
    return null;
  }
}

/** Where a file's imports lead inside the app's source folder, as app paths, read at `mtime`. */
type Imports = { mtime: number; tsconfig: number | null; targets: readonly string[] };
const importsByFile = new Map<string, Imports>();

function readImports(app: RouterApp, file: string, mtime: number, tsconfig: number | null): Imports {
  const targets = new Set<string>();
  const text = readFileSync(file, "utf8").replace(COMMENT, "");
  for (const match of text.matchAll(MODULE_SPECIFIER)) {
    const target = resolveImportPath(app, file, match[1] ?? match[2] ?? "");
    if (target !== null) targets.add(appPath(app, target));
  }
  const entry = { mtime, tsconfig, targets: [...targets] };
  importsByFile.set(file, entry);
  return entry;
}

/** The imports of `file` as it is on disk now, and whether they differ from the ones read before. */
function freshImports(app: RouterApp, file: string, tsconfig: number | null): { targets: readonly string[]; changed: boolean } {
  const mtime = mtimeOf(file);
  const cached = importsByFile.get(file);
  if (mtime === null) {
    importsByFile.delete(file);
    return { targets: [], changed: cached !== undefined };
  }
  if (cached?.mtime === mtime && cached.tsconfig === tsconfig) return { targets: cached.targets, changed: false };
  const { targets } = readImports(app, file, mtime, tsconfig);
  const same = cached !== undefined && cached.targets.length === targets.length && cached.targets.every((target, index) => targets[index] === target);
  return { targets, changed: !same };
}

/** The folders of a feature with their mtimes, and its source files, tests left out. */
function walkFeature(featureDir: string): { dirs: ReadonlyMap<string, number | null>; files: readonly string[] } {
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
  return { dirs, files };
}

/**
 * Per feature folder: its folders and files, and how many distinct (file, imported file) pairs go into
 * each other feature. `counts` is null when one of its files changed: counted again from `importsByFile`.
 */
type Feature = {
  dirs: ReadonlyMap<string, number | null>;
  files: readonly string[];
  counts: ReadonlyMap<string, number> | null;
  tsconfig: number | null;
};
const featuresByDir = new Map<string, Feature>();

/** The feature's imports into each other feature. Checks its folders, not each of its files. */
function outgoing(app: RouterApp, featureDir: string, name: string, tsconfig: number | null, settings: ReactRouterSettings): ReadonlyMap<string, number> {
  let feature = featuresByDir.get(featureDir);
  const changedDirs = feature === undefined ? [] : [...feature.dirs].filter(([dir, mtime]) => mtimeOf(dir) !== mtime).map(([dir]) => dir);
  if (feature === undefined || changedDirs.length > 0) {
    const walked = walkFeature(featureDir);
    // A folder changes when a file in it is added, removed or saved through a rename: its files are read again.
    for (const file of walked.files) if (changedDirs.includes(dirname(file))) freshImports(app, file, tsconfig);
    feature = { ...walked, counts: null, tsconfig };
    featuresByDir.set(featureDir, feature);
  }
  if (feature.counts !== null && feature.tsconfig === tsconfig) return feature.counts;
  const counts = new Map<string, number>();
  for (const source of feature.files) {
    const cached = importsByFile.get(source);
    const targets = cached?.tsconfig === tsconfig ? cached.targets : freshImports(app, source, tsconfig).targets;
    for (const target of targets) {
      const into = featureOf(target, settings);
      if (into !== null && into !== name && !isTest(target)) counts.set(into, (counts.get(into) ?? 0) + 1);
    }
  }
  feature.counts = counts;
  feature.tsconfig = tsconfig;
  return counts;
}

/** The feature an app path belongs to: `features/<feature>/…`; null for a file loose in `features/` or outside. */
function featureOf(path: string, settings: ReactRouterSettings): string | null {
  // Called for every import of every file of the features a file's imports reach: no split.
  const start = settings.featuresDir.length + 1;
  if (!path.startsWith(`${settings.featuresDir}/`)) return null;
  const end = path.indexOf("/", start);
  return end === -1 ? null : path.slice(start, end);
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
    // This file's imports are read the way every file is, so both sides are counted alike, and the AST is
    // only walked, to find the import to report on, when one of them is on a cycle's minority side.
    const filename = resolve(context.filename);
    const own = freshImports(app, filename, tsconfig);
    const ownFeature = featuresByDir.get(join(featuresRoot, feature));
    if (own.changed && ownFeature !== undefined) ownFeature.counts = null;
    /** Per feature, its imports into the others: its folders checked once for this file. */
    const counted = new Map<string, ReadonlyMap<string, number>>();
    const importCount = (from: string, to: string) => {
      let counts = counted.get(from);
      if (counts === undefined) counted.set(from, (counts = outgoing(app, join(featuresRoot, from), from, tsconfig, settings)));
      return counts.get(to) ?? 0;
    };
    const dir = settings.featuresDir;
    /** Target app path → message, for each import to report. */
    const due = new Map<string, string>();
    for (const target of own.targets) {
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
