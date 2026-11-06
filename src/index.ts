import type { Rule } from "./eslint.js";
import { elysiaRules, nestjsRules, type ModuleSettings } from "./modules/rules.js";
import { reactRouterRules } from "./react-router/rules.js";
import type { ReactRouterSettings } from "./react-router/settings.js";

export type { ModuleSettings, ReactRouterSettings };

/** `settings.structure` of a lint config: one optional section per stack, every key optional. */
export type StructureSettings = {
  "react-router"?: Partial<ReactRouterSettings>;
  elysia?: Partial<ModuleSettings>;
  nestjs?: Partial<ModuleSettings>;
};

type Plugin = {
  meta: { name: string };
  rules: Record<string, Rule>;
  configs: { recommended: { plugins: Record<string, Plugin>; rules: Record<string, "error"> } };
};

/**
 * Every rule but the opt-in ones: the noisy `*-file-prefix` rules and `react-router-feature-cycles`, whose
 * fix moves code between features. Safe to turn on in any repo: each rule finds its stack
 * from the linted file and stays silent elsewhere. `recommended.json` lists the same rules for oxlint.
 */
export const RECOMMENDED: readonly string[] = [
  "react-router-role-suffix",
  "react-router-feature-prefix",
  "react-router-location",
  "react-router-reserved-suffixes",
  "react-router-no-loose-files",
  "react-router-file-case",
  "react-router-folder-contents",
  "react-router-shared-imports",
  "elysia-role-prefix",
  "elysia-module-entry",
  "elysia-contract-location",
  "nestjs-role-prefix",
  "nestjs-module-entry",
  "nestjs-entity-location",
  "nestjs-class-name",
  "nestjs-role-vocabulary",
];

const plugin: Plugin = {
  meta: { name: "structure" },
  rules: { ...reactRouterRules, ...elysiaRules, ...nestjsRules },
  configs: {
    recommended: { plugins: {}, rules: Object.fromEntries(RECOMMENDED.map((rule) => [`structure/${rule}`, "error"])) },
  },
};
// ESLint flat config: `export default [structure.configs.recommended]`. The config holds the plugin itself.
plugin.configs.recommended.plugins.structure = plugin;

export default plugin;
