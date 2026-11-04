# @netoun/eslint-plugin-structure

Lint rules that keep a project's folders and file names on its stack's conventions, so every
contributor, human or agent, puts a file in the same place. The error message names the fix.

Works in **oxlint** (JS plugins) and **ESLint** (same rule API).

| Stack        | Rules              | Status |
| ------------ | ------------------ | ------ |
| React Router | `react-router-*`   | ✅     |
| Elysia       | `elysia-*`         | next   |
| NestJS       | `nestjs-*`         | next   |

Presets combine: each rule only looks at files of its stack's apps, found from the files themselves
(React Router: the nearest `react-router.config.*` up to the package root). A monorepo with an Elysia
API and a React Router SPA turns both on in one config, with no per-folder overrides.

## Install

```bash
bun add -d @netoun/eslint-plugin-structure
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["@netoun/eslint-plugin-structure"],
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
    "structure/react-router-no-loose-files": "error"
  }
}
```

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

## Development

```bash
bun install
bun run typecheck && bun run lint && bun run test   # test builds dist/ and lints fixtures with the real oxlint CLI
```
