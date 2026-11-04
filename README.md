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
  "jsPlugins": ["@netoun/oxlint-plugin-structure"],
  "settings": {
    "structure": {
      "react-router": { "mode": "pages" }
    }
  },
  "rules": {
    "structure/react-router-role-suffix": "error",
    "structure/react-router-feature-prefix": "error",
    "structure/react-router-location": "error",
    "structure/react-router-reserved-suffixes": "error",
    "structure/react-router-no-loose-files": "error",

    "structure/elysia-role-prefix": "error",
    "structure/elysia-module-entry": "error",
    "structure/elysia-contract-location": "error",

    "structure/nestjs-role-prefix": "error",
    "structure/nestjs-module-entry": "error"
  }
}
```

Keep the rules of the stacks you use. `elysia-file-prefix` and `nestjs-file-prefix` are left out
above on purpose: they check every file of a module and run noisy on existing code; turn them on for
a new project or once the other rules are green.

ESLint flat config: `plugins: { structure }` with the same `settings` and `rules`.

## React Router

A **route module** is a file declared in the app's `routes.ts` with `route()`, `layout()` or `index()`
(any local name, inside `prefix()` too).

| Rule                                  | Checks                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `react-router-role-suffix`            | with child routes → `*-layout.tsx`; leaf → `*-page.tsx` or `*-redirect.tsx` |
| `react-router-feature-prefix`         | the name starts with its feature: `features/game/…/game-room-page.tsx` |
| `react-router-location`               | every route module lives in one place (see modes)                      |
| `react-router-reserved-suffixes`      | `-page`, `-redirect`, `-layout` belong to routed files only            |
| `react-router-no-loose-files`         | nothing else lives where route modules live, nor loose at a feature root |

Resource routes (`.ts`, no component) skip the suffix and prefix rules. The first three rules report
on the path string in `routes.ts`; the last two report on the offending file.

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

### Limits

- File-system routes (`flatRoutes()`) are reported once on `routes.ts`, not checked.
- Routes built from `relative()` or from computed paths are not seen.

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

NestJS also allows `<module>.contract.ts` at the module root, and names `entities/` and `utils/` files
after what they hold, so it has no contract rule and skips those folders.

### Settings

`settings.structure.elysia` and `settings.structure.nestjs`, same keys, every key optional:

| Key               | Elysia default                                        | NestJS default |
| ----------------- | ----------------------------------------------------- | -------------- |
| `modulesDir`      | `"src/modules"`                                       | same           |
| `testsFolder`     | `"test"`: cross-module tests, no rule looks inside    | same           |
| `contractsFolder` | `"contracts"`                                         | same           |
| `roles`           | `module routes service contract macro guard`          | `module controller service mapper contract entity factory guard filter query seeder` |
| `freeNameFolders` | none                                                  | `entities utils` |

## Adopting it on an existing repo

A repo grown without the convention starts red: each hit is a file to rename or move.

1. Turn on the rules of the [Install](#install) config, without `*-file-prefix`.
2. Run `oxlint .` and fix what it reports, one stack at a time. The settings name your folders and
   roles (`modulesDir`, `roles`, `featuresDir`…); there is no ignore list for files.
3. When the rest is green, turn on `elysia-file-prefix` or `nestjs-file-prefix`: it checks every file
   of a module and reports the most on existing code.
4. A new project can turn all of them on from the start: the apps in [`examples/`](./examples) pass
   `*-file-prefix` too.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
