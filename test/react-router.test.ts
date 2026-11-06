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

  test("says when an alias cannot be followed, and does not read a file out of the app folder", () => {
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
    ).toEqual(
      [
        `location: routes.ts: "~/features/auth/auth-routes" is not followed, so the routes it declares are not checked → import it with a relative path, or declare its alias in tsconfig.json compilerOptions.paths`,
        "no-loose-files: features/auth/auth-routes.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
        "reserved-suffixes: features/auth/pages/auth-login-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
      ].sort(),
    );
  });
});

describe("routes split with relative()", () => {
  const ADMIN_ROUTES = `import { relative } from "@react-router/dev/routes";
    const { route, index } = relative(import.meta.dirname);`;

  test("reads the documented form, relative(import.meta.dirname), even mixed with app-level helpers", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}import { adminRoutes } from "./features/admin/admin-routes";
          export default [route("admin", "features/admin/pages/admin-layout.tsx", adminRoutes)];`,
        sources: {
          "features/admin/admin-routes.ts": `${ADMIN_ROUTES}
            import { route as appRoute } from "@react-router/dev/routes";
            export const adminRoutes = [
              index("./pages/admin-home-page.tsx"),
              route("users", "pages/admin-users-page.tsx"),
              appRoute("audit", "features/admin/pages/admin-audit-page.tsx"),
            ];`,
        },
        files: [
          "features/admin/pages/admin-layout.tsx",
          "features/admin/pages/admin-home-page.tsx",
          "features/admin/pages/admin-users-page.tsx",
          "features/admin/pages/admin-audit-page.tsx",
        ],
      }),
    ).toEqual([]);
  });

  test("checks the routes its helpers declare, named by their path from the app folder", () => {
    expect(
      lint({
        routes: `import { adminRoutes } from "./features/admin/admin-routes";\nexport default [...adminRoutes];`,
        sources: {
          "features/admin/admin-routes.ts": `${ADMIN_ROUTES}
            export const adminRoutes = [route("users", "./pages/users.tsx"), route("x", "../x/x-page.tsx")];`,
        },
        files: ["features/admin/pages/users.tsx", "features/x/x-page.tsx"],
      }),
    ).toEqual(
      [
        "role-suffix: features/admin/pages/users.tsx: leaf route → name it *-page.tsx or *-redirect.tsx",
        "feature-prefix: features/admin/pages/users.tsx: the name does not start with its feature → rename it admin-…",
        "location: features/x/x-page.tsx: route modules live in features/<feature>/pages/ → move it there and update features/admin/admin-routes.ts",
      ].sort(),
    );
  });

  test("says when it cannot read a relative() call", () => {
    expect(
      lint({
        routes: `import { adminRoutes, otherRoutes } from "./features/admin/admin-routes";\nexport default [...adminRoutes, ...otherRoutes];`,
        sources: {
          "features/admin/admin-routes.ts": `import { relative } from "@react-router/dev/routes";
            const elsewhere = relative("/somewhere/else");
            const helpers = relative(import.meta.dirname);
            export const adminRoutes = [elsewhere.route("a", "a-page.tsx")];
            export const otherRoutes = [helpers.route("b", "./pages/admin-b-page.tsx")];`,
        },
      }),
    ).toEqual([
      "location: features/admin/admin-routes.ts: the routes declared through this relative() call are not checked → write const { route, index, layout } = relative(import.meta.dirname)",
      "location: features/admin/admin-routes.ts: the routes declared through this relative() call are not checked → write const { route, index, layout } = relative(import.meta.dirname)",
    ]);
  });
});

describe("computed route module paths", () => {
  test("says a computed path is not checked; the module it names still looks unrouted", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}const PAGES = "features/game/pages";
          const name = "game-page";
          export default [route("a", PAGES + "/game-page.tsx"), route("b", \`features/game/pages/\${name}.tsx\`), route("c", \`features/game/pages/game-c-page.tsx\`)];`,
        files: ["features/game/pages/game-page.tsx", "features/game/pages/game-c-page.tsx"],
      }),
    ).toEqual(
      [
        "location: routes.ts: a route module path is computed, so it is not checked → write it as a string literal",
        "location: routes.ts: a route module path is computed, so it is not checked → write it as a string literal",
        "reserved-suffixes: features/game/pages/game-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
      ].sort(),
    );
  });
});

describe("aliases", () => {
  test("follows the aliases of tsconfig.json paths, through extends, comments and trailing commas", () => {
    expect(
      lint({
        routes: `import { gameRoutes } from "@/features/game/game-routes";
          import { authRoutes } from "#auth-routes";
          export default [...gameRoutes, ...authRoutes];`,
        sources: {
          "../tsconfig.json": `{
            // the app's own config
            "extends": "./tsconfig.paths",
            "compilerOptions": { "strict": true, },
          }`,
          "../tsconfig.paths.json": `{ "compilerOptions": { /* aliases */ "paths": {
            "@/*": ["./missing/*", "./src/*"],
            "#auth-routes": ["./src/features/auth/auth-routes.ts"],
          } } }`,
          "features/game/game-routes.ts": `${ROUTES_IMPORT}export const gameRoutes = [route("g", "features/game/pages/game-page.tsx")];`,
          "features/auth/auth-routes.ts": `${ROUTES_IMPORT}export const authRoutes = [route("l", "features/auth/pages/auth-login-page.tsx")];`,
        },
        files: ["features/game/pages/game-page.tsx", "features/auth/pages/auth-login-page.tsx"],
      }),
    ).toEqual([]);
  });

  test("reads only route config files: a file without route helpers is not one, and what it imports is not read", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}import { ids } from "@/lib/route-ids";
          import { gameIds } from "./features/game/game-ids";
          export default [route(ids.game, "features/game/pages/game-page.tsx")];`,
        sources: {
          "../tsconfig.json": `{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`,
          "lib/route-ids.ts": `import { helper } from "@/features/game/game-helper";\nexport const ids = { game: helper };`,
          "features/game/game-helper.ts": `import { other } from "~/unknown";\nexport const helper = "g";`,
          "features/game/game-ids.ts": `export const gameIds = ["features/game/pages/game-old-page.tsx"];`,
        },
        files: ["features/game/pages/game-page.tsx", "features/game/pages/game-old-page.tsx"],
      }),
    ).toEqual(
      [
        "no-loose-files: features/game/game-helper.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
        "no-loose-files: features/game/game-ids.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)",
        "reserved-suffixes: features/game/pages/game-old-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it",
      ].sort(),
    );
  });

  test("leaves packages alone: dependencies of package.json, node builtins and @react-router/*", () => {
    expect(
      lint({
        routes: `${ROUTES_IMPORT}import { join } from "node:path";
          import { routeIds } from "@acme/route-ids/web";
          import kit from "kit";
          export default [route("g", "features/game/pages/game-page.tsx")];`,
        sources: { "../package.json": JSON.stringify({ dependencies: { "@acme/route-ids": "1" }, devDependencies: { kit: "1" } }) },
        files: ["features/game/pages/game-page.tsx"],
      }),
    ).toEqual([]);
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

describe("react-router-shared-imports", () => {
  /** Lints `apps/web` with only this rule on; `sources` as in `lint()`, `routes` defaults to a file declaring none. */
  function lintShared({ settings, routes = ROUTES_IMPORT, sources = {}, reactRouter = true }: Project): string[] {
    const tree: Record<string, string> = { "apps/web/src/routes.ts": routes };
    if (reactRouter) tree["apps/web/react-router.config.ts"] = 'export default { appDirectory: "src" };\n';
    for (const [file, text] of Object.entries(sources)) tree[`apps/web/src/${file}`] = text;
    const structure = settings ? { "react-router": settings } : undefined;
    return lintFixture({ files: tree, structure, rules: ["react-router-shared-imports"] }).map((line) =>
      line.replace(/^react-router-/, ""),
    );
  }

  const TSCONFIG = `{
    // the app's aliases
    "compilerOptions": { "paths": { "@/*": ["./src/*"], "@ui/*": ["../../packages/ui/*"], }, },
  }`;
  const fix = (feature: string) => `→ move it into ${feature}, or move what it imports out of the feature`;

  test("passes shared code that imports shared code and packages, and features that import shared code", () => {
    expect(
      lintShared({
        sources: {
          "../tsconfig.json": TSCONFIG,
          "lib/cn.ts": EMPTY_MODULE,
          "components/button.tsx": `import { cn } from "../lib/cn";\nimport { z } from "zod";\nimport { Card } from "@ui/card";\nimport "./button.css";\n`,
          "features/game/components/game-card.tsx": `import { cn } from "@/lib/cn";\nimport { Button } from "../../../components/button";\n`,
          "features/game/hooks/use-game.ts": `import { score } from "../lib/score";\n`,
          "features/game/lib/score.ts": EMPTY_MODULE,
        },
      }),
    ).toEqual([]);
  });

  test("reports each import of a feature: relative, aliased, type-only, re-exported or dynamic, in tests too", () => {
    expect(
      lintShared({
        sources: {
          "../tsconfig.json": TSCONFIG,
          "components/document-upload-form.tsx": `import type { Document } from "@/features/document/schemas/document.schema";
            import { documentSchema } from "../features/document/schemas/document.schema.ts";`,
          "hooks/use-auth.ts": `import { useAuthSession } from "@/features/auth/hooks/use-auth-session.js";`,
          "lib/game.ts": `export { useGame } from "@/features/game/hooks/use-game";
            export * from "@/features/game/lib/score";
            export const loadCard = () => import("@/features/game/components/game-card");`,
          "lib/cn.test.ts": `import { score } from "@/features/game/lib/score";`,
          "features/document/schemas/document.schema.ts": EMPTY_MODULE,
          "features/auth/hooks/use-auth-session.ts": EMPTY_MODULE,
          "features/game/hooks/use-game.ts": EMPTY_MODULE,
          "features/game/lib/score.ts": EMPTY_MODULE,
          "features/game/components/game-card.tsx": EMPTY_MODULE,
        },
      }),
    ).toEqual(
      [
        `shared-imports: components/document-upload-form.tsx: shared code imports features/document/schemas/document.schema.ts ${fix("features/document")}`,
        `shared-imports: components/document-upload-form.tsx: shared code imports features/document/schemas/document.schema.ts ${fix("features/document")}`,
        `shared-imports: hooks/use-auth.ts: shared code imports features/auth/hooks/use-auth-session.ts ${fix("features/auth")}`,
        `shared-imports: lib/game.ts: shared code imports features/game/hooks/use-game.ts ${fix("features/game")}`,
        `shared-imports: lib/game.ts: shared code imports features/game/lib/score.ts ${fix("features/game")}`,
        `shared-imports: lib/game.ts: shared code imports features/game/components/game-card.tsx ${fix("features/game")}`,
        `shared-imports: lib/cn.test.ts: shared code imports features/game/lib/score.ts ${fix("features/game")}`,
      ].sort(),
    );
  });

  test("names the innermost feature, and a file loose in features/", () => {
    expect(
      lintShared({
        sources: {
          "lib/price.ts": `import { plans } from "../features/billing/features/pricing/lib/plans";
            import { helper } from "../features/helpers";`,
          "features/billing/features/pricing/lib/plans.ts": EMPTY_MODULE,
          "features/helpers.ts": EMPTY_MODULE,
        },
      }),
    ).toEqual([
      `shared-imports: lib/price.ts: shared code imports features/billing/features/pricing/lib/plans.ts ${fix("features/billing/features/pricing")}`,
      "shared-imports: lib/price.ts: shared code imports features/helpers.ts → move what it imports out of features/",
    ]);
  });

  test("leaves alone route modules, route config files, root.tsx and entry.*, their tests, and files out of the source folder", () => {
    const importGame = (from: string) => `import { useGame } from "${from}/features/game/hooks/use-game";\n`;
    expect(
      lintShared({
        routes: `${ROUTES_IMPORT}import { gameRoutes } from "./features/game/game-routes";
          import { adminRoutes } from "./routes/admin-routes";
          export default [route("legacy", "routes/legacy-page.tsx"), ...gameRoutes, ...adminRoutes];`,
        sources: {
          "routes/admin-routes.ts": `${ROUTES_IMPORT}${importGame("..")}export const adminRoutes = [route("admin", "routes/admin-page.tsx")];`,
          "routes/admin-page.tsx": importGame(".."),
          "routes/legacy-page.tsx": importGame(".."),
          "routes/legacy-page.test.tsx": importGame(".."),
          "root.tsx": importGame("."),
          "root.test.tsx": importGame("."),
          "entry.client.tsx": importGame("."),
          "entry.server.tsx": importGame("."),
          "../tests/game.test.ts": importGame("../src"),
          "features/game/game-routes.ts": `${ROUTES_IMPORT}export const gameRoutes = [];`,
          "features/game/hooks/use-game.ts": EMPTY_MODULE,
        },
      }),
    ).toEqual([]);
  });

  const gameImport = {
    "lib/game.ts": `import { useGame } from "../features/game/hooks/use-game";\n`,
    "features/game/hooks/use-game.ts": EMPTY_MODULE,
  };

  test("stays silent with file-system routes, whose route modules it cannot tell", () => {
    const flatRoutes = `import { flatRoutes } from "@react-router/fs-routes";\nexport default flatRoutes();`;
    expect(lintShared({ sources: gameImport })).toEqual([
      `shared-imports: lib/game.ts: shared code imports features/game/hooks/use-game.ts ${fix("features/game")}`,
    ]);
    expect(lintShared({ routes: flatRoutes, sources: gameImport })).toEqual([]);
  });

  test("leaves a package that is not a React Router app alone", () => {
    expect(lintShared({ reactRouter: false, sources: gameImport })).toEqual([]);
  });

  test("follows featuresDir", () => {
    expect(
      lintShared({
        settings: { featuresDir: "modules" },
        sources: {
          "lib/game.ts": `import { useGame } from "../modules/game/hooks/use-game";\nimport { x } from "../features/x/lib/x";\n`,
          "modules/game/hooks/use-game.ts": EMPTY_MODULE,
          "features/x/lib/x.ts": EMPTY_MODULE,
        },
      }),
    ).toEqual([`shared-imports: lib/game.ts: shared code imports modules/game/hooks/use-game.ts ${fix("modules/game")}`]);
  });
});

describe("react-router-file-prefix", () => {
  /** Lints `apps/web` with only react-router-file-prefix on; returns its messages. */
  function lintPrefix({ settings, routes, files = [], reactRouter = true }: Project): string[] {
    const tree: Record<string, string> = {};
    if (reactRouter) tree["apps/web/react-router.config.ts"] = 'export default { appDirectory: "src" };\n';
    if (routes !== undefined) tree["apps/web/src/routes.ts"] = routes;
    for (const file of files) tree[`apps/web/src/${file}`] = EMPTY_MODULE;
    const structure = settings ? { "react-router": settings } : undefined;
    return lintFixture({ files: tree, structure, rules: ["react-router-file-prefix"] }).map((line) =>
      line.replace(/^react-router-file-prefix: /, ""),
    );
  }

  test("passes files named after a feature they sit in: singular, `.` separator, hooks after use-, nested features", () => {
    expect(
      lintPrefix({
        routes: `${ROUTES_IMPORT}export default [
          route("g", "features/game/pages/room-page.tsx"),
          route("p", "features/billing/features/pricing/pages/pricing-page.tsx"),
        ];`,
        files: [
          "features/game/pages/room-page.tsx",
          "features/game/components/game-card.tsx",
          "features/game/components/game.tsx",
          "features/game/lib/game.types.ts",
          "features/game/hooks/use-game-room.ts",
          "features/games/lib/game-score.ts",
          "features/categories/lib/category-tree.ts",
          "features/billing/features/pricing/lib/pricing-table.ts",
          "features/billing/features/pricing/lib/billing-plans.ts",
          "features/quiz/question-types/hex/hex-display.tsx",
        ],
      }),
    ).toEqual([]);
  });

  test("reports a file not named after its feature, and names the nearest feature, use- first for a hook", () => {
    expect(
      lintPrefix({
        routes: `${ROUTES_IMPORT}export default [route("p", "features/billing/features/pricing/pages/pricing-page.tsx")];`,
        files: [
          "features/admin/components/profile-section.tsx",
          "features/admin/hooks/use-batch-recipes.ts",
          "features/admin/types.ts",
          "features/billing/features/pricing/lib/plans.ts",
        ],
      }),
    ).toEqual(
      [
        "features/admin/components/profile-section.tsx: the name does not start with its feature → rename it admin-…",
        "features/admin/hooks/use-batch-recipes.ts: the name does not start with its feature → rename it use-admin-…",
        "features/admin/types.ts: the name does not start with its feature → rename it admin-…",
        "features/billing/features/pricing/lib/plans.ts: the name does not start with its feature → rename it pricing-…",
      ].sort(),
    );
  });

  test("names a file after the folders down to the first layer folder; a fix names only a feature", () => {
    expect(
      lintPrefix({
        routes: `${ROUTES_IMPORT}export default [route("s", "features/admin/structure/pages/structure-list-page.tsx")];`,
        files: [
          "features/admin/structure/pages/structure-list-page.tsx",
          "features/admin/structure/components/structure-table.tsx",
          "features/admin/structure/components/dialog-structure-create.tsx",
          "features/game/components/card/card-image.tsx",
          "features/game/components/card/game-card-image.tsx",
          "features/auth/schemas/login.schema.ts",
        ],
      }),
    ).toEqual(
      [
        "features/admin/structure/components/dialog-structure-create.tsx: the name does not start with its feature → rename it structure-…",
        "features/game/components/card/card-image.tsx: the name does not start with its feature → rename it game-…",
        "features/auth/schemas/login.schema.ts: the name does not start with its feature → rename it auth-…",
      ].sort(),
    );
  });

  test("a folder right after features/ is a feature, even named like a layer or not in kebab-case", () => {
    expect(
      lintPrefix({
        routes: ROUTES_IMPORT,
        files: [
          "features/pages/components/pages-text-article.tsx",
          "features/_agent/lib/agent-code-gen.ts",
          "features/_agent/config.ts",
        ],
      }),
    ).toEqual(["features/_agent/config.ts: the name does not start with its feature → rename it agent-…"]);
  });

  test("leaves route modules, tests, index files, files loose in features/ and the case of a name to other rules", () => {
    expect(
      lintPrefix({
        routes: `${ROUTES_IMPORT}export default [route("r", "features/game/pages/room-page.tsx"), route("x", "features/game/lib/robots.ts")];`,
        files: [
          "features/game/pages/room-page.tsx",
          "features/game/lib/robots.ts",
          "features/game/components/card.test.tsx",
          "features/game/lib/index.ts",
          "features/helpers.ts",
          "features/game/components/GameCard.tsx",
        ],
      }),
    ).toEqual([]);
  });

  test("skips the sharedFeatures, as react-router-feature-cycles does", () => {
    const files = ["features/common/utils/plan-tone.ts", "features/layout/hooks/use-breadcrumbs.ts", "features/game/lib/score.ts"];
    expect(lintPrefix({ routes: ROUTES_IMPORT, files })).toEqual([
      "features/game/lib/score.ts: the name does not start with its feature → rename it game-…",
    ]);
    expect(lintPrefix({ routes: ROUTES_IMPORT, files, settings: { sharedFeatures: [] } })).toEqual(
      [
        "features/common/utils/plan-tone.ts: the name does not start with its feature → rename it common-…",
        "features/layout/hooks/use-breadcrumbs.ts: the name does not start with its feature → rename it use-layout-…",
        "features/game/lib/score.ts: the name does not start with its feature → rename it game-…",
      ].sort(),
    );
  });

  test("mode flat: a sub-folder that holds route modules is a feature", () => {
    expect(
      lintPrefix({
        settings: { mode: "flat" },
        routes: `${ROUTES_IMPORT}export default [route("pricing", "features/billing/pricing/pricing-page.tsx")];`,
        files: [
          "features/billing/pricing/pricing-page.tsx",
          "features/billing/pricing/components/pricing-card.tsx",
          "features/billing/pricing/components/card.tsx",
          "features/billing/common/billing-promo.ts",
          "features/billing/common/promo.ts",
        ],
      }),
    ).toEqual(
      [
        "features/billing/pricing/components/card.tsx: the name does not start with its feature → rename it pricing-…",
        "features/billing/common/promo.ts: the name does not start with its feature → rename it billing-…",
      ].sort(),
    );
  });

  test("follows featuresDir, routeFolder and nonRouteFolders", () => {
    expect(
      lintPrefix({
        settings: { featuresDir: "modules", routeFolder: "routes", nonRouteFolders: ["ui"] },
        routes: `${ROUTES_IMPORT}export default [route("a", "modules/app/routes/app-page.tsx")];`,
        files: [
          "modules/app/routes/app-page.tsx",
          "modules/app/routes/helper.ts",
          "modules/app/ui/widget/widget-icon.tsx",
          "modules/app/components/components-list.tsx",
          "features/app/lib/helper.ts",
        ],
      }),
    ).toEqual(
      [
        "modules/app/routes/helper.ts: the name does not start with its feature → rename it app-…",
        "modules/app/ui/widget/widget-icon.tsx: the name does not start with its feature → rename it app-…",
      ].sort(),
    );
  });

  test("stays silent without a routes file: it cannot tell route modules apart", () => {
    expect(lintPrefix({ files: ["features/game/components/card.tsx"] })).toEqual([]);
  });

  test("stays silent on file-system routes: it cannot tell route modules apart", () => {
    expect(
      lintPrefix({
        routes: `import { flatRoutes } from "@react-router/fs-routes";\nexport default flatRoutes();\n`,
        files: ["features/game/components/card.tsx"],
      }),
    ).toEqual([]);
  });

  test("leaves a package that is not a React Router app alone", () => {
    expect(lintPrefix({ reactRouter: false, files: ["features/game/components/card.tsx"] })).toEqual([]);
  });
});

describe("react-router-feature-cycles", () => {
  // Inline comments and a trailing comma, as real tsconfig files carry them.
  const TSCONFIG = `{
    "compilerOptions": {
      // every feature imports the others through @/
      "paths": { "@/*": ["./src/*"] },
    },
  }`;

  /** Lints `apps/web` with this rule alone; `sources` are files under `apps/web/src` with their text. */
  function lintCycles(sources: Record<string, string>, settings?: Record<string, unknown>, reactRouter = true): string[] {
    const tree: Record<string, string> = { "apps/web/tsconfig.json": TSCONFIG, "apps/web/src/routes.ts": ROUTES_IMPORT };
    if (reactRouter) tree["apps/web/react-router.config.ts"] = 'export default { appDirectory: "src" };\n';
    for (const [file, text] of Object.entries(sources)) tree[`apps/web/src/${file}`] = text;
    return lintFixture({
      files: tree,
      structure: settings ? { "react-router": settings } : undefined,
      rules: ["react-router-feature-cycles"],
    });
  }

  const CRATE_DOWNLOAD = {
    "features/crate/utils/crate-queries.ts":
      'import { downloadState } from "../../download/utils/download-state";\nexport const crateQueries = downloadState;\n',
    "features/crate/components/crate-list.tsx":
      'import { useDownload } from "@/features/download/hooks/use-download";\nexport const CrateList = () => useDownload();\n',
    "features/crate/pages/crate-page.tsx":
      'import { downloadState } from "@/features/download/utils/download-state";\nexport default () => downloadState;\n',
    "features/download/utils/download-state.ts": "export const downloadState = 1;\n",
    "features/download/hooks/use-download.ts": "export const useDownload = () => 1;\n",
    // Two imports of one file count once; a dynamic import counts.
    "features/download/utils/download-cache.ts": [
      'import type { CrateQueries } from "@/features/crate/utils/crate-queries";',
      'import { crateQueries } from "@/features/crate/utils/crate-queries";',
      'export const list = () => import("@/features/crate/components/crate-list");',
      "export type Cache = CrateQueries | typeof crateQueries;",
      "",
    ].join("\n"),
  };

  test("reports the side with fewer imports, once per file it imports, with the other side's count", () => {
    expect(lintCycles(CRATE_DOWNLOAD)).toEqual(
      [
        "react-router-feature-cycles: features/download/utils/download-cache.ts: imports features/crate, which imports features/download (3 imports) → move utils/crate-queries.ts out of crate (to lib/ or download), or merge the two features",
        "react-router-feature-cycles: features/download/utils/download-cache.ts: imports features/crate, which imports features/download (3 imports) → move components/crate-list.tsx out of crate (to lib/ or download), or merge the two features",
      ].sort(),
    );
  });

  test("passes imports one way, inside a feature, and from or to tests", () => {
    expect(
      lintCycles({
        "features/game/game-board.ts": 'import { score } from "@/features/score/score-total";\nexport const board = score;\n',
        "features/game/game-board.test.ts": 'import { score } from "@/features/score/score-total";\nexport const cases = [score];\n',
        "features/score/score-total.ts": "export const score = 1;\n",
        "features/score/score-total.test.ts": 'import { board } from "@/features/game/game-board";\n',
        "features/score/score-fixture.ts":
          'import { cases } from "@/features/game/game-board.test";\nexport const fixture = cases;\n',
        "features/billing/billing-plan.ts": 'import { price } from "./features/pricing/pricing-price";\nexport const plan = price;\n',
        "features/billing/features/pricing/pricing-price.ts":
          'import { plan } from "../../billing-plan";\nexport const price = plan;\n',
      }),
    ).toEqual([]);
  });

  test("on a tie, reports the side of the feature whose name sorts first", () => {
    expect(
      lintCycles({
        "features/beta/beta-y.ts": 'import { a } from "../alpha/alpha-x";\nexport const b = a;\n',
        "features/alpha/alpha-x.ts": 'import { b } from "@/features/beta/beta-y";\nexport const a = b;\n',
      }),
    ).toEqual([
      "react-router-feature-cycles: features/alpha/alpha-x.ts: imports features/beta, which imports features/alpha (1 import) → move beta-y.ts out of beta (to lib/ or alpha), or merge the two features",
    ]);
  });

  test("reports an import no import node holds, a type-level import(), on the file", () => {
    expect(
      lintCycles({
        "features/beta/beta-y.ts": 'import { a } from "../alpha/alpha-x";\nexport const b = a;\n',
        "features/alpha/alpha-x.ts": 'export type B = typeof import("@/features/beta/beta-y");\nexport const a = 1;\n',
      }),
    ).toEqual([
      "react-router-feature-cycles: features/alpha/alpha-x.ts: imports features/beta, which imports features/alpha (1 import) → move beta-y.ts out of beta (to lib/ or alpha), or merge the two features",
    ]);
  });

  const LAYOUT_ORGANIZATION = {
    "features/layout/components/layout-header.tsx":
      'import { Menu } from "@/features/organization/organization-menu";\nexport const Header = Menu;\n',
    "features/organization/organization-menu.tsx":
      'import { Header } from "@/features/layout/components/layout-header";\nexport const Menu = Header;\n',
  };

  test("exempts the shared features, named by sharedFeatures", () => {
    expect(lintCycles(LAYOUT_ORGANIZATION)).toEqual([]);
    expect(lintCycles(LAYOUT_ORGANIZATION, { sharedFeatures: ["common"] })).toEqual([
      "react-router-feature-cycles: features/layout/components/layout-header.tsx: imports features/organization, which imports features/layout (1 import) → move organization-menu.tsx out of organization (to lib/ or layout), or merge the two features",
    ]);
  });

  test("follows featuresDir", () => {
    const modules = Object.fromEntries(
      Object.entries(LAYOUT_ORGANIZATION).map(([file, text]) => [
        file.replace(/^features/, "modules"),
        text.replaceAll("@/features", "@/modules"),
      ]),
    );
    expect(lintCycles(modules, { featuresDir: "modules", sharedFeatures: [] })).toEqual([
      "react-router-feature-cycles: modules/layout/components/layout-header.tsx: imports modules/organization, which imports modules/layout (1 import) → move organization-menu.tsx out of organization (to lib/ or layout), or merge the two features",
    ]);
  });

  test("leaves alone what is not a React Router app", () => {
    expect(lintCycles(CRATE_DOWNLOAD, undefined, false)).toEqual([]);
  });

  test("fails loudly on an invalid sharedFeatures", () => {
    expect(() => lintCycles(LAYOUT_ORGANIZATION, { sharedFeatures: "layout" })).toThrow(
      /structure settings\["react-router"\]: sharedFeatures must be a list of names/,
    );
  });
});
