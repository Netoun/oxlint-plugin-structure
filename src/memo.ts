/**
 * Values computed once per linted file. oxlint runs every rule on a file in one synchronous call, then
 * drains microtasks before the next file: what the rules read from disk for a file (is routes.ts fresh?
 * which tsconfig aliases?) is read once, not once per rule, and read again for the next file, so a
 * long-lived process (`oxlint --lsp`) still sees every change. A host that lints several files in one
 * synchronous turn shares the values across them: a consistent snapshot of that turn.
 */
let memo: Map<string, unknown> | null = null;

export function perFile<T>(key: string, compute: () => T): T {
  if (memo === null) {
    memo = new Map();
    queueMicrotask(() => {
      memo = null;
    });
  }
  // Each key is only ever set by the `compute` of its one call site, so it holds a T.
  if (memo.has(key)) return memo.get(key) as T;
  const value = compute();
  memo.set(key, value);
  return value;
}
