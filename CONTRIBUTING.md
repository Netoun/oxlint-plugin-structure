# Contributing

## Setup

```bash
bun install
bun run typecheck && bun run lint && bun run test
```

`bun run test` builds `dist/` first: the tests lint fixture projects with the real oxlint CLI and the
built plugin, so a passing test means the rule works in oxlint, not only in isolation.

## Changing a rule or adding a stack

A rule here is the convention itself, so it must earn its place on real code:

1. Measure the check on existing repos before writing it, and read what it flags.
2. Write the failing cases in `test/<stack>.test.ts`, then the rule.
3. Measure again and update the README.

The full checklist, and the invariants every rule keeps, are in [`AGENTS.md`](./AGENTS.md).

## Pull requests

- Title in conventional-commit form: `feat: nestjs module-entry rule`, `fix: …`, `docs: …`.
- One scope per pull request. Say which repos you measured on and what the counts were.
- CI runs typecheck, lint and tests on Node 20, 22 and 24 (oxlint runs JS plugins on Node).

## Releasing

Maintainer only.

1. Bump `version` in `package.json` (semver: a new rule is a minor, a rule that reports more on the
   same code is a major for its users).
2. `git commit -m "chore: release vX.Y.Z" && git tag vX.Y.Z`
3. `bun publish --access public` (`prepublishOnly` runs typecheck and tests).
4. `git push --follow-tags`
