import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import plugin, { RECOMMENDED } from "../src/index.js";
import { EMPTY_MODULE, lintFixture } from "./oxlint.js";

const RECOMMENDED_JSON = join(import.meta.dir, "../recommended.json");
const ELYSIA_PACKAGE = JSON.stringify({ dependencies: { elysia: "1" } });

describe("recommended", () => {
  test("recommended.json and configs.recommended turn on the same rules, every one but *-file-prefix", () => {
    const json = JSON.parse(readFileSync(RECOMMENDED_JSON, "utf8")) as { rules: Record<string, string> };
    const ruleNames = Object.keys(plugin.rules).filter((rule) => !rule.endsWith("-file-prefix"));
    expect(json.rules).toEqual(plugin.configs.recommended.rules);
    expect([...RECOMMENDED].sort()).toEqual(ruleNames.sort());
    expect(plugin.configs.recommended.plugins.structure).toBe(plugin);
  });

  // `extends` resolves the config's `jsPlugins` from the extended file: one line of config turns it all on.
  test("an oxlint config that extends recommended.json reports", () => {
    const files = {
      "package.json": ELYSIA_PACKAGE,
      "src/modules/games/games.module.ts": EMPTY_MODULE,
      "src/modules/games/rankings.service.ts": EMPTY_MODULE,
    };
    expect(lintFixture({ files, rules: [], extend: RECOMMENDED_JSON })).toEqual([
      "elysia-role-prefix: modules/games/rankings.service.ts: service files start with their module (games.service.ts, games-….service.ts) → rename it, or move it to the module it belongs to",
    ]);
  });
});
