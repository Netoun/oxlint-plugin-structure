# Before / after: every rule, every case

A made-up monorepo that breaks every rule of the plugin, then the same monorepo once each fix is
applied. It covers all 20 rules, opt-in ones included, and every case each rule reports: 46 errors
before, none after.

The errors below are not written by hand. Both trees were linted by the real oxlint CLI against the
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

| App         | Stack        | Shows                                     |
| ----------- | ------------ | ----------------------------------------- |
| `web`       | React Router | every `react-router-*` rule, mode `pages` |
| `blog`      | React Router | file-system routes (`flatRoutes()`)       |
| `landing`   | React Router | `appDirectory` without a `routes.ts`      |
| `api`       | Elysia       | every `elysia-*` rule                     |
| `admin-api` | NestJS       | every `nestjs-*` rule                     |

`mode` is one setting per config, so mode `flat` gets a repo of its own, `backoffice`.

## Overview

Everything at once. `-` exists only before, `+` only after, no mark in both. `✗` names the rules that
report a file (prefix `react-router-`, `elysia-` or `nestjs-` left out); for a route module, the error
sits on its path in the route config. `edited` marks a file kept with new contents.

```diff
  apps/
  ├── admin-api/
  │   ├── src/
  │   │   ├── modules/
  │   │   │   ├── audit/
+ │   │   │   │   ├── audit.module.ts
  │   │   │   │   └── audit.service.ts                    ✗ module-entry
  │   │   │   ├── billing/
  │   │   │   │   ├── checkout/
  │   │   │   │   │   ├── entities/
  │   │   │   │   │   │   ├── checkout-line.entity.ts
+ │   │   │   │   │   │   └── checkout-session.entity.ts
- │   │   │   │   │   ├── checkout-session.entity.ts      ✗ entity-location
  │   │   │   │   │   └── checkout.controller.ts
+ │   │   │   │   ├── entities/
+ │   │   │   │   │   ├── invoice.entity.ts
+ │   │   │   │   │   └── refund.entity.ts
+ │   │   │   │   ├── billing-cookie-domain.ts
+ │   │   │   │   ├── billing-invoice.service.ts
+ │   │   │   │   ├── billing-refund.service.ts
+ │   │   │   │   ├── billing-retry-policy.ts
+ │   │   │   │   ├── billing-stripe.client.ts
+ │   │   │   │   ├── billing-webhook.guard.ts
  │   │   │   │   ├── billing.controller.ts               ✗ class-name · edited
- │   │   │   │   ├── billing.cookie-domain.ts            ✗ role-vocabulary
  │   │   │   │   ├── billing.module.ts
- │   │   │   │   ├── billing.service.ts                  ✗ class-name
- │   │   │   │   ├── billing.webhook-guard.ts            ✗ role-vocabulary
- │   │   │   │   ├── invoice.entity.ts                   ✗ entity-location, role-prefix
- │   │   │   │   ├── refund.entity.ts                    ✗ entity-location, role-prefix
- │   │   │   │   ├── retry-policy.ts                     ✗ file-prefix
- │   │   │   │   └── stripe.client.ts                    ✗ role-prefix
  │   │   │   ├── posts/
  │   │   │   │   ├── post.entity.ts
  │   │   │   │   └── posts.module.ts
- │   │   │   └── constants.ts                            ✗ module-entry
+ │   │   └── constants.ts
  │   └── package.json
  ├── api/
  │   ├── src/
+ │   │   ├── lib/
+ │   │   │   └── helpers.ts
  │   │   └── modules/
  │   │       ├── games/
+ │   │       │   ├── contracts/
+ │   │       │   │   └── games.contract.ts
+ │   │       │   ├── game-scoring.ts
+ │   │       │   ├── games-rankings.service.ts
- │   │       │   ├── games.contract.ts                   ✗ contract-location
  │   │       │   ├── games.module.ts
  │   │       │   ├── games.routes.ts
- │   │       │   ├── rankings.service.ts                 ✗ role-prefix
- │   │       │   └── scoring.ts                          ✗ file-prefix
  │   │       ├── players/
+ │   │       │   ├── players.module.ts
  │   │       │   └── players.routes.ts                   ✗ module-entry
- │   │       └── helpers.ts                              ✗ module-entry
  │   └── package.json
  ├── blog/
  │   ├── app/
+ │   │   ├── features/
+ │   │   │   └── post/
+ │   │   │       └── pages/
+ │   │   │           ├── post-list-page.tsx
+ │   │   │           └── post-page.tsx
- │   │   ├── routes/
- │   │   │   ├── _index.tsx
- │   │   │   └── posts.$slug.tsx
  │   │   ├── root.tsx
  │   │   └── routes.ts                                   ✗ location · edited
  │   ├── package.json                                    edited
  │   └── react-router.config.ts
  ├── landing/
  │   ├── src/
  │   │   ├── features/
  │   │   │   └── hero/
  │   │   │       └── pages/
  │   │   │           └── hero-page.tsx                   ✗ no-loose-files
  │   │   ├── root.tsx
+ │   │   └── routes.ts
  │   ├── package.json
  │   ├── react-router.config.ts
- │   └── routes.ts
  └── web/
      ├── app/
      │   ├── components/
      │   │   ├── app-header.tsx                          ✗ shared-imports · edited
+     │   │   └── plan-badge.tsx
      │   ├── features/
      │   │   ├── admin/
      │   │   │   ├── pages/
      │   │   │   │   └── admin-page.tsx                  ✗ reserved-suffixes
      │   │   │   └── admin-routes.ts                     ✗ no-loose-files
      │   │   ├── billing/
-     │   │   │   ├── components/
-     │   │   │   │   └── billing-badge.tsx
-     │   │   │   ├── lib/
-     │   │   │   │   └── billing-plans.ts
      │   │   │   ├── pages/
      │   │   │   │   └── billing-page.tsx
      │   │   │   └── billing-routes.ts                   ✗ location · edited
      │   │   ├── game/
      │   │   │   ├── components/
+     │   │   │   │   ├── game-badge.tsx
+     │   │   │   │   ├── game-card.tsx
-     │   │   │   │   ├── game-format.ts                  ✗ folder-contents
+     │   │   │   │   ├── game-score-board.tsx
-     │   │   │   │   ├── score-board.tsx                 ✗ file-prefix
-     │   │   │   │   └── use-score.ts                    ✗ file-prefix, folder-contents
      │   │   │   ├── hooks/
-     │   │   │   │   ├── game-timer.ts                   ✗ folder-contents
+     │   │   │   │   ├── use-game-score.ts
+     │   │   │   │   └── use-game-timer.ts
      │   │   │   ├── lib/
-     │   │   │   │   ├── _.ts                            ✗ file-case, file-prefix
+     │   │   │   │   ├── game-format.ts
+     │   │   │   │   ├── game-helpers.ts
      │   │   │   │   ├── game-limits.ts
+     │   │   │   │   ├── game-plans.ts
      │   │   │   │   ├── game-pricing.ts                 ✗ feature-cycles · edited
+     │   │   │   │   └── game-utils.ts
      │   │   │   ├── pages/
-     │   │   │   │   ├── game-helpers.ts                 ✗ no-loose-files
+     │   │   │   │   ├── game-layout.tsx
+     │   │   │   │   ├── game-list-page.tsx
-     │   │   │   │   ├── game-list.tsx                   ✗ role-suffix
+     │   │   │   │   ├── game-room-page.tsx
      │   │   │   │   ├── game-rules-page.tsx             ✗ reserved-suffixes
-     │   │   │   │   ├── game-shell.tsx                  ✗ role-suffix
      │   │   │   │   ├── game-stats-page.tsx             ✗ reserved-suffixes
-     │   │   │   │   └── room-page.tsx                   ✗ feature-prefix
-     │   │   │   ├── utils/
-     │   │   │   │   └── game-badge.tsx                  ✗ folder-contents
-     │   │   │   └── GameCard.tsx                        ✗ file-case, no-loose-files
      │   │   ├── home/
      │   │   │   └── pages/
      │   │   │       └── home-page.tsx
+     │   │   ├── settings/
+     │   │   │   └── pages/
+     │   │   │       └── settings-page.tsx
-     │   │   └── tracking.ts                             ✗ no-loose-files
      │   ├── lib/
      │   │   ├── analytics.ts                            ✗ shared-imports · edited
+     │   │   └── tracking.ts
-     │   ├── routes/
-     │   │   └── settings-page.tsx                       ✗ location
      │   ├── root.tsx
      │   └── routes.ts                                   ✗ location ×2 · edited
      ├── package.json
      ├── react-router.config.ts
+     └── tsconfig.json
```

`backoffice`, `"mode": "flat"`:

```diff
  backoffice/
  ├── app/
  │   ├── features/
  │   │   └── users/
  │   │       ├── components/
- │   │       │   ├── users-edit-page.tsx  ✗ location
+ │   │       │   └── users-table.tsx
+ │   │       ├── users-edit-page.tsx
  │   │       ├── users-page.tsx
- │   │       └── users-table.tsx          ✗ no-loose-files
  │   ├── root.tsx
  │   └── routes.ts                        edited
  ├── package.json
  └── react-router.config.ts
```

`oxlint .` then prints nothing and exits 0, in both repos.

## Rule by rule

Each case: the error oxlint prints, then the diff that clears it. A knock-on error clears with the
fix of another case, which it names.

### React Router

#### `react-router-role-suffix`

**A route with child routes is a layout.**

```text
apps/web/app/routes.ts:9:10: error structure(react-router-role-suffix): features/game/pages/game-shell.tsx: has child routes, so it is a layout → name it *-layout.tsx
```

```diff
  apps/web/app/routes.ts
-   layout("features/game/pages/game-shell.tsx", [
+   layout("features/game/pages/game-layout.tsx", [

  apps/web/app/features/game/pages/
- ├── game-shell.tsx
+ ├── game-layout.tsx
```

**A leaf route is a page or a redirect.**

```text
apps/web/app/routes.ts:10:20: error structure(react-router-role-suffix): features/game/pages/game-list.tsx: leaf route → name it *-page.tsx or *-redirect.tsx
```

```diff
  apps/web/app/routes.ts
-     route("games", "features/game/pages/game-list.tsx"),
+     route("games", "features/game/pages/game-list-page.tsx"),

  apps/web/app/features/game/pages/
- ├── game-list.tsx
+ ├── game-list-page.tsx
```

#### `react-router-feature-prefix`

**A route module starts with its feature's name.**

```text
apps/web/app/routes.ts:11:24: error structure(react-router-feature-prefix): features/game/pages/room-page.tsx: the name does not start with its feature → rename it game-…
```

```diff
  apps/web/app/routes.ts
-     route("games/:id", "features/game/pages/room-page.tsx"),
+     route("games/:id", "features/game/pages/game-room-page.tsx"),

  apps/web/app/features/game/pages/
- └── room-page.tsx
+ └── game-room-page.tsx
```

#### `react-router-location`

**A route module outside `features/<feature>/pages/`.**

```text
apps/web/app/routes.ts:14:21: error structure(react-router-location): routes/settings-page.tsx: route modules live in features/<feature>/pages/ → move it there and update routes.ts
```

```diff
  apps/web/app/routes.ts
-   route("settings", "routes/settings-page.tsx"),
+   route("settings", "features/settings/pages/settings-page.tsx"),

  apps/web/app/
  ├── features/
+ │   └── settings/
+ │       └── pages/
+ │           └── settings-page.tsx
- └── routes/
-     └── settings-page.tsx
```

**A computed route module path.**

```text
apps/web/app/routes.ts:12:30: error structure(react-router-location): routes.ts: a route module path is computed, so it is not checked → write it as a string literal
```

```diff
  apps/web/app/routes.ts
- const GAME_PAGES = "features/game/pages";
-
-     route("games/:id/stats", GAME_PAGES + "/game-stats-page.tsx"),
+     route("games/:id/stats", "features/game/pages/game-stats-page.tsx"),
```

**A route config import that is neither relative nor an alias.**

```text
apps/web/app/routes.ts:2:29: error structure(react-router-location): routes.ts: "~/features/admin/admin-routes" is not followed, so the routes it declares are not checked → import it with a relative path, or declare its alias in tsconfig.json compilerOptions.paths
```

```diff
  apps/web/app/routes.ts
  import { adminRoutes } from "~/features/admin/admin-routes";

  apps/web/tsconfig.json
+ { "compilerOptions": { "paths": { "~/*": ["./app/*"] } } }
```

**A `relative()` call that is not destructured.**

```text
apps/web/app/features/billing/billing-routes.ts:3:17: error structure(react-router-location): features/billing/billing-routes.ts: the routes declared through this relative() call are not checked → write const { route, index, layout } = relative(import.meta.dirname)
```

```diff
  apps/web/app/features/billing/billing-routes.ts
- const billing = relative(import.meta.dirname);
+ const { route } = relative(import.meta.dirname);

- export const billingRoutes = [billing.route("billing", "./pages/billing-page.tsx")] satisfies RouteConfig;
+ export const billingRoutes = [route("billing", "./pages/billing-page.tsx")] satisfies RouteConfig;
```

**File-system routes.**

```text
apps/blog/app/routes.ts:3:16: error structure(react-router-location): routes.ts: file-system routes (flatRoutes) are not checked → declare routes with route()/layout()/index(), or turn the react-router rules off for this app
```

```diff
  apps/blog/app/routes.ts
- import { flatRoutes } from "@react-router/fs-routes";
+ import { type RouteConfig, index, route } from "@react-router/dev/routes";

- export default flatRoutes();
+ export default [
+   index("features/post/pages/post-list-page.tsx"),
+   route("posts/:slug", "features/post/pages/post-page.tsx"),
+ ] satisfies RouteConfig;

  apps/blog/app/
+ ├── features/
+ │   └── post/
+ │       └── pages/
+ │           ├── post-list-page.tsx
+ │           └── post-page.tsx
- ├── routes/
- │   ├── _index.tsx
- │   └── posts.$slug.tsx
  └── routes.ts
```

**Mode flat: a route module outside `features/<feature>/`.**

```text
app/routes.ts:5:27: error structure(react-router-location): features/users/components/users-edit-page.tsx: route modules live in features/<feature>/ → move it there and update routes.ts
```

```diff
  backoffice/app/routes.ts
-   route("users/:id/edit", "features/users/components/users-edit-page.tsx"),
+   route("users/:id/edit", "features/users/users-edit-page.tsx"),

  backoffice/app/features/users/
  ├── components/
- │   └── users-edit-page.tsx
+ ├── users-edit-page.tsx
  └── users-page.tsx
```

#### `react-router-reserved-suffixes`

**A `-page` file that no route declares.**

```text
apps/web/app/features/game/pages/game-rules-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/game/pages/game-rules-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
```

```diff
  apps/web/app/routes.ts
    layout("features/game/pages/game-layout.tsx", [
      route("games", "features/game/pages/game-list-page.tsx"),
+     route("games/rules", "features/game/pages/game-rules-page.tsx"),
```

**Knock-on: the module of a computed path looks unrouted.** Clears with the
`react-router-location` fix for the computed path.

```text
apps/web/app/features/game/pages/game-stats-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/game/pages/game-stats-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
```

**Knock-on: the routes of an unread config file look unrouted.** Clears with the
`react-router-location` fix for the `~` alias.

```text
apps/web/app/features/admin/pages/admin-page.tsx:1:1: error structure(react-router-reserved-suffixes): features/admin/pages/admin-page.tsx: *-page.tsx, *-redirect.tsx and *-layout.tsx are reserved for files declared in routes.ts → rename it, or route it
```

#### `react-router-no-loose-files`

**`appDirectory` has no `routes.ts`.** Reported on every file under `features/`.

```text
apps/landing/src/features/hero/pages/hero-page.tsx:1:1: error structure(react-router-no-loose-files): features/hero/pages/hero-page.tsx: react-router.config.ts points at src/, which has no routes.ts → add src/routes.ts, or fix appDirectory
```

```diff
  apps/landing/
  ├── src/
  │   ├── features/hero/pages/hero-page.tsx
+ │   └── routes.ts
  ├── react-router.config.ts               export default { appDirectory: "src" };
- └── routes.ts
```

**A file directly in `features/`.**

```text
apps/web/app/features/tracking.ts:1:1: error structure(react-router-no-loose-files): features/tracking.ts: no loose file directly in features/ → move it into a feature
```

```diff
  apps/web/app/
  ├── features/
- │   └── tracking.ts
  └── lib/
      ├── analytics.ts
+     └── tracking.ts
```

**A file at a feature root.**

```text
apps/web/app/features/game/GameCard.tsx:1:1: error structure(react-router-no-loose-files): features/game/GameCard.tsx: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)
```

```diff
  apps/web/app/features/game/
  ├── components/
+ │   └── game-card.tsx
- └── GameCard.tsx
```

**A file in `pages/` that is not a route module.**

```text
apps/web/app/features/game/pages/game-helpers.ts:1:1: error structure(react-router-no-loose-files): features/game/pages/game-helpers.ts: only route modules live in features/<feature>/pages/ → move it to a subfolder (components/, hooks/, lib/…)
```

```diff
  apps/web/app/features/game/
  ├── lib/
+ │   └── game-helpers.ts
  └── pages/
-     └── game-helpers.ts
```

**Knock-on: an unread config file looks like a loose file.** Clears with the
`react-router-location` fix for the `~` alias: `admin-routes.ts` is then part of the route config.

```text
apps/web/app/features/admin/admin-routes.ts:1:1: error structure(react-router-no-loose-files): features/admin/admin-routes.ts: no loose file at a feature root → move it to a subfolder (components/, hooks/, lib/…)
```

**Mode flat: a file beside route modules.**

```text
app/features/users/users-table.tsx:1:1: error structure(react-router-no-loose-files): features/users/users-table.tsx: only route modules live in features/<feature>/ → move it to a subfolder (components/, hooks/, lib/…)
```

```diff
  backoffice/app/features/users/
  ├── components/
+ │   └── users-table.tsx
  ├── users-page.tsx
- └── users-table.tsx
```

#### `react-router-file-case`

**A name with a kebab-case equivalent.**

```text
apps/web/app/features/game/GameCard.tsx:1:1: error structure(react-router-file-case): features/game/GameCard.tsx: the name is not kebab-case → rename it game-card.tsx
```

```diff
  apps/web/app/features/game/
  ├── components/
+ │   └── game-card.tsx
- └── GameCard.tsx
```

**A name with no letter or digit to keep.**

```text
apps/web/app/features/game/lib/_.ts:1:1: error structure(react-router-file-case): features/game/lib/_.ts: the name is not kebab-case → rename it with lowercase words joined by -
```

```diff
  apps/web/app/features/game/lib/
- ├── _.ts
+ └── game-utils.ts
```

#### `react-router-folder-contents`

**A file in `hooks/` without `use-`.**

```text
apps/web/app/features/game/hooks/game-timer.ts:1:1: error structure(react-router-folder-contents): features/game/hooks/game-timer.ts: hooks/ holds hooks → name it use-….ts, or move it to lib/
```

```diff
  apps/web/app/features/game/hooks/
- ├── game-timer.ts
+ └── use-game-timer.ts
```

**A hook in `components/`.**

```text
apps/web/app/features/game/components/use-score.ts:1:1: error structure(react-router-folder-contents): features/game/components/use-score.ts: components/ holds components (.tsx) → move it to hooks/
```

```diff
  apps/web/app/features/game/
  ├── components/
- │   └── use-score.ts
  └── hooks/
+     └── use-game-score.ts
```

**A non-component in `components/`.**

```text
apps/web/app/features/game/components/game-format.ts:1:1: error structure(react-router-folder-contents): features/game/components/game-format.ts: components/ holds components (.tsx) → move it to lib/
```

```diff
  apps/web/app/features/game/
  ├── components/
- │   └── game-format.ts
  └── lib/
+     └── game-format.ts
```

**A component in `lib/` or `utils/`.**

```text
apps/web/app/features/game/utils/game-badge.tsx:1:1: error structure(react-router-folder-contents): features/game/utils/game-badge.tsx: utils/ holds no component → move it to components/
```

```diff
  apps/web/app/features/game/
  ├── components/
+ │   └── game-badge.tsx
- └── utils/
-     └── game-badge.tsx
```

#### `react-router-shared-imports`

**Shared code imports a feature's file.**

```text
apps/web/app/components/app-header.tsx:1:30: error structure(react-router-shared-imports): components/app-header.tsx: shared code imports features/billing/components/billing-badge.tsx → move it into features/billing, or move what it imports out of the feature
```

```diff
  apps/web/app/components/app-header.tsx
- import { BillingBadge } from "../features/billing/components/billing-badge";
+ import { PlanBadge } from "./plan-badge";

- export const AppHeader = BillingBadge;
+ export const AppHeader = PlanBadge;

  apps/web/app/
  ├── components/
  │   ├── app-header.tsx
+ │   └── plan-badge.tsx
  └── features/billing/
-     └── components/
-         └── billing-badge.tsx
```

**Shared code imports a file loose in `features/`.**

```text
apps/web/app/lib/analytics.ts:1:23: error structure(react-router-shared-imports): lib/analytics.ts: shared code imports features/tracking.ts → move what it imports out of features/
```

```diff
  apps/web/app/lib/analytics.ts
- import { track } from "../features/tracking";
+ import { track } from "./tracking";

  apps/web/app/
  ├── features/
- │   └── tracking.ts
  └── lib/
      ├── analytics.ts
+     └── tracking.ts
```

#### `react-router-file-prefix` (opt-in)

**A feature file without its feature's name.**

```text
apps/web/app/features/game/components/score-board.tsx:1:1: error structure(react-router-file-prefix): features/game/components/score-board.tsx: the name does not start with its feature → rename it game-…
```

```diff
  apps/web/app/features/game/components/
- ├── score-board.tsx
+ └── game-score-board.tsx
```

**A hook: the feature's name goes after `use-`.**

```text
apps/web/app/features/game/components/use-score.ts:1:1: error structure(react-router-file-prefix): features/game/components/use-score.ts: the name does not start with its feature → rename it use-game-…
```

```diff
  apps/web/app/features/game/
  ├── components/
- │   └── use-score.ts
  └── hooks/
+     └── use-game-score.ts
```

**A name with nothing to keep.**

```text
apps/web/app/features/game/lib/_.ts:1:1: error structure(react-router-file-prefix): features/game/lib/_.ts: the name does not start with its feature → rename it game-…
```

```diff
  apps/web/app/features/game/lib/
- ├── _.ts
+ └── game-utils.ts
```

#### `react-router-feature-cycles` (opt-in)

**Two features import each other.** `game` imports `billing` once (`game-pricing.ts` →
`billing-plans.ts`), `billing` imports `game` twice (`billing-page.tsx` → `game-pricing.ts`,
`billing-plans.ts` → `game-limits.ts`): the side with fewer imports is reported.

```text
apps/web/app/features/game/lib/game-pricing.ts:1:23: error structure(react-router-feature-cycles): features/game/lib/game-pricing.ts: imports features/billing, which imports features/game (2 imports) → move lib/billing-plans.ts out of billing (to lib/ or game), or merge the two features
```

```diff
  apps/web/app/features/
  ├── billing/
- │   └── lib/
- │       └── billing-plans.ts
  └── game/lib/
      ├── game-limits.ts
+     ├── game-plans.ts
      └── game-pricing.ts

  apps/web/app/features/game/lib/game-pricing.ts
- import { PLANS } from "../../billing/lib/billing-plans";
+ import { PLANS } from "./game-plans";

  apps/web/app/features/game/lib/game-plans.ts, moved from billing/lib/billing-plans.ts
- import { LIMITS } from "../../game/lib/game-limits";
+ import { LIMITS } from "./game-limits";
```

`billing` still imports `game` (`billing-page.tsx` → `game-pricing.ts`): one way, no cycle.

### Elysia

#### `elysia-role-prefix`

**A role file named after something other than its module.**

```text
apps/api/src/modules/games/rankings.service.ts:1:1: error structure(elysia-role-prefix): modules/games/rankings.service.ts: service files start with their module (games.service.ts, games-….service.ts) → rename it, or move it to the module it belongs to
```

```diff
  apps/api/src/modules/games/
- ├── rankings.service.ts
+ ├── games-rankings.service.ts
```

#### `elysia-file-prefix` (opt-in)

**Another file without its module's name.** The singular counts.

```text
apps/api/src/modules/games/scoring.ts:1:1: error structure(elysia-file-prefix): modules/games/scoring.ts: the name does not start with its module → rename it games.… or games-…
```

```diff
  apps/api/src/modules/games/
- ├── scoring.ts
+ ├── game-scoring.ts
```

#### `elysia-module-entry`

**A file loose in `modules/`.**

```text
apps/api/src/modules/helpers.ts:1:1: error structure(elysia-module-entry): modules/helpers.ts: no loose file in modules/ → put it in a module folder
```

```diff
  apps/api/src/
+ ├── lib/
+ │   └── helpers.ts
  └── modules/
-     └── helpers.ts
```

**A module folder without `<module>.module.ts`.**

```text
apps/api/src/modules/players/players.routes.ts:1:1: error structure(elysia-module-entry): modules/players/players.routes.ts: modules/players/ has no players.module.ts → add it, or move this file out of modules/
```

```diff
  apps/api/src/modules/players/
+ ├── players.module.ts
  └── players.routes.ts
```

#### `elysia-contract-location`

**A module's contract at its root.**

```text
apps/api/src/modules/games/games.contract.ts:1:1: error structure(elysia-contract-location): modules/games/games.contract.ts: a module's contract sits in its root → move it to modules/games/contracts/
```

```diff
  apps/api/src/modules/games/
+ ├── contracts/
+ │   └── games.contract.ts
- ├── games.contract.ts
  ├── games.module.ts
  └── games.routes.ts
```

### NestJS

#### `nestjs-role-prefix`

**A role file named after something other than its module.**

```text
apps/admin-api/src/modules/billing/stripe.client.ts:1:1: error structure(nestjs-role-prefix): modules/billing/stripe.client.ts: client files start with their module (billing.client.ts, billing-….client.ts) → rename it, or move it to the module it belongs to
```

```diff
  apps/admin-api/src/modules/billing/
- ├── stripe.client.ts               export class StripeClient {}
+ ├── billing-stripe.client.ts       export class BillingStripeClient {}
```

**Knock-on: entities at the module root, named after what they hold.** Clears with the first
`nestjs-entity-location` fix: files in `entities/` are named after what they hold.

```text
apps/admin-api/src/modules/billing/invoice.entity.ts:1:1: error structure(nestjs-role-prefix): modules/billing/invoice.entity.ts: entity files start with their module (billing.entity.ts, billing-….entity.ts) → rename it, or move it to the module it belongs to
apps/admin-api/src/modules/billing/refund.entity.ts:1:1: error structure(nestjs-role-prefix): modules/billing/refund.entity.ts: entity files start with their module (billing.entity.ts, billing-….entity.ts) → rename it, or move it to the module it belongs to
```

#### `nestjs-file-prefix` (opt-in)

**Another file without its module's name.**

```text
apps/admin-api/src/modules/billing/retry-policy.ts:1:1: error structure(nestjs-file-prefix): modules/billing/retry-policy.ts: the name does not start with its module → rename it billing.… or billing-…
```

```diff
  apps/admin-api/src/modules/billing/
- ├── retry-policy.ts
+ ├── billing-retry-policy.ts
```

#### `nestjs-module-entry`

**A file loose in `modules/`.**

```text
apps/admin-api/src/modules/constants.ts:1:1: error structure(nestjs-module-entry): modules/constants.ts: no loose file in modules/ → put it in a module folder
```

```diff
  apps/admin-api/src/
+ ├── constants.ts
  └── modules/
-     └── constants.ts
```

**A module folder without `<module>.module.ts`.**

```text
apps/admin-api/src/modules/audit/audit.service.ts:1:1: error structure(nestjs-module-entry): modules/audit/audit.service.ts: modules/audit/ has no audit.module.ts → add it, or move this file out of modules/
```

```diff
  apps/admin-api/src/modules/audit/
+ ├── audit.module.ts                export class AuditModule {}
  └── audit.service.ts
```

#### `nestjs-entity-location`

Only a file that declares an entity counts: each `*.entity.ts` here opens with `@Entity()`.

**Several entities at a module root.**

```text
apps/admin-api/src/modules/billing/invoice.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/invoice.entity.ts: 2 entities sit at the module root → move them to modules/billing/entities/
apps/admin-api/src/modules/billing/refund.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/refund.entity.ts: 2 entities sit at the module root → move them to modules/billing/entities/
```

```diff
  apps/admin-api/src/modules/billing/
+ ├── entities/
+ │   ├── invoice.entity.ts
+ │   └── refund.entity.ts
- ├── invoice.entity.ts
- ├── refund.entity.ts
```

**An entity beside an `entities/` folder, here in a sub-feature.**

```text
apps/admin-api/src/modules/billing/checkout/checkout-session.entity.ts:1:1: error structure(nestjs-entity-location): modules/billing/checkout/checkout-session.entity.ts: an entity sits at the sub-feature root beside entities/ → move it to modules/billing/checkout/entities/
```

```diff
  apps/admin-api/src/modules/billing/checkout/
  ├── entities/
  │   ├── checkout-line.entity.ts
+ │   └── checkout-session.entity.ts
- ├── checkout-session.entity.ts
  └── checkout.controller.ts
```

One entity alone at a module root passes: `posts/post.entity.ts`, named after the module's singular,
stays as it is.

#### `nestjs-class-name`

**The class is not named after its file.**

```text
apps/admin-api/src/modules/billing/billing.controller.ts:1:1: error structure(nestjs-class-name): modules/billing/billing.controller.ts: the class is PaymentsController → name it BillingController, or rename the file after the class
```

```diff
  apps/admin-api/src/modules/billing/billing.controller.ts
- export class PaymentsController {}
+ export class BillingController {}
```

**Several classes, none named after the file.**

```text
apps/admin-api/src/modules/billing/billing.service.ts:1:1: error structure(nestjs-class-name): modules/billing/billing.service.ts: the classes are InvoiceService, RefundService → name one of them BillingService, or split the file, one class per file named after it
```

```diff
  apps/admin-api/src/modules/billing/
- ├── billing.service.ts             export class InvoiceService {} · export class RefundService {}
+ ├── billing-invoice.service.ts     export class BillingInvoiceService {}
+ ├── billing-refund.service.ts      export class BillingRefundService {}
```

#### `nestjs-role-vocabulary`

**A dotted topic with no role in it.**

```text
apps/admin-api/src/modules/billing/billing.cookie-domain.ts:1:1: error structure(nestjs-role-vocabulary): modules/billing/billing.cookie-domain.ts: cookie-domain is not a role (module, controller, service…) → rename it billing-cookie-domain.ts, or add cookie-domain to settings.structure.nestjs.extraRoles
```

```diff
  apps/admin-api/src/modules/billing/
- ├── billing.cookie-domain.ts
+ ├── billing-cookie-domain.ts
```

**A dotted topic that ends in a role.**

```text
apps/admin-api/src/modules/billing/billing.webhook-guard.ts:1:1: error structure(nestjs-role-vocabulary): modules/billing/billing.webhook-guard.ts: webhook-guard is not a role (module, controller, service…) → rename it billing-webhook.guard.ts, or add webhook-guard to settings.structure.nestjs.extraRoles
```

```diff
  apps/admin-api/src/modules/billing/
- ├── billing.webhook-guard.ts       export class WebhookGuard {}
+ ├── billing-webhook.guard.ts       export class BillingWebhookGuard {}
```
