import type { Rule } from "./eslint.js";
import { reactRouterRules } from "./react-router/rules.js";

export type { ReactRouterSettings } from "./react-router/settings.js";

const plugin: { meta: { name: string }; rules: Record<string, Rule> } = {
  meta: { name: "structure" },
  rules: { ...reactRouterRules },
};

export default plugin;
