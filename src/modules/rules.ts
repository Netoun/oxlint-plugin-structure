import { existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { Rule, RuleContext } from "../eslint.js";
import { nearestPackage } from "../package.js";
import { readSection } from "../settings.js";

/**
 * Rules for API stacks organised in modules: `src/modules/<module>/<module>.module.ts`, role files
 * named `<module>.<role>.ts`, sub-features in sub-folders. Elysia and NestJS share them with
 * different defaults; each only checks packages that depend on its framework.
 */

/** `settings.structure.elysia` / `settings.structure.nestjs`. Every key is optional. */
export type ModuleSettings = {
  /** Where the modules live, relative to the package root. */
  modulesDir: string;
  /** A folder of `modulesDir` for cross-module tests; no rule looks inside it. */
  testsFolder: string;
  /** A module's contracts folder: its files are named after the module. */
  contractsFolder: string;
  /** File roles, named `<module>.<role>.ts`. */
  roles: readonly string[];
  /** Folders whose files are named after what they hold, not after the module (Nest `entities/`). */
  freeNameFolders: readonly string[];
};

type Stack = {
  id: "elysia" | "nestjs";
  /** The dependency that marks a package as this stack's. */
  dependency: string;
  defaults: ModuleSettings;
};

/** Where a file sits in its package's modules folder. */
type ModuleFile = {
  /** Path shown in messages: `modules/<module>/…`. */
  path: string;
  /** Folders between the modules folder and the file; empty for a file loose in it. */
  folders: string[];
  name: string;
  settings: ModuleSettings;
  modulesRoot: string;
};

/** `teams` → `team`, `categories` → `category`: a module's files may use the singular. */
const singular = (name: string) => name.replace(/ies$/, "y").replace(/s$/, "");

function moduleFile(stack: Stack, context: RuleContext): ModuleFile | null {
  const settings = readSection(context.settings, stack.id, stack.defaults, ["roles"]);
  const pkg = nearestPackage(context.filename);
  if (!pkg?.dependencies.has(stack.dependency)) return null;
  const modulesRoot = join(pkg.dir, settings.modulesDir);
  const segments = relative(modulesRoot, resolve(context.filename)).split(/[\\/]/);
  if (segments[0] === "..") return null;
  const name = segments.pop() ?? "";
  if (segments[0] === settings.testsFolder || name.endsWith(".d.ts")) return null;
  const path = [basename(settings.modulesDir), ...segments, name].join("/");
  return { path, folders: segments, name, settings, modulesRoot };
}

/** Whether the prefix rules skip this file: it sits in a folder of free names. */
const isFreeName = ({ folders, settings }: ModuleFile) =>
  folders.some((folder) => settings.freeNameFolders.includes(folder));

/** Whether `name` starts with one of the folders it sits in (or its singular), then `.` or `-`. */
function isPrefixed({ folders, name, settings }: ModuleFile): boolean {
  return folders
    .filter((folder) => folder !== settings.contractsFolder)
    .flatMap((folder) => [folder, singular(folder)])
    .some((prefix) => name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`));
}

const roleOf = ({ name, settings }: ModuleFile) => settings.roles.find((role) => name.endsWith(`.${role}.ts`));

/** A rule that runs `check` once per modules-folder file of the stack and reports what it returns. */
function moduleFileRule(stack: Stack, description: string, check: (file: ModuleFile) => string | null): Rule {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create(context) {
      const file = moduleFile(stack, context);
      if (file === null) return {};
      return {
        Program(node) {
          const problem = check(file);
          if (problem !== null) context.report({ node, message: `${file.path}: ${problem}` });
        },
      };
    },
  };
}

function rulesFor(stack: Stack): Record<string, Rule> {
  const rolePrefix = moduleFileRule(
    stack,
    "A role file (module, routes, controller, service, contract…) is named after the module it sits in.",
    (file) => {
      const role = roleOf(file);
      const module = file.folders[0];
      if (role === undefined || module === undefined || isFreeName(file) || isPrefixed(file)) return null;
      return `${role} files start with their module (${module}.${role}.ts, ${module}-….${role}.ts) → rename it, or move it to the module it belongs to`;
    },
  );

  const filePrefix = moduleFileRule(stack, "Every other file of a module starts with the module's name.", (file) => {
    const module = file.folders[0];
    if (module === undefined || roleOf(file) !== undefined || isFreeName(file) || isPrefixed(file)) return null;
    return `start the name with its module (${module}.… or ${module}-…)`;
  });

  const moduleEntry = moduleFileRule(
    stack,
    "Every folder of the modules folder is a module with its <module>.module.ts; no file sits loose in it.",
    (file) => {
      const base = basename(file.settings.modulesDir);
      const [module, ...rest] = file.folders;
      if (module === undefined) return `no loose file in ${base}/ → put it in a module folder`;
      if (rest.length > 0 || existsSync(join(file.modulesRoot, module, `${module}.module.ts`))) return null;
      return `${base}/${module}/ has no ${module}.module.ts → add it, or move this file out of ${base}/`;
    },
  );

  return {
    [`${stack.id}-role-prefix`]: rolePrefix,
    [`${stack.id}-file-prefix`]: filePrefix,
    [`${stack.id}-module-entry`]: moduleEntry,
  };
}

const elysia: Stack = {
  id: "elysia",
  dependency: "elysia",
  defaults: {
    modulesDir: "src/modules",
    testsFolder: "test",
    contractsFolder: "contracts",
    roles: ["module", "routes", "service", "contract", "macro", "guard"],
    freeNameFolders: [],
  },
};

const nestjs: Stack = {
  id: "nestjs",
  dependency: "@nestjs/core",
  defaults: {
    modulesDir: "src/modules",
    testsFolder: "test",
    contractsFolder: "contracts",
    roles: ["module", "controller", "service", "mapper", "contract", "entity", "factory", "guard", "filter", "query", "seeder"],
    freeNameFolders: ["entities", "utils"],
  },
};

/** Elysia keeps a module's contracts in its contracts folder; a sub-feature's may sit beside its routes. */
const elysiaContractLocation = moduleFileRule(
  elysia,
  "A module's contracts live in its contracts folder; a sub-feature's contract may sit beside its routes.",
  (file) => {
    const [module, ...rest] = file.folders;
    if (module === undefined || rest.length > 0 || !file.name.endsWith(".contract.ts")) return null;
    return `contracts live in ${basename(file.settings.modulesDir)}/${module}/${file.settings.contractsFolder}/`;
  },
);

export const elysiaRules: Record<string, Rule> = {
  ...rulesFor(elysia),
  "elysia-contract-location": elysiaContractLocation,
};

export const nestjsRules: Record<string, Rule> = rulesFor(nestjs);
