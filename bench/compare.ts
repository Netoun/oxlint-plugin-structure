import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generate, type Stack } from "./generate.js";

/**
 * Before/after comparison of plugin builds. Builds alternate run by run on the same tree, so load
 * drift on a busy machine hits each alike; running one build's bench after the other's does not.
 *
 *   bun bench/compare.ts --baseline /tmp/main/dist/index.js                 this tree's dist/ against main's
 *   bun bench/compare.ts --baseline … --candidate a/index.js --candidate b/index.js --repo ../app --rules
 *
 * Per tree: oxlint alone (`plain`), the JS-plugin floors (`noop-empty`, `noop`), then `recommended` and
 * `all` for each build. Wall and process CPU, median of --runs runs after a warm-up round. With --rules,
 * each build also runs under `bench/timed-plugin.js` (a separate run: the timing wrapper costs time
 * itself) for the JS thread's CPU time in each rule.
 */

const { values: args } = parseArgs({
  options: {
    baseline: { type: "string" },
    candidate: { type: "string", multiple: true, default: [] },
    sizes: { type: "string", default: "10000" },
    stacks: { type: "string", default: "react-router,elysia,nestjs" },
    large: { type: "boolean", default: false },
    repo: { type: "string", multiple: true, default: [] },
    runs: { type: "string", default: "5" },
    rules: { type: "boolean", default: false },
    out: { type: "string", default: join(tmpdir(), "oxlint-structure-compare") },
  },
});
if (args.baseline === undefined) throw new Error("--baseline <path to a built dist/index.js> is required");

const ROOT = resolve(import.meta.dir, "..");
const OXLINT = process.env.OXLINT_BIN ?? join(ROOT, "node_modules/.bin/oxlint");
const OUT = resolve(args.out);
const RUNS = Number(args.runs);
const candidates = (args.candidate ?? []).length > 0 ? (args.candidate ?? []) : [join(ROOT, "dist/index.js")];
const builds = [resolve(args.baseline), ...candidates.map((path) => resolve(path))];
const label = (index: number) => (index === 0 ? "baseline" : builds.length === 2 ? "candidate" : `candidate ${index}`);

type PluginModule = { default: { rules: Record<string, unknown> }; RECOMMENDED: readonly string[] };
const { default: plugin, RECOMMENDED }: PluginModule = await import(builds[builds.length - 1] ?? "");
const RULE_SETS = { recommended: RECOMMENDED, all: Object.keys(plugin.rules) };

mkdirSync(join(OUT, "configs"), { recursive: true });
const config = (name: string, body: Record<string, unknown>) => {
  const path = join(OUT, "configs", `${name}.json`);
  writeFileSync(path, JSON.stringify(body));
  return path;
};
const structure = (jsPlugin: string, rules: readonly string[]) => ({
  jsPlugins: [jsPlugin],
  rules: Object.fromEntries(rules.map((rule) => [`structure/${rule}`, "error"])),
});

type Run = { name: string; config: string; plugin?: string; timed?: boolean };
const runs: Run[] = [
  { name: "plain", config: config("plain", {}) },
  { name: "noop-empty", config: config("noop-empty", { jsPlugins: [join(ROOT, "bench/noop-plugin.js")], rules: { "noop/empty": "error" } }) },
  { name: "noop", config: config("noop", { jsPlugins: [join(ROOT, "bench/noop-plugin.js")], rules: { "noop/program": "error" } }) },
];
for (const [set, rules] of Object.entries(RULE_SETS)) {
  builds.forEach((build, index) => {
    runs.push({ name: `${set} ${label(index)}`, config: config(`${set}-${index}`, structure(build, rules)) });
    if (args.rules) {
      runs.push({ name: `${set} ${label(index)} timed`, config: config(`${set}-timed`, structure(join(ROOT, "bench/timed-plugin.js"), rules)), plugin: build, timed: true });
    }
  });
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const trees: Array<{ name: string; dir: string }> = [];
for (const stack of (args.stacks ?? "").split(",") as Stack[]) {
  const groupSize = stack === "elysia" ? 20 : 25;
  for (const size of (args.sizes ?? "").split(",").map(Number)) {
    trees.push({ name: `${stack} ${size}`, dir: generate(stack, size, groupSize, join(OUT, "trees", `${stack}-${size}`)).dir });
    if (args.large && stack === "react-router" && size >= 1000) {
      trees.push({ name: `${stack} ${size} (250/feature)`, dir: generate(stack, size, 250, join(OUT, "trees", `${stack}-${size}-large`)).dir });
    }
  }
}
for (const repo of args.repo ?? []) trees.push({ name: `repo ${resolve(repo).split("/").at(-1)}`, dir: resolve(repo) });

console.log(`oxlint ${Bun.spawnSync({ cmd: [OXLINT, "--version"] }).stdout.toString().trim()}, runs ${RUNS}`);
builds.forEach((build, index) => console.log(`${label(index)}: ${build}`));

const timings = join(OUT, "rule-timings.json");
const results: Array<{ tree: string; files: number; runs: Record<string, { wall: number; cpu: number; js?: number; rules?: Record<string, number> }> }> = [];
for (const tree of trees) {
  const files = Number(JSON.parse(Bun.spawnSync({ cmd: [OXLINT, "-c", runs[0]?.config ?? "", "--disable-nested-config", "--format", "json", tree.dir] }).stdout.toString()).number_of_files);
  const samples: Record<string, { wall: number[]; cpu: number[]; js: number[]; rules: Record<string, number[]> }> = {};
  for (let round = 0; round <= RUNS; round++) {
    for (const run of runs) {
      const start = performance.now();
      const result = Bun.spawnSync({
        cmd: [OXLINT, "-c", run.config, "--disable-nested-config", "--silent", tree.dir],
        env: { ...process.env, STRUCTURE_PLUGIN: run.plugin ?? "", STRUCTURE_BENCH_OUT: timings },
      });
      const wall = performance.now() - start;
      if (round === 0) continue; // warm-up: file-system cache, Node's compile cache
      const sample = (samples[run.name] ??= { wall: [], cpu: [], js: [], rules: {} });
      sample.wall.push(wall);
      sample.cpu.push(Number(result.resourceUsage.cpuTime.total) / 1000);
      if (run.timed) {
        const stats: Record<string, { cpu: number; creates: number }> = JSON.parse(readFileSync(timings, "utf8"));
        sample.js.push(Object.values(stats).reduce((sum, stat) => sum + stat.cpu, 0));
        for (const [rule, stat] of Object.entries(stats)) if (stat.creates > 0) (sample.rules[rule] ??= []).push(stat.cpu);
      }
    }
  }
  const summary = Object.fromEntries(
    Object.entries(samples).map(([name, sample]) => [
      name,
      {
        wall: median(sample.wall),
        cpu: median(sample.cpu),
        ...(sample.js.length > 0 ? { js: median(sample.js), rules: Object.fromEntries(Object.entries(sample.rules).map(([rule, values]) => [rule, median(values)])) } : {}),
      },
    ]),
  );
  results.push({ tree: tree.name, files, runs: summary });
  console.error(`  ${tree.name}: ${Object.entries(summary).filter(([name]) => !name.endsWith("timed")).map(([name, { wall }]) => `${name} ${wall.toFixed(0)}ms`).join(", ")}`);
}

const fmt = (ms: number | undefined) => (ms === undefined ? "–" : ms.toFixed(0));
const series = (field: "wall" | "cpu" | "js", row: (typeof results)[number], set: string, suffix = "") =>
  builds.map((_, index) => fmt(row.runs[`${set} ${label(index)}${suffix}`]?.[field])).join(" → ");
for (const set of Object.keys(RULE_SETS)) {
  console.log(`\n**${set}** (${builds.map((_, index) => label(index)).join(" → ")})\n`);
  console.log(`| tree | files | plain | noop-empty | noop | wall | process CPU |${args.rules ? " plugin JS CPU | JS ms/file |" : ""}`);
  console.log(`|---|---:|---:|---:|---:|---:|---:|${args.rules ? "---:|---:|" : ""}`);
  for (const row of results) {
    const last = row.runs[`${set} ${label(builds.length - 1)} timed`]?.js;
    console.log(
      `| ${row.tree} | ${row.files} | ${fmt(row.runs.plain?.wall)} | ${fmt(row.runs["noop-empty"]?.wall)} | ${fmt(row.runs.noop?.wall)} | ${series("wall", row, set)} | ${series("cpu", row, set)} |${args.rules ? ` ${series("js", row, set, " timed")} | ${last === undefined ? "–" : (last / row.files).toFixed(3)} |` : ""}`,
    );
  }
}
if (args.rules) {
  console.log(`\n**JS CPU ms per rule, all rules on** (${builds.map((_, index) => label(index)).join(" → ")})\n`);
  console.log(`| tree | rule | in rule |\n|---|---|---:|`);
  for (const row of results) {
    for (const rule of Object.keys(row.runs[`all ${label(0)} timed`]?.rules ?? {})) {
      console.log(`| ${row.tree} | ${rule} | ${builds.map((_, index) => fmt(row.runs[`all ${label(index)} timed`]?.rules?.[rule])).join(" → ")} |`);
    }
  }
}
writeFileSync(join(OUT, "results.json"), JSON.stringify({ date: new Date().toISOString(), builds, runs: RUNS, results }, null, 2));
console.log(`\nraw results: ${join(OUT, "results.json")}`);
