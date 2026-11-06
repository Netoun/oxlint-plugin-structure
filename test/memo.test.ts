import { expect, test } from "bun:test";
import { perFile } from "../src/memo.js";

// oxlint drains microtasks between two linted files: a value read from disk for one file is read again
// for the next, so a long-lived process (`oxlint --lsp`) sees a change made in between.
test("perFile computes a key once per synchronous run, again after microtasks drain", async () => {
  let reads = 0;
  const read = () => perFile("key", () => ++reads);
  expect([read(), read(), read()]).toEqual([1, 1, 1]);
  await Promise.resolve();
  expect([read(), read()]).toEqual([2, 2]);
});
