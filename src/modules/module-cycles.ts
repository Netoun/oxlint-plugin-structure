import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { staticString, type AstNode, type ExportDeclaration, type ImportDeclaration, type Rule, type Visitor } from "../eslint.js";
import { nearestPackage } from "../package.js";
import { aliasTargets, readPathAliases, type PathAliases } from "../tsconfig.js";
import { moduleFile, type ModuleFile, type Stack } from "./rules.js";

/**
 * `<stack>-module-cycles`: module A imports module B and B imports A, so neither can move or be understood
 * alone. Only the side with fewer imports is reported, once per file it imports: it is the cheaper side to
 * fix. An import counts as a distinct (file, imported file) pair, tests left out on both sides. Telling the
 * cycle requires the other module's imports, so the rule reads the files of the modules involved, each cached
 * until its mtime changes. A longer loop (A → B → C → A) has no pair to report and is not seen.
 */

type ImportExpression = AstNode & { type: "ImportExpression"; source: AstNode };
/** `import("x")` and `Program:exit` are not in the shared `Visitor`: this rule alone listens to them. */
type CyclesVisitor = Visitor & {
  ImportExpression?: (node: ImportExpression) => void;
  "Program:exit"?: (node: AstNode) => void;
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const isSource = (name: string) => SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension));
const isTest = (file: string) => /[.-](test|spec)\.[cm]?[jt]sx?$/.test(file) || file.endsWith(".d.ts");
const RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;
const COMMENT = /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm;
const MODULE_SPECIFIER = /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g;

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** The `paths` aliases of a package's `tsconfig.json`, cached until one of the files they come from changes. */
const aliasesByTsconfig = new Map<string, { probed: ReadonlyMap<string, number | null>; aliases: PathAliases }>();

function aliasesOf(tsconfig: string): PathAliases {
  const cached = aliasesByTsconfig.get(tsconfig);
  if (cached && [...cached.probed].every(([path, mtime]) => mtimeOf(path) === mtime)) return cached.aliases;
  const aliases = readPathAliases(tsconfig);
  aliasesByTsconfig.set(tsconfig, { probed: new Map(aliases.files.map((path) => [path, mtimeOf(path)])), aliases });
  return aliases;
}

/** The source file `base` stands for as a bundler resolves it: itself, with an extension, or its `index`. */
function resolveFile(base: string): string | null {
  const stem = base.replace(/\.[cm]?jsx?$/, "");
  const candidates = [
    ...(isSource(base) ? [base] : []),
    ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => mtimeOf(candidate) !== null) ?? null;
}

/** The file an import of `from` leads to: a relative specifier, or an alias of the package's tsconfig `paths`. */
function resolveImport(aliases: PathAliases, from: string, specifier: string): string | null {
  const targets = RELATIVE_SPECIFIER.test(specifier) ? [resolve(dirname(from), specifier)] : aliasTargets(aliases, specifier);
  for (const target of targets ?? []) {
    const file = resolveFile(target);
    if (file !== null) return file;
  }
  return null;
}

/** The module an absolute path belongs to: `<modulesRoot>/<module>/…`; null for a loose file or the tests folder. */
function moduleOf(file: ModuleFile, path: string): string | null {
  const [module, ...rest] = relative(file.modulesRoot, path).split(/[\\/]/);
  return module === undefined || module === ".." || module === file.settings.testsFolder || rest.length === 0 ? null : module;
}

/** Where a file's imports lead, as absolute paths. Cached by mtime, and by the tsconfig the aliases came from. */
const importsByFile = new Map<string, { mtime: number; tsconfig: number | null; targets: readonly string[] }>();

function importsOf(aliases: PathAliases, tsconfig: number | null, source: string): readonly string[] {
  const mtime = mtimeOf(source);
  if (mtime === null) return [];
  const cached = importsByFile.get(source);
  if (cached?.mtime === mtime && cached.tsconfig === tsconfig) return cached.targets;
  const targets = new Set<string>();
  const text = readFileSync(source, "utf8").replace(COMMENT, "");
  for (const match of text.matchAll(MODULE_SPECIFIER)) {
    const target = resolveImport(aliases, source, match[1] ?? match[2] ?? "");
    if (target !== null) targets.add(target);
  }
  const entry = { mtime, tsconfig, targets: [...targets] };
  importsByFile.set(source, entry);
  return entry.targets;
}

/** The source files of a module folder, tests left out. Cached until a folder in it changes. */
const filesByModule = new Map<string, { dirs: ReadonlyMap<string, number | null>; files: readonly string[] }>();

function moduleFiles(moduleDir: string): readonly string[] {
  const cached = filesByModule.get(moduleDir);
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
      else if (entry.isFile() && isSource(entry.name) && !isTest(entry.name)) files.push(path);
    }
  };
  walk(moduleDir);
  filesByModule.set(moduleDir, { dirs, files });
  return files;
}

const plural = (count: number) => `${count} import${count === 1 ? "" : "s"}`;

export const MODULE_CYCLES_DESCRIPTION =
  "Two modules never import each other: the side with fewer imports moves what it uses out, or the two merge.";

export function moduleCyclesRule(stack: Stack): Rule {
  return {
    meta: { type: "problem", docs: { description: MODULE_CYCLES_DESCRIPTION }, schema: [] },
    create(context) {
      const file = moduleFile(stack, context);
      const pkg = nearestPackage(context.filename);
      if (file === null || pkg === null || isTest(file.name)) return {};
      const module = file.folders[0];
      if (module === undefined || module === file.settings.testsFolder) return {};

      const tsconfig = join(pkg.dir, "tsconfig.json");
      const aliases = aliasesOf(tsconfig);
      const tsconfigMtime = mtimeOf(tsconfig);
      /** Per module: target module → distinct (file, target file) pairs into it. Read once per linted file. */
      const outgoing = new Map<string, Map<string, number>>();
      const importCount = (from: string, to: string) => {
        let counts = outgoing.get(from);
        if (counts === undefined) {
          counts = new Map();
          for (const source of moduleFiles(join(file.modulesRoot, from))) {
            for (const target of importsOf(aliases, tsconfigMtime, source)) {
              const into = moduleOf(file, target);
              if (into !== null && into !== from && !isTest(target)) counts.set(into, (counts.get(into) ?? 0) + 1);
            }
          }
          outgoing.set(from, counts);
        }
        return counts.get(to) ?? 0;
      };
      // This file's imports are read the way every file is, so both sides are counted alike, and the AST is
      // only walked, to find the import to report on, when one of them is on a cycle's minority side.
      const filename = resolve(context.filename);
      const base = basename(file.settings.modulesDir);
      /** Target absolute path → message, for each import to report. */
      const due = new Map<string, string>();
      for (const target of importsOf(aliases, tsconfigMtime, filename)) {
        const other = moduleOf(file, target);
        if (other === null || other === module || isTest(target)) continue;
        const theirs = importCount(other, module);
        const mine = importCount(module, other);
        // The minority side is reported; on a tie, the side of the module whose name sorts first.
        if (theirs === 0 || mine > theirs || (mine === theirs && module > other)) continue;
        const moved = relative(join(file.modulesRoot, other), target).split(/[\\/]/).join("/");
        due.set(
          target,
          `${file.path}: imports ${base}/${other}, which imports ${base}/${module} (${plural(theirs)}) → move ${moved} out of ${other} (to a module both import, or to ${module}), or merge the two modules`,
        );
      }
      if (due.size === 0) return {};

      const onSource = (source: AstNode | null | undefined) => {
        const specifier = source ? staticString(source) : null;
        if (!source || specifier === null) return;
        const target = resolveImport(aliases, filename, specifier);
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
}
