import { describe, expect, test } from "bun:test";
import { EMPTY_MODULE, lintFixture } from "./oxlint.js";

const RULES = [
  "role-suffix",
  "feature-prefix",
  "location",
  "reserved-suffixes",
  "no-loose-files",
  "file-case",
  "folder-contents",
].map((rule) => `react-router-${rule}`);

type Project = {
  settings?: Record<string, unknown>;
  /** Text of `apps/web/src/routes.ts`; omitted means the app has no routes file. */
  routes?: string;
  /** Files under `apps/web/src`, empty. */
  files?: string[];
  /** Files under `apps/web/src` with their text; a `../` path lands outside the app folder. */
  sources?: Record<string, string>;
  /** Write `react-router.config.ts`; false makes `apps/web` a plain package. */
  reactRouter?: boolean;
};

const ROUTES_IMPORT = 'import { index, layout, prefix, route } from "@react-router/dev/routes";\n';

/** Lints `apps/web` with every react-router rule on; returns `rule: message` lines without the `react-router-` prefix. */
function lint({ settings, routes, files = [], sources = {}, reactRouter = true }: Project): string[] {
  const tree: Record<string, string> = {};
  if (reactRouter) tree["apps/web/react-router.config.ts"] = 'export default { appDirectory: "src" };\n';
  if (routes !== undefined) tree["apps/web/src/routes.ts"] = routes;
  for (const file of files) tree[`apps/web/src/${file}`] = EMPTY_MODULE;
  for (const [file, text] of Object.entries(sources)) tree[`apps/web/src/${file}`] = text;
  return lintFixture({ files: tree, structure: settings ? { "react-router": settings } : undefined, rules: RULES }).map(
    (line) => line.replace(/^react-router-/, ""),
  );
}

describe("mode pages (default)", () => {
  test("passes route modules named by role, prefixed by feature, all in pages/", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [
          index("features/home/pages/home-redirect.tsx"),
          route("r", "features/game/pages/game-room-layout.tsx", [
            route(":id", "features/game/pages/game-room-page.tsx"),
          ]),
          route("robots.txt", "features/seo/pages/robots.ts"),
        ];`,
        files: [
          "features/home/pages/home-redirect.tsx",
          "features/game/pages/game-room-layout.tsx",
          "features/game/pages/game-room-page.tsx",
          "features/game/pages/game-room-page.test.tsx",
          "features/game/hooks/use-game.ts",
          "features/game/components/game-card.tsx",
          "features/seo/pages/robots.ts",
        ],
      }),
    ).toEqual([]);
  });

  test("reports each misplaced or misnamed file under the rule that owns it", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [
          route("r", "features/game/game-room-layout.tsx", [
            route(":id", "features/game/pages/game-room-page.tsx"),
          ]),
          layout("features/shell/pages/shell-page.tsx", [index("features/shell/pages/shell-home-page.tsx")]),
          route("login", "features/auth/pages/login.tsx"),
          route("legacy", "routes/legacy-page.tsx"),
        ];`,
        files: [
          "features/game/game-room-layout.tsx",
          "features/game/pages/game-room-page.tsx",
          "features/game/pages/game-card.tsx",
          "features/game/types.ts",
          "features/game/components/game-lost-page.tsx",
          "features/shell/pages/shell-page.tsx",
          "features/shell/pages/shell-home-page.tsx",
          "features/auth/pages/login.tsx",
          "features/helpers.ts",
        ],
      }),
    ).toEqual(
      [
        "location: features/game/game-room-layout.tsx: route modules live in features/<feature>/pages/ → move it there and update routes.ts",
        "location: routes/legacy-page.tsx: route modules live in features/<feature>/pages/ → move it there and update routes.ts",
        "role-suffix: features/shell/pages/shell-page.tsx: has child routes, so it is a layout → name it *-layout.tsx",
        "role-suffix: features/auth/pages/login.tsx: leaf route → name it *-page.tsx or *-redirect.tsx",
        "feature-prefix: features/auth/pages/login.tsx: the name does not start with its feature → rename it auth-…",
        "no-loose-files: features/game/pages/game-card.tsx: only route modules live in features/<feature>/pages/ → move it to a subfolder (components/, hooks/, lib/…)",
        "no-loose-files: features/game/types.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
        "no-loose-files: features/helpers.ts: no loose file directly in features/ → move it into a feature",
        "reserved-suffixes: features/game/components/game-lost-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
      ].sort(),
    );
  });

  test("handles nested features: features/<f>/features/<sub>/pages/", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [
          route("pricing", "features/billing/features/pricing/pages/pricing-page.tsx"),
        ];`,
        files: [
          "features/billing/features/pricing/pages/pricing-page.tsx",
          "features/billing/features/pricing/pages/pricing-table.tsx",
          "features/billing/features/pricing/types.ts",
        ],
      }),
    ).toEqual([
      "no-loose-files: features/billing/features/pricing/pages/pricing-table.tsx: only route modules live in features/<feature>/pages/ → move it to a subfolder (components/, hooks/, lib/…)",
      "no-loose-files: features/billing/features/pricing/types.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
    ]);
  });
});

describe("mode flat", () => {
  test("keeps route modules at the feature root and everything else in subfolders", () => {
    expect(
      lint({
        settings: { mode: "flat" },
        routes: `${ROUTES_IMPORT}export default [
          layout("features/shell/shell-app-layout.tsx", [
            index("features/catalog/catalog-home-page.tsx"),
            route("pricing", "features/billing/pricing/pricing-page.tsx"),
            route("card", "features/catalog/components/catalog-card-page.tsx"),
          ]),
        ];`,
        files: [
          "features/shell/shell-app-layout.tsx",
          "features/catalog/catalog-home-page.tsx",
          "features/catalog/catalog-filters.tsx",
          "features/catalog/components/catalog-card-page.tsx",
          "features/catalog/utils/catalog-queries.ts",
          "features/billing/pricing/pricing-page.tsx",
        ],
      }),
    ).toEqual([
      "location: features/catalog/components/catalog-card-page.tsx: route modules live in features/<feature>/ → move it there and update routes.ts",
      "no-loose-files: features/catalog/catalog-filters.tsx: only route modules live in features/<feature>/ → move it to a subfolder (components/, hooks/, lib/…)",
    ]);
  });
});

describe("routes.ts forms", () => {
  test("follows aliased helpers and routes nested in prefix()", () => {
    expect(
      lint({
        routes: `import { index as i, prefix, route as r } from "@react-router/dev/routes";
          export default [
            i("features/home/pages/home.tsx"),
            ...prefix("admin", [r("users", "features/admin/pages/admin-users-page.tsx")]),
            r("about", \`features/about/pages/about-page.tsx\`),
          ];`,
        files: [
          "features/home/pages/home.tsx",
          "features/admin/pages/admin-users-page.tsx",
          "features/about/pages/about-page.tsx",
        ],
      }),
    ).toEqual([
      "feature-prefix: features/home/pages/home.tsx: the name does not start with its feature → rename it home-…",
      "role-suffix: features/home/pages/home.tsx: leaf route → name it *-page.tsx or *-redirect.tsx",
    ]);
  });

  test("ignores routes that only appear in comments", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [
          // route("old", "features/home/pages/home-old-page.tsx"),
          index("features/home/pages/home-page.tsx"),
        ];`,
        files: ["features/home/pages/home-page.tsx", "features/home/pages/home-old-page.tsx"],
      }),
    ).toEqual([
      "reserved-suffixes: features/home/pages/home-old-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
    ]);
  });

  test("says file-system routes are not checked instead of passing silently", () => {
    expect(
      lint({
        routes: `import { flatRoutes } from "@react-router/fs-routes";\nexport default flatRoutes();\n`,
        files: ["features/home/pages/home.tsx"],
      }),
    ).toEqual([
      "location: routes.ts: file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app",
    ]);
  });
});

describe("routes split across files", () => {
  test("reads the routes declared in a file routes.ts imports", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}import { authRoutes } from "./features/auth/auth-routes";
          export default [route("games", "features/game/pages/game-page.tsx"), ...authRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("login", "features/auth/pages/auth-login-page.tsx")];`,
        },
        files: ["features/game/pages/game-page.tsx", "features/auth/pages/auth-login-page.tsx"],
      }),
    ).toEqual([]);
  });

  test("resolves ./x.js to x.ts, a folder to its index and follows chains of imports", () => {
    expect(
      lint({
        routes: `import { a } from "./features/a/a-routes.js";
          import { b } from "./features/b";
          export default [...a, ...b];`,
        sources: {
          "features/a/a-routes.ts": `${ROUTES_IMPORT}import { c } from "../c/c-routes";
            export const a = [route("a", "features/a/pages/a-page.tsx"), ...c];`,
          "features/b/index.ts": `export { b } from "./b-routes";`,
          "features/b/b-routes.ts": `${ROUTES_IMPORT}export const b = [route("b", "features/b/pages/b-page.tsx")];`,
          "features/c/c-routes.ts": `${ROUTES_IMPORT}export const c = [route("c", "features/c/pages/c-page.tsx")];`,
        },
        files: ["features/a/pages/a-page.tsx", "features/b/pages/b-page.tsx", "features/c/pages/c-page.tsx"],
      }),
    ).toEqual([]);
  });

  test("stops on files that import each other", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "./features/auth/auth-routes";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}import "../../routes";
            import "./auth-routes";
            export const authRoutes = [route("login", "features/auth/pages/auth-login-page.tsx")];`,
        },
        files: ["features/auth/pages/auth-login-page.tsx"],
      }),
    ).toEqual([]);
  });

  test("checks each route declared in such a file, and reports it there", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "./features/auth/auth-routes";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [
            route("login", "features/auth/pages/login.tsx"),
            route("legacy", "routes/legacy-page.tsx"),
            layout("features/auth/pages/auth-shell-page.tsx", [index("features/auth/pages/auth-home-page.tsx")]),
          ];`,
        },
        files: [
          "features/auth/pages/login.tsx",
          "routes/legacy-page.tsx",
          "features/auth/pages/auth-shell-page.tsx",
          "features/auth/pages/auth-home-page.tsx",
        ],
      }),
    ).toEqual(
      [
        "location: routes/legacy-page.tsx: route modules live in features/<feature>/pages/ → move it there and update features/auth/auth-routes.ts",
        "role-suffix: features/auth/pages/login.tsx: leaf route → name it *-page.tsx or *-redirect.tsx",
        "feature-prefix: features/auth/pages/login.tsx: the name does not start with its feature → rename it auth-…",
        "role-suffix: features/auth/pages/auth-shell-page.tsx: has child routes, so it is a layout → name it *-layout.tsx",
      ].sort(),
    );
  });

  test("does not call a route config file a loose file, but still a file nothing imports", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "./features/auth/auth-routes";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("login", "features/auth/pages/auth-login-page.tsx")];`,
        },
        files: ["features/auth/pages/auth-login-page.tsx", "features/auth/other-routes.ts", "features/auth/types.ts"],
      }),
    ).toEqual([
      "no-loose-files: features/auth/other-routes.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
      "no-loose-files: features/auth/types.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
    ]);
  });

  test("still asks a route config file for kebab-case", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "./features/auth/authRoutes";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/authRoutes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("login", "features/auth/pages/auth-login-page.tsx")];`,
        },
        files: ["features/auth/pages/auth-login-page.tsx"],
      }),
    ).toEqual(["file-case: features/auth/authRoutes.ts: the name is not kebab-case → rename it auth-routes.ts"]);
  });

  test("reports file-system routes on the file that calls flatRoutes()", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "./features/auth/auth-routes";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `import { flatRoutes } from "@react-router/fs-routes";\nexport const authRoutes = flatRoutes();`,
        },
        files: ["features/auth/pages/login.tsx"],
      }),
    ).toEqual([
      "location: features/auth/auth-routes.ts: file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app",
    ]);
  });

  test("does not take an import specifier for a route module: mode flat keeps lib/ free of routes", () => {
    expect(
      lint({
        settings: { mode: "flat" },
        routes: `import { authRoutes } from "./features/auth/lib/auth-routes.js";\nexport default [...authRoutes];`,
        sources: {
          "features/auth/lib/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("login", "features/auth/auth-login-page.tsx")];`,
          "features/auth/lib/auth-paths.ts": EMPTY_MODULE,
        },
        files: ["features/auth/auth-login-page.tsx"],
      }),
    ).toEqual([]);
  });

  test("follows relative imports only, and only inside the app folder", () => {
    expect(
      lint({
        routes: `import { authRoutes } from "~/features/auth/auth-routes";
          import { sharedRoutes } from "../shared-routes";
          export default [...authRoutes, ...sharedRoutes];`,
        sources: {
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("login", "features/auth/pages/auth-login-page.tsx")];`,
          "../shared-routes.ts": `${ROUTES_IMPORT}export const sharedRoutes = [route("x", "features/shared/pages/x.tsx")];`,
        },
        files: ["features/auth/pages/auth-login-page.tsx"],
      }),
    ).toEqual([
      "no-loose-files: features/auth/auth-routes.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
      "reserved-suffixes: features/auth/pages/auth-login-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
    ]);
  });
});

describe("child routes", () => {
  test("a layout may receive its children by variable, spread or call, a leaf its options", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}const children = [route("c", "features/auth/pages/auth-child-page.tsx")];
          const homeOptions = { id: "home" };
          export default [
            route("a", "features/auth/pages/auth-layout.tsx", children),
            layout("features/shell/pages/shell-layout.tsx", children),
            layout("features/billing/pages/billing-layout.tsx", [...children]),
            layout("features/audit/pages/audit-layout.tsx", { id: "audit" }, children),
            ...prefix("p", [layout("features/pro/pages/pro-layout.tsx", prefix("q", children))]),
            route("b", "features/billing/pages/billing-page.tsx", { id: "billing" }),
            route("c", "features/billing/pages/billing-extra-page.tsx", { id: "extra" }, []),
            index("features/home/pages/home-page.tsx", homeOptions),
            index("features/home/pages/home-redirect.tsx", { id: "home-redirect" }),
            route("x", "features/x/pages/x-page.tsx", []),
          ];`,
      }),
    ).toEqual([]);
  });

  test("a *-page that receives its children by variable is told to be a layout, not a leaf", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}const children = [route("c", "features/shell/pages/shell-child-page.tsx")];
          export default [layout("features/shell/pages/shell-page.tsx", children)];`,
      }),
    ).toEqual([
      "role-suffix: features/shell/pages/shell-page.tsx: has child routes, so it is a layout → name it *-layout.tsx",
    ]);
  });
});

describe("app detection", () => {
  test("reports a React Router app whose routes file cannot be found", () => {
    expect(lint({ files: ["features/home/pages/home-page.tsx"] })).toEqual([
      "no-loose-files: features/home/pages/home-page.tsx: react-router.config.ts points at src/, which has no routes.ts → add src/routes.ts, or fix appDirectory",
    ]);
  });

  test("leaves a package that is not a React Router app alone", () => {
    expect(
      lint({ reactRouter: false, files: ["features/design-system/design-system-card.tsx"] }),
    ).toEqual([]);
  });
});

describe("folder contents", () => {
  test("passes hooks named use-*, components in .tsx, and no component in lib/ or utils/", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [route("h", "features/hooks/pages/hooks-page.tsx")];`,
        files: [
          "features/hooks/pages/hooks-page.tsx",
          "features/game/hooks/use-game.ts",
          "features/game/hooks/game-queries.test.ts",
          "features/game/components/game-card.tsx",
          "features/game/components/hooks/use-card-state.ts",
          "features/game/lib/game-queries.ts",
          "features/game/utils/game-format.ts",
        ],
      }),
    ).toEqual([]);
  });

  test("reports what does not belong to its folder, with where it goes", () => {
    expect(
      lint({
        routes: ROUTES_IMPORT,
        files: [
          "features/game/hooks/score-query-keys.ts",
          "features/game/hooks/forms/form-state.ts",
          "features/game/components/game-detail.types.ts",
          "features/game/components/use-game-detail.ts",
          "features/game/lib/user-card.tsx",
          "features/game/utils/user-badge.tsx",
        ],
      }),
    ).toEqual(
      [
        "folder-contents: features/game/hooks/score-query-keys.ts: hooks/ holds hooks → name it use-….ts, or move it to lib/",
        "folder-contents: features/game/hooks/forms/form-state.ts: hooks/ holds hooks → name it use-….ts, or move it to lib/",
        "folder-contents: features/game/components/game-detail.types.ts: components/ holds components (.tsx) → move it to lib/",
        "folder-contents: features/game/components/use-game-detail.ts: components/ holds components (.tsx) → move it to hooks/",
        "folder-contents: features/game/lib/user-card.tsx: lib/ holds no component → move it to components/",
        "folder-contents: features/game/utils/user-badge.tsx: utils/ holds no component → move it to components/",
      ].sort(),
    );
  });

  test("leaves alone what is outside features/ and what is not a React Router app", () => {
    expect(lint({ routes: ROUTES_IMPORT, files: ["hooks/game-queries.ts"] })).toEqual([]);
    expect(lint({ reactRouter: false, files: ["features/game/hooks/game-queries.ts"] })).toEqual([]);
  });

  test("follows featuresDir", () => {
    expect(
      lint({
        settings: { featuresDir: "modules" },
        routes: ROUTES_IMPORT,
        files: ["modules/app/hooks/app-queries.ts", "features/app/hooks/app-queries.ts"],
      }),
    ).toEqual(["folder-contents: modules/app/hooks/app-queries.ts: hooks/ holds hooks → name it use-….ts, or move it to lib/"]);
  });
});

describe("file case", () => {
  test("asks for kebab-case anywhere under features/: route modules, tests and every subfolder", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}export default [route("g", "features/game/pages/game-Room-page.tsx")];`,
        files: [
          "features/game/pages/game-Room-page.tsx",
          "features/game/components/game-card.tsx",
          "features/game/components/GameCard.tsx",
          "features/game/components/GameCard.test.tsx",
          "features/game/components/game_card.tsx",
          "features/game/lib/useGame.ts",
          "features/game/lib/HTMLParser.ts",
        ],
      }),
    ).toEqual(
      [
        "file-case: features/game/pages/game-Room-page.tsx: the name is not kebab-case → rename it game-room-page.tsx",
        "file-case: features/game/components/GameCard.tsx: the name is not kebab-case → rename it game-card.tsx",
        "file-case: features/game/components/GameCard.test.tsx: the name is not kebab-case → rename it game-card.test.tsx",
        "file-case: features/game/components/game_card.tsx: the name is not kebab-case → rename it game-card.tsx",
        "file-case: features/game/lib/useGame.ts: the name is not kebab-case → rename it use-game.ts",
        "file-case: features/game/lib/HTMLParser.ts: the name is not kebab-case → rename it html-parser.ts",
      ].sort(),
    );
  });

  test("names the rule when no kebab-case name can be derived", () => {
    expect(lint({ routes: ROUTES_IMPORT, files: ["features/game/lib/$.ts"] })).toEqual([
      "file-case: features/game/lib/$.ts: the name is not kebab-case → rename it with lowercase words joined by -",
    ]);
  });

  test("leaves alone what is outside features/ and what is not a React Router app", () => {
    expect(lint({ routes: ROUTES_IMPORT, files: ["components/GameCard.tsx"] })).toEqual([]);
    expect(lint({ reactRouter: false, files: ["features/game/GameCard.tsx"] })).toEqual([]);
  });

  test("follows featuresDir", () => {
    expect(
      lint({
        settings: { featuresDir: "modules" },
        routes: ROUTES_IMPORT,
        files: ["modules/app/ui/AppButton.tsx", "features/app/ui/AppButton.tsx"],
      }),
    ).toEqual(["file-case: modules/app/ui/AppButton.tsx: the name is not kebab-case → rename it app-button.tsx"]);
  });
});

describe("settings", () => {
  test("renames the folders and suffixes the rules look for", () => {
    expect(
      lint({
        settings: {
          featuresDir: "modules",
          routeFolder: "routes",
          nonRouteFolders: ["ui", "state"],
          leafSuffixes: ["screen"],
          layoutSuffixes: ["shell"],
        },
        routes: `${ROUTES_IMPORT}export default [
          layout("modules/app/routes/app-main-shell.tsx", [
            index("modules/app/routes/app-home-screen.tsx"),
            route("x", "modules/app/routes/app-x-page.tsx"),
          ]),
        ];`,
        files: [
          "modules/app/routes/app-main-shell.tsx",
          "modules/app/routes/app-home-screen.tsx",
          "modules/app/routes/app-x-page.tsx",
          "modules/app/ui/app-button.tsx",
        ],
      }),
    ).toEqual([
      "role-suffix: modules/app/routes/app-x-page.tsx: leaf route → name it *-screen.tsx",
    ]);
  });

  test("fails loudly on an invalid setting", () => {
    expect(() => lint({ settings: { mode: "nested" }, routes: ROUTES_IMPORT, files: ["features/a/pages/a-page.tsx"] })).toThrow(/structure settings\["react-router"\]: mode must be "pages" or "flat"/);
  });
});
