import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lintFixture } from "./oxlint.js";

const EXAMPLES = join(import.meta.dir, "../examples");
const README = readFileSync(join(import.meta.dir, "../README.md"), "utf8");

type Config = { settings?: { structure?: Record<string, unknown> }; rules: Record<string, string> };

type Example = {
  files: Record<string, string>;
  structure: Record<string, unknown> | undefined;
  /** The rules of the example's own `.oxlintrc.json`, without the `structure/` prefix. */
  rules: string[];
};

/** Reads `examples/<stack>`: its tree, and the rules and settings of the config a reader would copy. */
function load(stack: string): Example {
  const dir = join(EXAMPLES, stack);
  const files: Record<string, string> = {};
  for (const path of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (path === ".oxlintrc.json" || !statSync(join(dir, path)).isFile()) continue;
    files[path] = readFileSync(join(dir, path), "utf8");
  }
  const config = JSON.parse(readFileSync(join(dir, ".oxlintrc.json"), "utf8")) as Config;
  return {
    files,
    structure: config.settings?.structure,
    rules: Object.keys(config.rules).map((rule) => rule.replace(/^structure\//, "")),
  };
}

/** Moves a file and rewrites the references to it (a route module is named in `routes.ts`). */
function rename(files: Record<string, string>, from: string, to: string): Record<string, string> {
  const moved: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    moved[path === from ? to : path] = text.replaceAll(from.replace(/^src\//, ""), to.replace(/^src\//, ""));
  }
  return moved;
}

type Case = {
  stack: string;
  /** The noisy rule that a new project turns on too; the example must pass it. */
  extraRule?: string;
  rename: [from: string, to: string];
  rule: string;
  message: string;
};

const CASES: Case[] = [
  {
    stack: "react-router",
    extraRule: "react-router-file-prefix",
    rename: ["src/features/game/pages/game-room-page.tsx", "src/features/game/pages/room-page.tsx"],
    rule: "react-router-feature-prefix",
    message: "features/game/pages/room-page.tsx: the name does not start with its feature → rename it game-…",
  },
  {
    stack: "elysia",
    extraRule: "elysia-file-prefix",
    rename: ["src/modules/games/games.service.ts", "src/modules/games/rankings.service.ts"],
    rule: "elysia-role-prefix",
    message:
      "modules/games/rankings.service.ts: service files start with their module (games.service.ts, games-….service.ts) → rename it, or move it to the module it belongs to",
  },
  {
    stack: "nestjs",
    extraRule: "nestjs-file-prefix",
    rename: ["src/modules/billing/billing.service.ts", "src/modules/billing/invoicing.service.ts"],
    rule: "nestjs-role-prefix",
    message:
      "modules/billing/invoicing.service.ts: service files start with their module (billing.service.ts, billing-….service.ts) → rename it, or move it to the module it belongs to",
  },
];

// Each example is a tree the rules accept. A green lint alone proves little: a rule stays silent on an app
// it does not recognise, so every example also fails, with the exact message, once one file is misnamed.
describe.each(CASES)("examples/$stack", ({ stack, extraRule, rename: [from, to], rule, message }) => {
  const { files, structure, rules } = load(stack);
  const lint = (tree: Record<string, string>) =>
    lintFixture({ files: tree, structure, rules: extraRule ? [...rules, extraRule] : rules });

  test("passes its own config, and the file-prefix rule a new project adds", () => {
    expect(lint(files)).toEqual([]);
  });

  test("reports a misnamed file with the message the README shows", () => {
    expect(lint(rename(files, from, to))).toEqual([`${rule}: ${message}`]);
    expect(README.includes(message)).toBe(true);
  });
});
