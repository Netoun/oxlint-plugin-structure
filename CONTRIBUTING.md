# Contributing

## Setup

```bash
bun install
bun run typecheck && bun run lint && bun run test
```

`bun run test` builds `dist/` first: the tests lint fixture projects with the real oxlint CLI and the
built plugin, so a passing test means the rule works in oxlint, not only in isolation.

Supported floors are oxlint 1.76 and Node 20 (`peerDependencies`, `engines`). Check a change against
them before raising either:

```bash
OXLINT_BIN=/path/to/oxlint-1.76/bin/oxlint bun test   # another oxlint
PATH=/path/to/node-20/bin:$PATH bun test               # oxlint runs JS plugins on that Node
```

## Changing a rule or adding a stack

A rule here is the convention itself, so it must earn its place on real code:

1. Measure the check on existing repos before writing it, and read what it flags.
2. Write the failing cases in `test/<stack>.test.ts`, then the rule.
3. Measure again and update the README and `examples/`.

The full checklist, and the invariants every rule keeps, are in [`AGENTS.md`](./AGENTS.md).

## Performance

```bash
bun run bench                          # 100, 1k, 10k-file React Router, Elysia and NestJS trees
bun run bench --rules                  # + each rule alone on the 10k trees: CPU time in the rule, fs calls per file
bun run bench --repo ../some-app       # + a real repo, read-only
bun bench/profile.ts --stack nestjs    # CPU profile of oxlint's Node process, the plugin's functions ranked

# A change against main: build main's dist/ in a worktree, then
bun run build && bun bench/compare.ts --baseline ../main/dist/index.js --rules [--repo ../some-app]
```

oxlint runs every JS rule on one Node thread, file after file, so per-file work adds up across the
run. A rule reads what it needs from disk at most once per linted file (`perFile` in `src/memo.ts`
shares it across rules), derives what it needs from the route index once per index rather than once
per file, and only returns a visitor when it reports or reads the AST: a `Program` visitor makes
oxlint hand the file's AST to JS.

Compare builds with `bench/compare.ts`, which alternates them run by run: two benches run one after
the other drift with the machine's load (3× on a busy laptop), enough to make an untouched rule look
slower. Its `plugin JS CPU` column, the JS thread's time inside the rules, is the steadiest measure. A
sandboxed shell can slow every `stat` several times: run the bench outside it.

## Pull requests

- Title in conventional-commit form: `feat: nestjs module-entry rule`, `fix: …`, `docs: …`.
- One scope per pull request. Say which repos you measured on and what the counts were.
- CI runs typecheck, lint and tests on Node 20, 22 and 24 (oxlint runs JS plugins on Node).

## Releasing

Maintainer only. Pushing a `v*` tag is the release: CI publishes it to npm.

```bash
bun run release minor   # patch | minor | major | prerelease --preid beta | 1.2.3
```

Semver for its users: a new rule is a minor, a rule that reports more on the same code is a major.

`scripts/release.ts` refuses to run off `main`, with uncommitted changes or behind `origin/main`, runs
typecheck, lint and tests, then bumps `package.json`, commits `chore: release vX.Y.Z`, tags `vX.Y.Z`
and pushes both. `.github/workflows/release.yml` reruns CI on the tag, checks the tag matches
`package.json` and sits on `main`, publishes to npm (a prerelease goes to the `next` dist-tag) and
opens a GitHub release listing the commits since the previous tag.

A failure before the publish step publishes nothing: re-run the workflow if the cause was transient,
otherwise fix on `main` and release the next patch (a pushed tag stays). If only the GitHub release
step failed, the package is live: create the release by hand with `gh release create vX.Y.Z`.

### One-time npm setup

npm trusts a workflow only for a package that already exists, so the first version needs a token:

1. Check that `npm whoami` prints `netoun`: the `@netoun` scope must be yours, or the publish 404s.
2. On npmjs.com, create a granular access token with read and write on all packages (the package does
   not exist yet) and "bypass 2FA" so CI can publish. Add it as the repository secret `NPM_TOKEN`.
3. Release the first version. `package.json` already says 0.1.0, so once this release setup is on
   `main`, tag it as is: `git tag -a v0.1.0 -m v0.1.0 && git push --atomic origin main v0.1.0`.
4. On the package's npm settings page, add a trusted publisher: GitHub Actions, `Netoun` /
   `oxlint-plugin-structure` / `release.yml`. Then set publishing access to "disallow tokens" and
   delete the `NPM_TOKEN` secret.

npm attaches provenance only to packages published from a public repository. It turns on by itself
once this repository is public.
