import type { Rule } from "./eslint.js";
import { elysiaRules, nestjsRules } from "./modules/rules.js";
import { reactRouterRules } from "./react-router/rules.js";

export type { ModuleSettings } from "./modules/rules.js";
export type { ReactRouterSettings } from "./react-router/settings.js";

const plugin: { meta: { name: string }; rules: Record<string, Rule> } = {
  meta: { name: "structure" },
  rules: { ...reactRouterRules, ...elysiaRules, ...nestjsRules },
};

export default plugin;
