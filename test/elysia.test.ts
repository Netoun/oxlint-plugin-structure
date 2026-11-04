import { describe, expect, test } from "bun:test";
import { EMPTY_MODULE, lintFixture } from "./oxlint.js";

const RULES = ["role-prefix", "file-prefix", "module-entry", "contract-location"].map((rule) => `elysia-${rule}`);
const ELYSIA_PACKAGE = JSON.stringify({ name: "api", dependencies: { elysia: "1.4.0" } });

type Project = {
  /** Files under `apps/api/src/modules`. */
  files: string[];
  settings?: Record<string, unknown>;
  /** False makes `apps/api` a package without elysia. */
  elysia?: boolean;
};

/** Lints `apps/api` with every elysia rule on; returns `rule: message` lines without the `elysia-` prefix. */
function lint({ files, settings, elysia = true }: Project): string[] {
  const tree: Record<string, string> = {
    "apps/api/package.json": elysia ? ELYSIA_PACKAGE : JSON.stringify({ name: "api" }),
  };
  for (const file of files) tree[`apps/api/src/modules/${file}`] = EMPTY_MODULE;
  return lintFixture({ files: tree, structure: settings ? { elysia: settings } : undefined, rules: RULES }).map(
    (line) => line.replace(/^elysia-/, ""),
  );
}

describe("elysia", () => {
  test("passes modules that follow the anatomy, sub-features and the shared test folder", () => {
    expect(
      lint({
        files: [
          "games/games.module.ts",
          "games/games.routes.ts",
          "games/games.service.ts",
          "games/contracts/games.contract.ts",
          "games/games.e2e.test.ts",
          "games/game-scoring.ts",
          "games/game-scoring.test.ts",
          "play/play.module.ts",
          "play/play.routes.ts",
          "play/scan/play-scan.routes.ts",
          "play/scan/play-scan.contract.ts",
          "play/lib/play-refusal.ts",
          "test/health.test.ts",
        ],
      }),
    ).toEqual([]);
  });

  test("reports each file that leaks out of its module's anatomy", () => {
    expect(
      lint({
        files: [
          "admin/admin.module.ts",
          "admin/batch-recipes.service.ts",
          "household/household.module.ts",
          "household/household.contract.ts",
          "realtime/notify-household.ts",
          "teams/teams.module.ts",
          "teams/normalize-team-name.ts",
          "helpers.ts",
        ],
      }),
    ).toEqual(
      [
        "role-prefix: modules/admin/batch-recipes.service.ts: service files start with their module (admin.service.ts, admin-….service.ts) → rename it, or move it to the module it belongs to",
        "contract-location: modules/household/household.contract.ts: a module's contract sits in its root → move it to modules/household/contracts/",
        "module-entry: modules/realtime/notify-household.ts: modules/realtime/ has no realtime.module.ts → add it, or move this file out of modules/",
        "file-prefix: modules/realtime/notify-household.ts: the name does not start with its module → rename it realtime.… or realtime-…",
        "file-prefix: modules/teams/normalize-team-name.ts: the name does not start with its module → rename it teams.… or teams-…",
        "module-entry: modules/helpers.ts: no loose file in modules/ → put it in a module folder",
      ].sort(),
    );
  });

  test("leaves a package without elysia alone", () => {
    expect(lint({ elysia: false, files: ["admin/batch-recipes.service.ts", "helpers.ts"] })).toEqual([]);
  });

  test("renames the folders and roles the rules look for", () => {
    expect(
      lint({
        settings: { modulesDir: "src/modules", testsFolder: "__tests__", roles: ["module", "routes", "repository"] },
        files: [
          "users/users.module.ts",
          "users/accounts.repository.ts",
          "users/accounts.service.ts",
          "__tests__/anything.test.ts",
        ],
      }),
    ).toEqual([
      "file-prefix: modules/users/accounts.service.ts: the name does not start with its module → rename it users.… or users-…",
      "role-prefix: modules/users/accounts.repository.ts: repository files start with their module (users.repository.ts, users-….repository.ts) → rename it, or move it to the module it belongs to",
    ]);
  });

  test("fails loudly on an invalid setting", () => {
    expect(() => lint({ settings: { roles: [] }, files: ["a/a.module.ts"] })).toThrow(
      /structure settings\["elysia"\]: roles must be a non-empty list of names/,
    );
  });
});

describe("presets combine", () => {
  test("each preset only checks its own apps", () => {
    const files: Record<string, string> = {
      // A React Router app with a folder that looks like an Elysia module.
      "apps/web/react-router.config.ts": 'export default { appDirectory: "src" };\n',
      "apps/web/src/routes.ts": 'import { index } from "@react-router/dev/routes";\nexport default [index("features/home/pages/home.tsx")];\n',
      "apps/web/src/features/home/pages/home.tsx": EMPTY_MODULE,
      "apps/web/src/modules/cart/checkout.service.ts": EMPTY_MODULE,
      // An Elysia API with a folder that looks like React Router features.
      "apps/api/package.json": ELYSIA_PACKAGE,
      "apps/api/src/modules/cart/cart.module.ts": EMPTY_MODULE,
      "apps/api/src/modules/cart/checkout.service.ts": EMPTY_MODULE,
      "apps/api/src/features/home/pages/home-card.tsx": EMPTY_MODULE,
    };
    const rules = [
      ...RULES,
      ...["role-suffix", "feature-prefix", "location", "reserved-suffixes", "no-loose-files"].map(
        (rule) => `react-router-${rule}`,
      ),
    ];

    expect(lintFixture({ files, rules })).toEqual([
      "elysia-role-prefix: modules/cart/checkout.service.ts: service files start with their module (cart.service.ts, cart-….service.ts) → rename it, or move it to the module it belongs to",
      "react-router-feature-prefix: features/home/pages/home.tsx: the name does not start with its feature → rename it home-…",
      "react-router-role-suffix: features/home/pages/home.tsx: leaf route → name it *-page.tsx or *-redirect.tsx",
    ]);
  });
});
