import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { reactRouterRules } from "../src/react-router/rules.js";

// What `react-router-feature-cycles` sees in a long-lived process (`oxlint --lsp`) as files change between
// two lints. The CLI fixtures cannot tell: each runs a fresh oxlint. So the rule runs here in-process, its
// imports to report collected at `Program:exit`, a microtask drained between files as oxlint does.

const rule = reactRouterRules["react-router-feature-cycles"];
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const ALPHA = "features/alpha/alpha-x.ts";
const IMPORTS_ALPHA = 'import { x } from "@/features/alpha/alpha-x";\nexport const y = x;\n';
const CYCLE =
  "features/alpha/alpha-x.ts: imports features/beta, which imports features/alpha (1 import) → move beta-y.ts out of beta (to lib/ or alpha), or merge the two features";

/** An app where alpha imports beta, and beta imports nothing yet. */
function project() {
  const root = mkdtempSync(join(tmpdir(), "structure-cycles-"));
  roots.push(root);
  let clock = Date.now() / 1000;
  /** Moves the mtime forward, as a save does, whatever the file system's clock resolution. */
  const touch = (path: string) => {
    clock += 10;
    utimesSync(join(root, path), clock, clock);
    return clock;
  };
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    touch(path);
  };
  write("package.json", "{}\n");
  write("react-router.config.ts", 'export default { appDirectory: "src" };\n');
  write("tsconfig.json", '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n');
  write(`src/${ALPHA}`, 'import { y } from "@/features/beta/beta-y";\nexport const x = y;\n');
  write("src/features/beta/beta-y.ts", "export const y = 1;\n");
  const lint = async (file: string) => {
    const messages: string[] = [];
    const visitor = rule?.create({ filename: join(root, "src", file), settings: {}, report: ({ message }) => messages.push(message) });
    const exit: unknown = visitor === undefined ? undefined : Reflect.get(visitor, "Program:exit");
    if (typeof exit === "function") exit({ type: "Program" });
    await Promise.resolve();
    return messages;
  };
  return { root, write, touch, lint };
}

test("a file edited then linted counts for the other features", async () => {
  const { write, lint } = project();
  expect(await lint(ALPHA)).toEqual([]);
  write("src/features/beta/beta-y.ts", IMPORTS_ALPHA);
  expect(await lint("features/beta/beta-y.ts")).toEqual([]);
  expect(await lint(ALPHA)).toEqual([CYCLE]);
});

test("a file added to a feature counts without being linted: its folder changed", async () => {
  const { write, touch, lint } = project();
  expect(await lint(ALPHA)).toEqual([]);
  write("src/features/beta/beta-z.ts", IMPORTS_ALPHA);
  touch("src/features/beta");
  expect(await lint(ALPHA)).toEqual([CYCLE]);
});

test("an in-place edit to another feature's file shows once that file is linted", async () => {
  const { root, touch, lint } = project();
  const folderTime = touch("src/features/beta");
  expect(await lint(ALPHA)).toEqual([]);
  // Written in place, outside the editor: the file's mtime moves, its folder's does not.
  writeFileSync(join(root, "src/features/beta/beta-y.ts"), IMPORTS_ALPHA);
  touch("src/features/beta/beta-y.ts");
  utimesSync(join(root, "src/features/beta"), folderTime, folderTime);
  expect(await lint(ALPHA)).toEqual([]);
  expect(await lint("features/beta/beta-y.ts")).toEqual([]);
  expect(await lint(ALPHA)).toEqual([CYCLE]);
});

test("a tsconfig.json change reads the imports again", async () => {
  const { write, lint } = project();
  write("src/features/beta/beta-y.ts", IMPORTS_ALPHA);
  expect(await lint(ALPHA)).toEqual([CYCLE]);
  // Without the alias, neither import resolves: no cycle.
  write("tsconfig.json", "{}\n");
  expect(await lint(ALPHA)).toEqual([]);
});
