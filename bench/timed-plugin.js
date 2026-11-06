// The plugin, each rule wrapped to measure, inside oxlint's process, the time its `create` and visitors
// take and the fs calls they make. Written as JSON to $STRUCTURE_BENCH_OUT when the process exits.
// `cpu` is the JS thread's CPU time (Node >= 23.9): unlike `ms`, it does not count the time the thread
// waits for a core on a loaded machine.
// `fs` is patched before the plugin loads, so its named imports (`import { statSync } from "node:fs"`)
// see the counting functions.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const FS_CALLS = ["statSync", "existsSync", "readFileSync", "readdirSync"];
/** Rule name → { ms, cpu, calls, creates, fs: { statSync: n, … } }. */
const stats = {};
let current = null;

for (const name of FS_CALLS) {
  const original = fs[name];
  fs[name] = function (...args) {
    if (current !== null) current.fs[name] = (current.fs[name] ?? 0) + 1;
    return original.apply(this, args);
  };
}
syncBuiltinESMExports();

const { default: plugin } = await import(process.env.STRUCTURE_PLUGIN);

const threadCpu = process.threadCpuUsage
  ? () => {
      const { user, system } = process.threadCpuUsage();
      return (user + system) / 1000;
    }
  : () => Number.NaN;

function timed(entry, fn) {
  return function (...args) {
    const previous = current;
    current = entry;
    const start = performance.now();
    const startCpu = threadCpu();
    try {
      return fn.apply(this, args);
    } finally {
      entry.ms += performance.now() - start;
      entry.cpu += threadCpu() - startCpu;
      entry.calls++;
      current = previous;
    }
  };
}

const rules = {};
for (const [name, rule] of Object.entries(plugin.rules)) {
  const entry = (stats[name] = { ms: 0, cpu: 0, calls: 0, creates: 0, fs: {} });
  rules[name] = {
    meta: rule.meta,
    create: timed(entry, function (context) {
      entry.creates++;
      const visitor = rule.create(context);
      return Object.fromEntries(Object.entries(visitor).map(([key, fn]) => [key, timed(entry, fn)]));
    }),
  };
}

process.on("exit", () => {
  if (process.env.STRUCTURE_BENCH_OUT) fs.writeFileSync(process.env.STRUCTURE_BENCH_OUT, JSON.stringify(stats));
});

export default { meta: { name: "structure" }, rules };
