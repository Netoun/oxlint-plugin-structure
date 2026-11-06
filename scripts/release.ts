// bun run release <patch|minor|major|prerelease|x.y.z> [--preid beta]
// Checks, bumps package.json, commits `chore: release vX.Y.Z`, tags it and pushes both.
// The pushed tag is the release: .github/workflows/release.yml publishes it to npm.
import { $ } from "bun";

const args = process.argv.slice(2);

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

if (args.length === 0) fail("no increment → bun run release <patch|minor|major|prerelease|x.y.z>");

const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== "main") fail(`on ${branch || "a detached HEAD"} → release from main`);
if ((await $`git status --porcelain`.text()).trim() !== "") fail("uncommitted changes → commit or stash them");
await $`git fetch --quiet origin main`;
if ((await $`git rev-list --count HEAD..origin/main`.text()).trim() !== "0") {
  fail("main is behind origin/main → git pull --rebase");
}

await $`bun run typecheck`;
await $`bun run lint`;
await $`bun run test`;

await $`bun pm version ${args} --message ${"chore: release v%s"}`;
const { version } = (await Bun.file("package.json").json()) as { version: string };
await $`git push --atomic origin main v${version}`;

console.log(`\nv${version} pushed → the Release workflow publishes it to npm.`);
