# AGENTS.md

`@netoun/oxlint-plugin-structure`: oxlint rules (ESLint rule API) that keep folders and file names on
a stack's conventions. Users are agents as much as humans: a failing lint is the one instruction every
agent reads, so the rules are the documentation of the convention.

## Invariants

- **Self-scoped.** A rule finds its stack from the linted file (`react-router.config.*` up to the
  package root; `elysia` / `@nestjs/core` in the nearest `package.json`) and stays silent elsewhere.
  Stacks combine in one config with no per-folder overrides; `test/elysia.test.ts` › "presets
  combine" pins it.
- **Message = fix.** Every message reads `<path>: <problem> → <fix>`, with the path relative to the
  app's source or modules folder.
- **Loud, never silent.** A setting with an unknown key or a wrong shape throws (`src/settings.ts`).
  Input the rule cannot check (`flatRoutes()`, a missing `routes.ts`) is reported, not skipped.
- **Options are escape hatches.** An agent flips one to turn the lint green. Add a setting only for a
  variation observed across real repos, and give every stack its own `settings.structure.<stack>`.
- **Noise is a separate rule.** A check that fires widely on existing code ships as its own opt-in
  rule (`*-file-prefix`), so the low-noise rules stay on everywhere.

## Adding a rule or a stack

1. **Measure first.** Dry-run the candidate check on real repos (read-only) and count violations per
   repo; read them. Keep a check whose hits are real smells; split out or drop one that is mostly noise.
2. **Red test.** Add the cases to `test/<stack>.test.ts` through `lintFixture` (`test/oxlint.ts`):
   a fixture project linted by the real oxlint CLI against `dist/`. Cover a passing tree, each
   violation with its exact message, a package of another stack staying silent, and settings.
3. **Green.** Implement in `src/<stack>/` (or `src/modules/` for module-based APIs), register the
   rules in `src/index.ts`, typed with the minimal API in `src/eslint.ts`: narrow AST nodes with
   guards, never `any`.
4. **Re-measure** on the same repos, then update the README tables (rules, settings, defaults).

Done when `bun run typecheck && bun run lint && bun run test` pass and the re-measure matches the
dry-run.

## Conventions

- Bun only. Conventional commits (`feat:`, `fix:`, `docs:`…), one scope per change.
- `bun publish` runs only on an explicit request from the maintainer: publishing is public and permanent.
- Process for humans, releases included: [`CONTRIBUTING.md`](./CONTRIBUTING.md).
