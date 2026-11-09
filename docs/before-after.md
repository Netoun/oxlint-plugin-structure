# Before / after: every rule, every message

A made-up monorepo that breaks every rule of the plugin, then the same monorepo once each fix is
applied. It covers all 20 rules, opt-in ones included, and every case each rule reports: 46 errors
before, none after.

The output below is not written by hand. Both trees were linted by the real oxlint CLI against the
built plugin (`dist/`), with default settings and this config, which turns on all 20 rules:

```jsonc
// .oxlintrc.json
{
  "extends": ["./node_modules/@netoun/oxlint-plugin-structure/recommended.json"],
  "rules": {
    "structure/react-router-file-prefix": "error",
    "structure/react-router-feature-cycles": "error",
    "structure/elysia-file-prefix": "error",
    "structure/nestjs-file-prefix": "error"
  }
}
```

Five apps, one config, no per-folder overrides:

| App         | Stack        | Shows                                                                 |
| ----------- | ------------ | --------------------------------------------------------------------- |
| `web`       | React Router | every `react-router-*` rule, mode `pages`                             |
| `blog`      | React Router | file-system routes (`flatRoutes()`)                                   |
| `landing`   | React Router | `appDirectory` without a `routes.ts`                                  |
| `api`       | Elysia       | every `elysia-*` rule                                                 |
| `admin-api` | NestJS       | every `nestjs-*` rule                                                 |

`mode` is one setting per config, so mode `flat` gets its own repo at the end:
[Mode flat](#mode-flat-another-repo).

## Before

`✗` marks a file reported by a rule (prefix `react-router-`, `elysia-` or `nestjs-` left out).
"(in routes.ts)" means the error is reported on the path string in the route config, not on the file.

```text
apps/
├── web/                                        React Router, mode "pages"
│   ├── app/
│   │   ├── components/
│   │   │   └── app-header.tsx                  ✗ shared-imports
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── pages/
│   │   │   │   │   └── admin-page.tsx          ✗ reserved-suffixes
│   │   │   │   └── admin-routes.ts             ✗ no-loose-files
│   │   │   ├── billing/
│   │   │   │   ├── components/
│   │   │   │   │   └── billing-badge.tsx
│   │   │   │   ├── lib/
│   │   │   │   │   └── billing-plans.ts
│   │   │   │   ├── pages/
│   │   │   │   │   └── billing-page.tsx
│   │   │   │   └── billing-routes.ts           ✗ location
│   │   │   ├── game/
│   │   │   │   ├── components/
│   │   │   │   │   ├── game-format.ts          ✗ folder-contents
│   │   │   │   │   ├── score-board.tsx         ✗ file-prefix
│   │   │   │   │   └── use-score.ts            ✗ folder-contents, file-prefix
│   │   │   │   ├── hooks/
│   │   │   │   │   └── game-timer.ts           ✗ folder-contents
│   │   │   │   ├── lib/
│   │   │   │   │   ├── _.ts                    ✗ file-case, file-prefix
│   │   │   │   │   ├── game-limits.ts
│   │   │   │   │   └── game-pricing.ts         ✗ feature-cycles
│   │   │   │   ├── pages/
│   │   │   │   │   ├── game-helpers.ts         ✗ no-loose-files
│   │   │   │   │   ├── game-list.tsx           ✗ role-suffix (in routes.ts)
│   │   │   │   │   ├── game-rules-page.tsx     ✗ reserved-suffixes
│   │   │   │   │   ├── game-shell.tsx          ✗ role-suffix (in routes.ts)
│   │   │   │   │   ├── game-stats-page.tsx     ✗ reserved-suffixes
│   │   │   │   │   └── room-page.tsx           ✗ feature-prefix (in routes.ts)
│   │   │   │   ├── utils/
│   │   │   │   │   └── game-badge.tsx          ✗ folder-contents
│   │   │   │   └── GameCard.tsx                ✗ file-case, no-loose-files
│   │   │   ├── home/
│   │   │   │   └── pages/
│   │   │   │       └── home-page.tsx
│   │   │   └── tracking.ts                     ✗ no-loose-files
│   │   ├── lib/
│   │   │   └── analytics.ts                    ✗ shared-imports
│   │   ├── routes/
│   │   │   └── settings-page.tsx               ✗ location (in routes.ts)
│   │   ├── root.tsx
│   │   └── routes.ts                           ✗ location ×2
│   ├── package.json
│   └── react-router.config.ts
├── blog/                                       React Router, file-system routes
│   ├── app/
│   │   ├── routes/
│   │   │   ├── _index.tsx
│   │   │   └── posts.$slug.tsx
│   │   ├── root.tsx
│   │   └── routes.ts                           ✗ location
│   ├── package.json
│   └── react-router.config.ts
├── landing/                                    React Router, appDirectory "src"
│   ├── src/
│   │   ├── features/
│   │   │   └── hero/
│   │   │       └── pages/
│   │   │           └── hero-page.tsx           ✗ no-loose-files
│   │   └── root.tsx
│   ├── package.json
│   ├── react-router.config.ts
│   └── routes.ts                               outside appDirectory
├── api/                                        Elysia
│   ├── src/
│   │   └── modules/
│   │       ├── games/
│   │       │   ├── games.contract.ts           ✗ contract-location
│   │       │   ├── games.module.ts
│   │       │   ├── games.routes.ts
│   │       │   ├── rankings.service.ts         ✗ role-prefix
│   │       │   └── scoring.ts                  ✗ file-prefix
│   │       ├── players/
│   │       │   └── players.routes.ts           ✗ module-entry
│   │       └── helpers.ts                      ✗ module-entry
│   └── package.json
└── admin-api/                                  NestJS
    ├── src/
    │   └── modules/
    │       ├── audit/
    │       │   └── audit.service.ts            ✗ module-entry
    │       ├── billing/
    │       │   ├── checkout/
    │       │   │   ├── entities/
    │       │   │   │   └── checkout-line.entity.ts
    │       │   │   ├── checkout-session.entity.ts  ✗ entity-location
    │       │   │   └── checkout.controller.ts
    │       │   ├── billing.controller.ts       ✗ class-name          (holds PaymentsController)
    │       │   ├── billing.cookie-domain.ts    ✗ role-vocabulary
    │       │   ├── billing.module.ts
    │       │   ├── billing.service.ts          ✗ class-name          (holds InvoiceService, RefundService)
    │       │   ├── billing.webhook-guard.ts    ✗ role-vocabulary
    │       │   ├── invoice.entity.ts           ✗ entity-location, role-prefix
    │       │   ├── refund.entity.ts            ✗ entity-location, role-prefix
    │       │   ├── retry-policy.ts             ✗ file-prefix
    │       │   └── stripe.client.ts            ✗ role-prefix
    │       ├── posts/
    │       │   ├── post.entity.ts
    │       │   └── posts.module.ts
    │       └── constants.ts                    ✗ module-entry
    └── package.json
```

Each `*.entity.ts` declares its class with `@Entity()`: `nestjs-entity-location` only counts files
that declare one.

The `web` route config, where the route-module rules report:

```ts
// apps/web/app/routes.ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";
import { adminRoutes } from "~/features/admin/admin-routes";
import { billingRoutes } from "./features/billing/billing-routes";

const GAME_PAGES = "features/game/pages";

export default [
  index("features/home/pages/home-page.tsx"),
  layout("features/game/pages/game-shell.tsx", [
    route("games", "features/game/pages/game-list.tsx"),
    route("games/:id", "features/game/pages/room-page.tsx"),
    route("games/:id/stats", GAME_PAGES + "/game-stats-page.tsx"),
  ]),
  route("settings", "routes/settings-page.tsx"),
  ...adminRoutes,
  ...billingRoutes,
] satisfies RouteConfig;
```

```ts
// apps/web/app/features/admin/admin-routes.ts
import { type RouteConfig, route } from "@react-router/dev/routes";

export const adminRoutes = [route("admin", "features/admin/pages/admin-page.tsx")] satisfies RouteConfig;
```

```ts
// apps/web/app/features/billing/billing-routes.ts
import { type RouteConfig, relative } from "@react-router/dev/routes";

const billing = relative(import.meta.dirname);

export const billingRoutes = [billing.route("billing", "./pages/billing-page.tsx")] satisfies RouteConfig;
```

```ts
// apps/blog/app/routes.ts
import { flatRoutes } from "@react-router/fs-routes";

export default flatRoutes();
```

The imports that cross a boundary:

```text
components/app-header.tsx     → features/billing/components/billing-badge.tsx
lib/analytics.ts              → features/tracking.ts
features/game/lib/game-pricing.ts      → features/billing/lib/billing-plans.ts     game → billing: 1
features/billing/pages/billing-page.tsx → features/game/lib/game-pricing.ts        billing → game: 2
features/billing/lib/billing-plans.ts   → features/game/lib/game-limits.ts
```

### `oxlint .` — 46 errors, exit code 1

```text
apps/web/app/routes.ts:2:29: error structure(react-router-location): routes.ts: "~/features/admin/admin-routes" is not followed, so the routes it declares are not checked → import it with a relative path, or declare its alias in tsconfig.json compilerOptions.paths
apps/web/app/routes.ts:9:10: error structure(react-router-role-suffix): features/game/pages/game-shell.tsx: has child routes, so it is a layout → name it *-layout.tsx
apps/web/app/routes.ts:10:20: error structure(react-router-role-suffix): features/game/pages/game-list.tsx: leaf route → name it *-page.tsx or *-redirect.tsx
apps/web/app/routes.ts:11:24: error structure(react-router-feature-prefix): features/game/pages/room-page.tsx: the name does not start with its feature → rename it game-…
apps/web/app/routes.ts:12:30: error structure(react-router-location): routes.ts: a route module path is computed, so it is not checked → write it as a string literal
apps/web/app/routes.ts:14:21: error structure(react-router-location): routes/settings-page.tsx: route modules live in features/<feature>/pages/ → move it there and update routes.ts
apps/web/app/features/billing/billing-routes.ts:3:17: error structure(react-router-location): features/billing/billing-routes.ts: the routes declared through this relative() call are not checked → write const { route, index, layout } = relative(import.meta.dirname)
apps/web/app/features/admin/admin-routes.ts:1:1: error structure(react-router-no-loose-files): features/admin/admin-routes.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)
apps/web/app/features/admin/pages/admin-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/admin/pages/admin-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
apps/web/app/features/game/pages/game-rules-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/game/pages/game-rules-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
apps/web/app/features/game/pages/game-stats-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/game/pages/game-stats-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
apps/web/app/features/game/pages/game-helpers.ts:1:1: error structure(react-router-no-loose-files): features/game/pages/game-helpers.ts: only route modules live in features/<feature>/pages/ → move it to a subfolder (components/, hooks/, lib/…)
apps/web/app/features/game/GameCard.tsx:1:1: error structure(react-router-file-case): features/game/GameCard.tsx: the name is not kebab-case → rename it game-card.tsx
apps/web/app/features/game/GameCard.tsx:1:1: error structure(react-router-no-loose-files): features/game/GameCard.tsx: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)
apps/web/app/features/game/lib/_.ts:1:1: error structure(react-router-file-case): features/game/lib/_.ts: the name is not kebab-case → rename it with lowercase words joined by -
apps/web/app/features/game/lib/_.ts:1:1: error structure(react-router-file-prefix): features/game/lib/_.ts: the name does not start with its feature → rename it game-…
apps/web/app/features/game/hooks/game-timer.ts:1:1: error structure(react-router-folder-contents): features/game/hooks/game-timer.ts: hooks/ holds hooks → name it use-….ts, or move it to lib/
apps/web/app/features/game/components/use-score.ts:1:1: error structure(react-router-folder-contents): features/game/components/use-score.ts: components/ holds components (.tsx) → move it to hooks/
apps/web/app/features/game/components/use-score.ts:1:1: error structure(react-router-file-prefix): features/game/components/use-score.ts: the name does not start with its feature → rename it use-game-…
apps/web/app/features/game/components/game-format.ts:1:1: error structure(react-router-folder-contents): features/game/components/game-format.ts: components/ holds components (.tsx) → move it to lib/
apps/web/app/features/game/utils/game-badge.tsx:1:1: error structure(react-router-folder-contents): features/game/utils/game-badge.tsx: utils/ holds no component → move it to components/
apps/web/app/features/game/components/score-board.tsx:1:1: error structure(react-router-file-prefix): features/game/components/score-board.tsx: the name does not start with its feature → rename it game-…
apps/web/app/features/tracking.ts:1:1: error structure(react-router-no-loose-files): features/tracking.ts: no loose file directly in features/ → move it into a feature
apps/web/app/components/app-header.tsx:1:30: error structure(react-router-shared-imports): components/app-header.tsx: shared code imports features/billing/components/billing-badge.tsx → move it into features/billing, or move what it imports out of the feature
apps/web/app/lib/analytics.ts:1:23: error structure(react-router-shared-imports): lib/analytics.ts: shared code imports features/tracking.ts → move what it imports out of features/
apps/web/app/features/game/lib/game-pricing.ts:1:23: error structure(react-router-feature-cycles): features/game/lib/game-pricing.ts: imports features/billing, which imports features/game (2 imports) → move lib/billing-plans.ts out of billing (to lib/ or game), or merge the two features

apps/blog/app/routes.ts:3:16: error structure(react-router-location): routes.ts: file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app

apps/landing/src/features/hero/pages/hero-page.tsx:1:1: error structure(react-router-no-loose-files): features/hero/pages/hero-page.tsx: react-router.config.ts points at src/, which has no routes.ts → add src/routes.ts, or fix appDirectory

apps/api/src/modules/helpers.ts:1:1: error structure(elysia-module-entry): modules/helpers.ts: no loose file in modules/ → put it in a module folder
apps/api/src/modules/players/players.routes.ts:1:1: error structure(elysia-module-entry): modules/players/players.routes.ts: modules/players/ has no players.module.ts → add it, or move this file out of modules/
apps/api/src/modules/games/rankings.service.ts:1:1: error structure(elysia-role-prefix): modules/games/rankings.service.ts: service files start with their module (games.service.ts, games-….service.ts) → rename it, or move it to the module it belongs to
apps/api/src/modules/games/scoring.ts:1:1: error structure(elysia-file-prefix): modules/games/scoring.ts: the name does not start with its module → rename it games.… or games-…
apps/api/src/modules/games/games.contract.ts:1:1: error structure(elysia-contract-location): modules/games/games.contract.ts: a module's contract sits in its root → move it to modules/games/contracts/

apps/admin-api/src/modules/constants.ts:1:1: error structure(nestjs-module-entry): modules/constants.ts: no loose file in modules/ → put it in a module folder
apps/admin-api/src/modules/audit/audit.service.ts:1:1: error structure(nestjs-module-entry): modules/audit/audit.service.ts: modules/audit/ has no audit.module.ts → add it, or move this file out of modules/
apps/admin-api/src/modules/billing/stripe.client.ts:1:1: error structure(nestjs-role-prefix): modules/billing/stripe.client.ts: client files start with their module (billing.client.ts, billing-….client.ts) → rename it, or move it to the module it belongs to
apps/admin-api/src/modules/billing/invoice.entity.ts:1:1: error structure(nestjs-role-prefix): modules/billing/invoice.entity.ts: entity files start with their module (billing.entity.ts, billing-….entity.ts) → rename it, or move it to the module it belongs to
apps/admin-api/src/modules/billing/refund.entity.ts:1:1: error structure(nestjs-role-prefix): modules/billing/refund.entity.ts: entity files start with their module (billing.entity.ts, billing-….entity.ts) → rename it, or move it to the module it belongs to
apps/admin-api/src/modules/billing/retry-policy.ts:1:1: error structure(nestjs-file-prefix): modules/billing/retry-policy.ts: the name does not start with its module → rename it billing.… or billing-…
apps/admin-api/src/modules/billing/invoice.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/invoice.entity.ts: 2 entities sit at the module root → move them to modules/billing/entities/
apps/admin-api/src/modules/billing/refund.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/refund.entity.ts: 2 entities sit at the module root → move them to modules/billing/entities/
apps/admin-api/src/modules/billing/checkout/checkout-session.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/checkout/checkout-session.entity.ts: an entity sits at the sub-feature root beside entities/ → move it to modules/billing/checkout/entities/
apps/admin-api/src/modules/billing/billing.controller.ts:1:1: error structure(nestjs-class-name): modules/billing/billing.controller.ts: the class is PaymentsController → name it BillingController, or rename the file after the class
apps/admin-api/src/modules/billing/billing.service.ts:1:1: error structure(nestjs-class-name): modules/billing/billing.service.ts: the classes are InvoiceService, RefundService → name one of them BillingService, or split the file, one class per file named after it
apps/admin-api/src/modules/billing/billing.cookie-domain.ts:1:1: error structure(nestjs-role-vocabulary): modules/billing/billing.cookie-domain.ts: cookie-domain is not a role (module, controller, service…) → rename it billing-cookie-domain.ts, or add cookie-domain to settings.structure.nestjs.extraRoles
apps/admin-api/src/modules/billing/billing.webhook-guard.ts:1:1: error structure(nestjs-role-vocabulary): modules/billing/billing.webhook-guard.ts: webhook-guard is not a role (module, controller, service…) → rename it billing-webhook.guard.ts, or add webhook-guard to settings.structure.nestjs.extraRoles
```

## The fixes, one row per case

Paths are relative to the app's source folder (`app/`, `src/`) or `src/modules/`, as in the messages.
A ↳ row is a knock-on error: it disappears with the fix of the nearest row above it without ↳.

### React Router

| Rule | Case | Before | After |
| --- | --- | --- | --- |
| `react-router-role-suffix` | route with children, not named as a layout | `features/game/pages/game-shell.tsx` | `features/game/pages/game-layout.tsx` |
| `react-router-role-suffix` | leaf route, not named as a page | `features/game/pages/game-list.tsx` | `features/game/pages/game-list-page.tsx` |
| `react-router-feature-prefix` | route module without its feature's name | `features/game/pages/room-page.tsx` | `features/game/pages/game-room-page.tsx` |
| `react-router-location` | route module outside `features/<f>/pages/` | `routes/settings-page.tsx` | `features/settings/pages/settings-page.tsx` |
| `react-router-location` | computed route module path | `GAME_PAGES + "/game-stats-page.tsx"` | `"features/game/pages/game-stats-page.tsx"` |
| ↳ `react-router-reserved-suffixes` | the module of a computed path looks unrouted | `features/game/pages/game-stats-page.tsx` | same file, now read |
| `react-router-location` | route config import that is neither relative nor an alias | `~/features/admin/admin-routes`, no `paths` | `tsconfig.json`: `"paths": { "~/*": ["./app/*"] }` |
| ↳ `react-router-no-loose-files` | the unread config file looks like a loose file | `features/admin/admin-routes.ts` | same file, now part of the route config |
| ↳ `react-router-reserved-suffixes` | the route it declares looks unrouted | `features/admin/pages/admin-page.tsx` | same file, now read |
| `react-router-location` | `relative()` not destructured | `const billing = relative(import.meta.dirname)` | `const { route } = relative(import.meta.dirname)` |
| `react-router-location` | file-system routes | `blog`: `flatRoutes()` + `routes/_index.tsx`, `routes/posts.$slug.tsx` | `index()`/`route()` + `features/post/pages/post-list-page.tsx`, `post-page.tsx` |
| `react-router-reserved-suffixes` | `-page` file that no route declares | `features/game/pages/game-rules-page.tsx` | `route("games/rules", …)` added |
| `react-router-no-loose-files` | `appDirectory` without a `routes.ts` | `landing`: `routes.ts` at the package root | `landing`: `src/routes.ts` |
| `react-router-no-loose-files` | file directly in `features/` | `features/tracking.ts` | `lib/tracking.ts` |
| `react-router-no-loose-files` | file at a feature root | `features/game/GameCard.tsx` | `features/game/components/game-card.tsx` |
| `react-router-no-loose-files` | non-route file in `pages/` | `features/game/pages/game-helpers.ts` | `features/game/lib/game-helpers.ts` |
| `react-router-file-case` | name with a kebab-case equivalent | `features/game/GameCard.tsx` | `features/game/components/game-card.tsx` |
| `react-router-file-case` | name with no letter or digit to keep | `features/game/lib/_.ts` | `features/game/lib/game-utils.ts` |
| `react-router-folder-contents` | `hooks/` file without `use-` | `features/game/hooks/game-timer.ts` | `features/game/hooks/use-game-timer.ts` |
| `react-router-folder-contents` | hook in `components/` | `features/game/components/use-score.ts` | `features/game/hooks/use-game-score.ts` |
| `react-router-folder-contents` | non-component in `components/` | `features/game/components/game-format.ts` | `features/game/lib/game-format.ts` |
| `react-router-folder-contents` | component in `lib/` or `utils/` | `features/game/utils/game-badge.tsx` | `features/game/components/game-badge.tsx` |
| `react-router-shared-imports` | shared code imports a feature's file | `components/app-header.tsx` → `features/billing/components/billing-badge.tsx` | badge moved to `components/plan-badge.tsx` |
| `react-router-shared-imports` | shared code imports a file loose in `features/` | `lib/analytics.ts` → `features/tracking.ts` | `lib/analytics.ts` → `lib/tracking.ts` |
| `react-router-file-prefix` | feature file without its feature's name | `features/game/components/score-board.tsx` | `features/game/components/game-score-board.tsx` |
| `react-router-file-prefix` | hook: the prefix goes after `use-` | `features/game/components/use-score.ts` | `features/game/hooks/use-game-score.ts` |
| `react-router-feature-cycles` | two features import each other | `game` → `billing` 1×, `billing` → `game` 2× | `billing/lib/billing-plans.ts` moved to `game/lib/game-plans.ts`: `billing` → `game` only |
| `react-router-location` | route module outside `features/<f>/` (mode flat) | see [Mode flat](#mode-flat-another-repo) | |
| `react-router-no-loose-files` | non-route file beside route modules (mode flat) | see [Mode flat](#mode-flat-another-repo) | |

### Elysia

| Rule | Case | Before | After |
| --- | --- | --- | --- |
| `elysia-role-prefix` | role file named after another module | `games/rankings.service.ts` | `games/games-rankings.service.ts` |
| `elysia-file-prefix` | other file without the module's name | `games/scoring.ts` | `games/game-scoring.ts` (the singular counts) |
| `elysia-module-entry` | file loose in `modules/` | `helpers.ts` | `src/lib/helpers.ts` |
| `elysia-module-entry` | module folder without `<module>.module.ts` | `players/players.routes.ts` | `players/players.module.ts` added |
| `elysia-contract-location` | module contract at the module root | `games/games.contract.ts` | `games/contracts/games.contract.ts` |

### NestJS

| Rule | Case | Before | After |
| --- | --- | --- | --- |
| `nestjs-role-prefix` | role file named after something else | `billing/stripe.client.ts` | `billing/billing-stripe.client.ts` (`BillingStripeClient`) |
| `nestjs-file-prefix` | other file without the module's name | `billing/retry-policy.ts` | `billing/billing-retry-policy.ts` |
| `nestjs-module-entry` | file loose in `modules/` | `constants.ts` | `src/constants.ts` |
| `nestjs-module-entry` | module folder without `<module>.module.ts` | `audit/audit.service.ts` | `audit/audit.module.ts` added |
| `nestjs-entity-location` | several entities at a module root | `billing/invoice.entity.ts`, `billing/refund.entity.ts` | `billing/entities/invoice.entity.ts`, `billing/entities/refund.entity.ts` |
| ↳ `nestjs-role-prefix` | entity at the root, not named after the module | `billing/invoice.entity.ts`, `billing/refund.entity.ts` | in `billing/entities/`, files are named after what they hold |
| `nestjs-entity-location` | one entity beside an `entities/` folder (sub-feature) | `billing/checkout/checkout-session.entity.ts` | `billing/checkout/entities/checkout-session.entity.ts` |
| `nestjs-class-name` | the class is not named after the file | `billing.controller.ts` holds `PaymentsController` | holds `BillingController` |
| `nestjs-class-name` | several classes, none named after the file | `billing.service.ts` holds `InvoiceService`, `RefundService` | split: `billing-invoice.service.ts` (`BillingInvoiceService`), `billing-refund.service.ts` (`BillingRefundService`) |
| `nestjs-role-vocabulary` | dotted topic, no role in it | `billing/billing.cookie-domain.ts` | `billing/billing-cookie-domain.ts` |
| `nestjs-role-vocabulary` | dotted topic ending in a role | `billing/billing.webhook-guard.ts` | `billing/billing-webhook.guard.ts` (`BillingWebhookGuard`) |

`posts/post.entity.ts` passes before and after: one entity at a module root, named after the
module's singular.

## After

```text
apps/
├── web/
│   ├── app/
│   │   ├── components/
│   │   │   ├── app-header.tsx
│   │   │   └── plan-badge.tsx
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── pages/
│   │   │   │   │   └── admin-page.tsx
│   │   │   │   └── admin-routes.ts
│   │   │   ├── billing/
│   │   │   │   ├── pages/
│   │   │   │   │   └── billing-page.tsx
│   │   │   │   └── billing-routes.ts
│   │   │   ├── game/
│   │   │   │   ├── components/
│   │   │   │   │   ├── game-badge.tsx
│   │   │   │   │   ├── game-card.tsx
│   │   │   │   │   └── game-score-board.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── use-game-score.ts
│   │   │   │   │   └── use-game-timer.ts
│   │   │   │   ├── lib/
│   │   │   │   │   ├── game-format.ts
│   │   │   │   │   ├── game-helpers.ts
│   │   │   │   │   ├── game-limits.ts
│   │   │   │   │   ├── game-plans.ts
│   │   │   │   │   ├── game-pricing.ts
│   │   │   │   │   └── game-utils.ts
│   │   │   │   └── pages/
│   │   │   │       ├── game-layout.tsx
│   │   │   │       ├── game-list-page.tsx
│   │   │   │       ├── game-room-page.tsx
│   │   │   │       ├── game-rules-page.tsx
│   │   │   │       └── game-stats-page.tsx
│   │   │   ├── home/
│   │   │   │   └── pages/
│   │   │   │       └── home-page.tsx
│   │   │   └── settings/
│   │   │       └── pages/
│   │   │           └── settings-page.tsx
│   │   ├── lib/
│   │   │   ├── analytics.ts
│   │   │   └── tracking.ts
│   │   ├── root.tsx
│   │   └── routes.ts
│   ├── package.json
│   ├── react-router.config.ts
│   └── tsconfig.json
├── blog/
│   ├── app/
│   │   ├── features/
│   │   │   └── post/
│   │   │       └── pages/
│   │   │           ├── post-list-page.tsx
│   │   │           └── post-page.tsx
│   │   ├── root.tsx
│   │   └── routes.ts
│   ├── package.json
│   └── react-router.config.ts
├── landing/
│   ├── src/
│   │   ├── features/
│   │   │   └── hero/
│   │   │       └── pages/
│   │   │           └── hero-page.tsx
│   │   ├── root.tsx
│   │   └── routes.ts
│   ├── package.json
│   └── react-router.config.ts
├── api/
│   ├── src/
│   │   ├── lib/
│   │   │   └── helpers.ts
│   │   └── modules/
│   │       ├── games/
│   │       │   ├── contracts/
│   │       │   │   └── games.contract.ts
│   │       │   ├── game-scoring.ts
│   │       │   ├── games-rankings.service.ts
│   │       │   ├── games.module.ts
│   │       │   └── games.routes.ts
│   │       └── players/
│   │           ├── players.module.ts
│   │           └── players.routes.ts
│   └── package.json
└── admin-api/
    ├── src/
    │   ├── modules/
    │   │   ├── audit/
    │   │   │   ├── audit.module.ts
    │   │   │   └── audit.service.ts
    │   │   ├── billing/
    │   │   │   ├── checkout/
    │   │   │   │   ├── entities/
    │   │   │   │   │   ├── checkout-line.entity.ts
    │   │   │   │   │   └── checkout-session.entity.ts
    │   │   │   │   └── checkout.controller.ts
    │   │   │   ├── entities/
    │   │   │   │   ├── invoice.entity.ts
    │   │   │   │   └── refund.entity.ts
    │   │   │   ├── billing-cookie-domain.ts
    │   │   │   ├── billing-invoice.service.ts
    │   │   │   ├── billing-refund.service.ts
    │   │   │   ├── billing-retry-policy.ts
    │   │   │   ├── billing-stripe.client.ts
    │   │   │   ├── billing-webhook.guard.ts
    │   │   │   ├── billing.controller.ts
    │   │   │   └── billing.module.ts
    │   │   └── posts/
    │   │       ├── post.entity.ts
    │   │       └── posts.module.ts
    │   └── constants.ts
    └── package.json
```

```ts
// apps/web/app/routes.ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";
import { adminRoutes } from "~/features/admin/admin-routes";
import { billingRoutes } from "./features/billing/billing-routes";

export default [
  index("features/home/pages/home-page.tsx"),
  layout("features/game/pages/game-layout.tsx", [
    route("games", "features/game/pages/game-list-page.tsx"),
    route("games/rules", "features/game/pages/game-rules-page.tsx"),
    route("games/:id", "features/game/pages/game-room-page.tsx"),
    route("games/:id/stats", "features/game/pages/game-stats-page.tsx"),
  ]),
  route("settings", "features/settings/pages/settings-page.tsx"),
  ...adminRoutes,
  ...billingRoutes,
] satisfies RouteConfig;
```

```jsonc
// apps/web/tsconfig.json
{ "compilerOptions": { "paths": { "~/*": ["./app/*"] } } }
```

```ts
// apps/web/app/features/billing/billing-routes.ts
import { type RouteConfig, relative } from "@react-router/dev/routes";

const { route } = relative(import.meta.dirname);

export const billingRoutes = [route("billing", "./pages/billing-page.tsx")] satisfies RouteConfig;
```

```ts
// apps/blog/app/routes.ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("features/post/pages/post-list-page.tsx"),
  route("posts/:slug", "features/post/pages/post-page.tsx"),
] satisfies RouteConfig;
```

The imports, now one-way:

```text
components/app-header.tsx               → components/plan-badge.tsx
lib/analytics.ts                        → lib/tracking.ts
features/billing/pages/billing-page.tsx → features/game/lib/game-pricing.ts
features/game/lib/game-pricing.ts       → features/game/lib/game-plans.ts → features/game/lib/game-limits.ts
```

`oxlint .` prints nothing and exits 0.

## Mode flat (another repo)

`settings.structure["react-router"].mode` is `"flat"`: route modules sit at the feature root, and
only there. Same 20 rules.

```jsonc
// .oxlintrc.json (same rules as above)
{ "settings": { "structure": { "react-router": { "mode": "flat" } } } }
```

Before:

```text
app/
├── features/
│   └── users/
│       ├── components/
│       │   └── users-edit-page.tsx   ✗ location (in routes.ts)
│       ├── users-page.tsx
│       └── users-table.tsx           ✗ no-loose-files
├── root.tsx
└── routes.ts
```

```ts
// app/routes.ts
import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("users", "features/users/users-page.tsx"),
  route("users/:id/edit", "features/users/components/users-edit-page.tsx"),
] satisfies RouteConfig;
```

```text
app/features/users/users-table.tsx:1:1: error structure(react-router-no-loose-files): features/users/users-table.tsx: only route modules live in features/<feature>/ → move it to a subfolder (components/, hooks/, lib/…)
app/routes.ts:5:27: error structure(react-router-location): features/users/components/users-edit-page.tsx: route modules live in features/<feature>/ → move it there and update routes.ts
```

After: the route module moves up, the component moves down. `oxlint .` prints nothing and exits 0.

```text
app/
├── features/
│   └── users/
│       ├── components/
│       │   └── users-table.tsx
│       ├── users-edit-page.tsx
│       └── users-page.tsx
├── root.tsx
└── routes.ts
```

```ts
// app/routes.ts
import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("users", "features/users/users-page.tsx"),
  route("users/:id/edit", "features/users/users-edit-page.tsx"),
] satisfies RouteConfig;
```
