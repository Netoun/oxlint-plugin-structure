# @netoun/oxlint-plugin-structure

Lint rules that keep a project's folders and file names on its stack's conventions, so every
contributor, human or agent, puts a file in the same place. The error message names the fix.

An **oxlint** JS plugin. oxlint JS plugins use the ESLint rule API, so it also runs under ESLint.

> **Opinionated.** The rules and defaults are tailored to two stacks, and check the layout they ship:
> [lonestone-boilerplate](https://github.com/lonestone/lonestone-boilerplate) (NestJS + React Router) and
> [bonne-garde-toolkit](https://github.com/Netoun/bonne-garde-toolkit) (Elysia + React Router). Settings
> rename folders, suffixes and roles; they do not change the shape of the convention. If a rule does not
> fit your project, turn that rule off.

| Stack        | Rules            | An app is this stack's when                       |
| ------------ | ---------------- | ------------------------------------------------- |
| React Router | `react-router-*` | a `react-router.config.*` sits up to its package root |
| Elysia       | `elysia-*`       | its nearest `package.json` depends on `elysia`    |
| NestJS       | `nestjs-*`       | its nearest `package.json` depends on `@nestjs/core` |

Stacks combine: each rule only looks at its own stack's apps, so a monorepo with an Elysia API and a
React Router SPA turns both on in one config, with no per-folder overrides.

## What a failure looks like

Rename `games.service.ts` to `rankings.service.ts` in an Elysia module and oxlint reports:

```text
src/modules/games/rankings.service.ts:1:1: error structure(elysia-role-prefix): modules/games/rankings.service.ts: service files start with their module (games.service.ts, games-….service.ts) → rename it, or move it to the module it belongs to
```

Every message reads `<path>: <problem> → <fix>`, the path relative to the app's source or modules
folder. A contributor or an agent applies the fix without opening the rule.

The trees below come from [`examples/`](./examples): one app per stack that passes its own config,
checked by the test suite.

## Install

```bash
bun add -d @netoun/oxlint-plugin-structure
```

```jsonc
// .oxlintrc.json
{
  "extends": ["./node_modules/@netoun/oxlint-plugin-structure/recommended.json"],
  "settings": {
    "structure": {
      "react-router": { "mode": "pages" }
    }
  }
}
```

`recommended.json` turns on every rule except the opt-in ones: `react-router-file-prefix`,
`elysia-file-prefix` and `nestjs-file-prefix`, which check every file of a feature or module and run
noisy on existing code, and `react-router-feature-cycles`, whose fix moves code between features. Add
them to your `rules` for a new project or once the others are green. Each rule stays silent outside its
stack, so the preset is safe in any repo, monorepos included. The `extends` path is relative to your
config file: point it at the `node_modules` the plugin is installed in. A rule set in your own `rules`
wins over the preset.

ESLint flat config:

```js
import structure from "@netoun/oxlint-plugin-structure";

export default [
  structure.configs.recommended,
  { settings: { structure: { "react-router": { mode: "pages" } } } },
];
```

The `StructureSettings` type describes `settings.structure`.

## React Router

A **route module** is a file declared in the app's route config with `route()`, `layout()` or `index()`
(any local name, inside `prefix()` too), or with the helpers of `relative(import.meta.dirname)`, whose
paths start from their file's folder. The route config is `routes.ts` and the files it imports that
declare routes (they import `@react-router/dev/routes`) or only re-export them, inside the app's source
folder, through a relative path (`./auth-routes`, a folder's `index.ts`) or an alias of the app's
`tsconfig.json` `compilerOptions.paths` (`@/features/auth/auth-routes`).

| Rule                                  | Checks                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `react-router-role-suffix`            | with child routes → `*-layout.tsx`; leaf → `*-page.tsx` or `*-redirect.tsx` |
| `react-router-feature-prefix`         | the name starts with its feature: `features/game/…/game-room-page.tsx` |
| `react-router-location`               | every route module lives in one place (see modes); reports what the rules cannot read (see Limits) |
| `react-router-reserved-suffixes`      | `-page`, `-redirect`, `-layout` belong to routed files only            |
| `react-router-no-loose-files`         | nothing else lives where route modules live, nor loose at a feature root |
| `react-router-file-case`              | every file under `features/` is kebab-case: `game-card.tsx`, not `GameCard.tsx` |
| `react-router-folder-contents`        | `hooks/` holds `use-*` files, `components/` holds `.tsx`, `lib/` and `utils/` hold no component |
| `react-router-shared-imports`         | shared code (outside `features/`: `components/`, `lib/`, `hooks/`…) imports no file of a feature, type imports and tests included; route modules, route config files, `root.tsx`, `entry.client.tsx` and `entry.server.tsx` are not shared code. Follows relative imports and `tsconfig.json` `paths` aliases |
| `react-router-file-prefix`            | every other file of a feature starts with it: `game-card.tsx`, `hooks/use-game-room.ts` (noisy, opt-in) |
| `react-router-feature-cycles`         | two features never import each other: the side with fewer imports is reported (opt-in) |

`react-router-file-prefix` accepts any folder from the feature down to the first layer folder
(`nonRouteFolders`, and `pages/` in mode `pages`), or its singular, then `-` or `.`; a hook drops `use-`
first. Its fix names the nearest feature: a folder of `features/`, or one that holds route modules. It
skips route modules, tests, `index.*` files and the `sharedFeatures`.

Resource routes (`.ts`, no component) skip the suffix and prefix rules. The first three rules report
on the path string, in the config file that declares it; the others report on the offending file. A
route config file is neither a route module nor a loose file, and `react-router-file-case` still applies
to it.

A feature may import another; two features that import each other can neither move nor be read alone.
`react-router-feature-cycles` counts the imports each way, as distinct (file, imported file) pairs read
through relative paths and `paths` aliases, tests left out on both sides. It reports the side with fewer
(on a tie, the feature whose name sorts first), once per file it imports from the other:

```text
src/features/download/utils/download-cache.ts:8:8: error structure(react-router-feature-cycles): features/download/utils/download-cache.ts: imports features/crate, which imports features/download (5 imports) → move utils/crate-queries.ts out of crate (to lib/ or download), or merge the two features
```

The `sharedFeatures` are exempt both ways. The rule reads the files of the two features involved, cached
until they change.

### Modes

```text
mode "pages" (default)                 mode "flat"
features/game/                         features/game/
├── pages/                             ├── game-room-layout.tsx
│   ├── game-room-layout.tsx           ├── game-room-page.tsx
│   └── game-room-page.tsx             ├── components/game-card.tsx
├── components/game-card.tsx           └── hooks/use-game.ts
└── hooks/use-game.ts
```

Nested features follow the same shape: `features/billing/features/pricing/pages/pricing-page.tsx`.

With `routes.ts` declaring `route("games/:id", "features/game/pages/game-room-page.tsx")`, a route
module renamed `room-page.tsx` is reported on the path in `routes.ts`:

```text
src/routes.ts:6:24: error structure(react-router-feature-prefix): features/game/pages/room-page.tsx: the name does not start with its feature → rename it game-…
```

### Settings

`settings.structure["react-router"]`, every key optional. A wrong key or value throws: a typo never
turns a rule off silently.

| Key               | Default                                             |
| ----------------- | --------------------------------------------------- |
| `mode`            | `"pages"` (or `"flat"`)                             |
| `featuresDir`     | `"features"`                                        |
| `routeFolder`     | `"pages"` (mode `pages` only)                       |
| `nonRouteFolders` | `components hooks lib utils store stores assets data forms` |
| `leafSuffixes`    | `["page", "redirect"]`                              |
| `layoutSuffixes`  | `["layout"]`                                        |
| `sharedFeatures`  | `layout common shared`: features every other may import (`react-router-feature-cycles`), named after what they hold (`react-router-file-prefix`) |

### Limits

What the rules cannot read, `react-router-location` reports on the config file, with the fix:

- file-system routes (`flatRoutes()`);
- a computed route module path (`PAGES + "/game-page.tsx"`): write it as a string literal. Until then,
  the module it names also looks unrouted to `react-router-reserved-suffixes`;
- a `relative()` call other than `const { route, … } = relative(import.meta.dirname)`;
- an import that is neither relative, nor a `paths` alias, nor a dependency of `package.json`
  (an alias declared only in `vite.config`, for instance).

A relative import that leaves the app's source folder is not read.

## Elysia and NestJS

Both organise an API in modules: `src/modules/<module>/<module>.module.ts`, role files named
`<module>.<role>.ts` or `<module>-….<role>.ts`, sub-features in sub-folders. A file may use the
module's singular (`teams/team-colors.ts`) or any folder it sits in (`play/scan/play-scan.routes.ts`).

```text
Elysia: src/modules/                       NestJS: src/modules/
├── games/                                 ├── billing/
│   ├── games.module.ts                    │   ├── billing.module.ts
│   ├── games.routes.ts                    │   ├── billing.controller.ts
│   ├── games.service.ts                   │   ├── billing.service.ts
│   ├── game-scoring.ts                    │   ├── billing-alert.service.ts
│   ├── contracts/games.contract.ts        │   ├── billing.contract.ts
│   └── games.e2e.test.ts                  │   ├── billing-settings.ts
├── play/                                  │   ├── entities/stripe-event.entity.ts
│   ├── play.module.ts                     │   ├── utils/retention-discount.ts
│   ├── play.routes.ts                     │   ├── contracts/billing-status.contract.ts
│   ├── lib/play-refusal.ts                │   └── checkout/
│   └── scan/                              │       ├── checkout.controller.ts
│       ├── play-scan.routes.ts            │       └── checkout.service.ts
│       └── play-scan.contract.ts          └── posts/
└── test/health.test.ts                        ├── posts.module.ts
                                               └── post.entity.ts
```

Renaming `billing.service.ts` to `invoicing.service.ts` in the NestJS tree:

```text
src/modules/billing/invoicing.service.ts:1:1: error structure(nestjs-role-prefix): modules/billing/invoicing.service.ts: service files start with their module (billing.service.ts, billing-….service.ts) → rename it, or move it to the module it belongs to
```

| Rule                       | Checks                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| `*-role-prefix`            | a role file (`.module`, `.routes`/`.controller`, `.service`, `.contract`…) is named after its module: another name usually means it belongs to another module |
| `*-module-entry`           | every folder of `src/modules/` has its `<module>.module.ts`; no file sits loose in `src/modules/` |
| `*-file-prefix`            | every other file of a module starts with the module's name (noisy, see above) |
| `elysia-contract-location` | a module's contracts live in `contracts/`; a sub-feature's may sit beside its routes |
| `nestjs-entity-location`   | a module or sub-feature keeps one entity at its root; several, or one beside an `entities/` folder, move to `entities/`. Only a file that declares one (`@Entity(`, `@Embeddable(`) counts: a root `auth.entity.ts` that re-exports `entities/` passes |
| `nestjs-class-name`        | a role file's exported class is named after it: `browsing-cover-link.service.ts` holds `BrowsingCoverLinkService`, `posts.service.ts` may hold `PostService`, an entity drops the role (`comment.entity.ts` holds `Comment`). Factories, contracts and files that declare no class are skipped |
| `nestjs-role-vocabulary`   | the segment between a file's last two dots is a role; a topic takes a hyphen: `auth.cookie-domain.ts` → `auth-cookie-domain.ts`, `auth.session-guard.ts` → `auth-session.guard.ts`. Skips test files. NestJS only: Elysia apps write dotted topics on purpose |

NestJS also allows `<module>.contract.ts` at the module root, and names `entities/` and `utils/` files
after what they hold, so it has no contract rule and skips those folders.

### Settings

`settings.structure.elysia` and `settings.structure.nestjs`, same keys, every key optional:

| Key               | Elysia default                                        | NestJS default |
| ----------------- | ----------------------------------------------------- | -------------- |
| `modulesDir`      | `"src/modules"`                                       | same           |
| `testsFolder`     | `"test"`: cross-module tests, no rule looks inside    | same           |
| `contractsFolder` | `"contracts"`                                         | same           |
| `roles`           | `module routes service contract macro guard`          | `module controller service mapper contract entity factory guard filter query seeder config cli client adapter handler port logic decorator middleware provider exception` |
| `extraRoles`      | none: roles added to `roles` (`session-guard`), the defaults kept | same |
| `freeNameFolders` | none                                                  | `entities utils` |

## Adopting it on an existing repo

A repo grown without the convention starts red: each hit is a file to rename or move.

1. Extend `recommended.json` as in [Install](#install): it leaves the opt-in rules out.
2. Run `oxlint .` and fix what it reports, one stack at a time. The settings name your folders and
   roles (`modulesDir`, `roles`, `featuresDir`…); there is no ignore list for files.
3. When the rest is green, turn on `react-router-file-prefix`, `elysia-file-prefix` or
   `nestjs-file-prefix`: each checks every file of a feature or module and reports the most on
   existing code.
4. A new project can turn all of them on from the start: the apps in [`examples/`](./examples) pass
   `*-file-prefix` too.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
