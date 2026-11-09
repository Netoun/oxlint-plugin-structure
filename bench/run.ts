import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generate, type Stack, type Tree } from "./generate.js";

/**
 * Wall and CPU time of oxlint on synthetic trees (and real repos with --repo), with and without the plugin.
 *
 *   bun run bench                         scaling: 100, 1k, 10k files per stack, 4 configs each
 *   bun run bench --rules                 + per-rule cost on the largest trees, one rule at a time
 *   bun run bench --repo ../app --repo …  + the same 4 configs on real repos (read-only)
 *   bun run bench --sizes 1000 --runs 3 --threads 1 --plugin /path/to/other/dist/index.js
 *
 * To compare two builds, use bench/compare.ts: it alternates them run by run, so load drift between
 * two separate benches does not pass for a difference.
 *
 * Configs: `plain` (oxlint's defaults), `noop-empty` (a JS plugin whose rule registers no visitor: oxlint
 * keeps the AST on the Rust side), `noop` (a rule that visits Program and does nothing: every AST is handed
 * to JS, what any visiting JS plugin costs), `recommended`, `all` (recommended + the opt-in rules). Each
 * timing is the median of --runs runs after a warm-up run, which also checks the plugin did not crash
 * and counts its diagnostics. Per rule, `bench/timed-plugin.js` measures inside oxlint's process the
 * time the rule's `create` and visitors take and the fs calls they make.
 */

const { values: args } = parseArgs({
  options: {
    sizes: { type: "string", default: "100,1000,10000" },
    stacks: { type: "string", default: "react-router,elysia,nestjs" },
    runs: { type: "string", default: "5" },
    threads: { type: "string" },
    rules: { type: "boolean", default: false },
    repo: { type: "string", multiple: true, default: [] },
    plugin: { type: "string" },
    out: { type: "string", default: join(tmpdir(), "oxlint-structure-bench") },
  },
});

const ROOT = resolve(import.meta.dir, "..");
const OXLINT = process.env.OXLINT_BIN ?? join(ROOT, "node_modules/.bin/oxlint");
const PLUGIN = resolve(args.plugin ?? join(ROOT, "dist/index.js"));
const NOOP = join(ROOT, "bench/noop-plugin.js");
const TIMED = join(ROOT, "bench/timed-plugin.js");
const OUT = resolve(args.out);
const RUNS = Number(args.runs);
/** Files per feature (React Router) or module (Elysia, NestJS), as in the real repos measured. */
const GROUP_SIZE: Record<Stack, number> = { "react-router": 25, elysia: 20, nestjs: 25 };

type PluginModule = { default: { rules: Record<string, unknown> }; RECOMMENDED: readonly string[] };
const { default: plugin, RECOMMENDED }: PluginModule = await import(PLUGIN);
const ALL_RULES = Object.keys(plugin.rules);
const stackOf = (rule: string): Stack => (rule.startsWith("react-router") ? "react-router" : rule.startsWith("elysia") ? "elysia" : "nestjs");

type Config = { name: string; path: string };

function writeConfig(name: string, config: Record<string, unknown>): Config {
  const path = join(OUT, "configs", `${name}.json`);
  mkdirSync(join(OUT, "configs"), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
  return { name, path };
}

const structure = (rules: readonly string[], jsPlugin = PLUGIN) => ({
  jsPlugins: [jsPlugin],
  rules: Object.fromEntries(rules.map((rule) => [`structure/${rule}`, "error"])),
});

const CONFIGS: Config[] = [
  writeConfig("plain", {}),
  writeConfig("noop-empty", { jsPlugins: [NOOP], rules: { "noop/empty": "error" } }),
  writeConfig("noop", { jsPlugins: [NOOP], rules: { "noop/program": "error" } }),
  writeConfig("recommended", structure(RECOMMENDED)),
  writeConfig("all", structure(ALL_RULES)),
];

const threadArgs = args.threads === undefined ? [] : [`--threads=${args.threads}`];
const TIMINGS_FILE = join(OUT, "rule-timings.json");

function oxlint(config: Config, dir: string, extra: readonly string[]) {
  return Bun.spawnSync({
    cmd: [OXLINT, "-c", config.path, "--disable-nested-config", ...threadArgs, ...extra, dir],
    env: { ...process.env, STRUCTURE_PLUGIN: PLUGIN, STRUCTURE_BENCH_OUT: TIMINGS_FILE },
  });
}

/** Warm-up run: JSON output, checked for a plugin crash; returns the files linted and the plugin's diagnostics. */
function check(config: Config, dir: string): { files: number; diagnostics: number } {
  const result = oxlint(config, dir, ["--format", "json"]);
  let report: { number_of_files: number; diagnostics: { code?: string; message: string }[] };
  try {
    report = JSON.parse(result.stdout.toString());
  } catch {
    throw new Error(`${config.name} on ${dir}: ${result.stdout.toString()}${result.stderr.toString()}`);
  }
  const crash = report.diagnostics.find((diagnostic) => diagnostic.message.startsWith("Error running JS plugin"));
  if (crash) throw new Error(`${config.name} on ${dir}: ${crash.message}`);
  return {
    files: report.number_of_files,
    diagnostics: report.diagnostics.filter((diagnostic) => diagnostic.code?.startsWith("structure(")).length,
  };
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

type RuleStats = Record<string, { ms: number; cpu: number; creates: number; fs: Record<string, number> }>;
type Timing = { config: string; ms: number; cpu: number; files: number; diagnostics: number; rules?: RuleStats[] };

/** Median wall and CPU (user + system, all threads) time over RUNS runs; with the timed plugin, its stats per run. */
function time(config: Config, dir: string, timed = false): Timing {
  const { files, diagnostics } = check(config, dir);
  const wall: number[] = [];
  const cpu: number[] = [];
  const rules: RuleStats[] = [];
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now();
    const result = oxlint(config, dir, ["--silent"]);
    wall.push(performance.now() - start);
    cpu.push(Number(result.resourceUsage.cpuTime.total) / 1000);
    if (timed) rules.push(JSON.parse(readFileSync(TIMINGS_FILE, "utf8")));
  }
  return { config: config.name, ms: median(wall), cpu: median(cpu), files, diagnostics, ...(timed ? { rules } : {}) };
}

const fmt = (ms: number) => ms.toFixed(0);
const signed = (ms: number) => `${ms >= 0 ? "+" : "−"}${fmt(Math.abs(ms))}`;
const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(0)}%`;
const perFile = (ms: number, files: number) => (ms / files).toFixed(3);

type Row = { scenario: string; timings: Timing[] };

/** Times per config, then the plugin's overhead over plain and over the noop floor, wall and CPU. */
function printScaling(rows: Row[]) {
  console.log("\n| scenario | files | plain | noop-empty | noop | recommended | all | all − plain | all − noop | ms/file (all − noop) | CPU all − noop | diagnostics |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const { scenario, timings } of rows) {
    const by = Object.fromEntries(timings.map((timing) => [timing.config, timing]));
    const ms = (name: string) => by[name]?.ms ?? 0;
    const files = by.plain?.files ?? 0;
    const overNoop = ms("all") - ms("noop");
    console.log(
      `| ${scenario} | ${files} | ${fmt(ms("plain"))} | ${by["noop-empty"] ? fmt(ms("noop-empty")) : "–"} | ${fmt(ms("noop"))} | ${fmt(ms("recommended"))} | ${fmt(ms("all"))} | ${signed(ms("all") - ms("plain"))} (${pct(ms("all") - ms("plain"), ms("plain"))}) | ${signed(overNoop)} | ${perFile(overNoop, files)} | ${signed((by.all?.cpu ?? 0) - (by.noop?.cpu ?? 0))} | ${by.all?.diagnostics ?? 0} |`,
    );
  }
}

const results: Record<string, unknown> = { date: new Date().toISOString(), plugin: PLUGIN, runs: RUNS, threads: args.threads ?? "default" };
const stacks = (args.stacks ?? "").split(",") as Stack[];
const sizes = (args.sizes ?? "").split(",").map(Number);
const version = (cmd: string[]) => Bun.spawnSync({ cmd }).stdout.toString().trim();
console.log(`oxlint ${version([OXLINT, "--version"])}, node ${version(["node", "--version"])}, runs ${RUNS}, threads ${args.threads ?? "default"}, plugin ${PLUGIN}, out ${OUT}`);

const trees: Tree[] = [];
for (const stack of stacks) {
  for (const size of sizes) trees.push(generate(stack, size, GROUP_SIZE[stack], join(OUT, "trees", `${stack}-${size}`)));
}
// Fewer, larger features: feature-cycles reads both features of every cross-feature import.
const largest = Math.max(...sizes);
if (stacks.includes("react-router") && largest >= 1000) {
  trees.push(generate("react-router", largest, 250, join(OUT, "trees", `react-router-${largest}-large`)));
}
const treeName = (tree: Tree) => `${tree.stack} ${tree.size}${tree.groupSize >= 250 ? ` (${tree.groupSize}/feature)` : ""}`;

const scaling: Row[] = [];
for (const tree of trees) {
  const timings = CONFIGS.map((config) => time(config, tree.dir));
  scaling.push({ scenario: treeName(tree), timings });
  console.error(`  ${treeName(tree)}: ${timings.map((timing) => `${timing.config} ${fmt(timing.ms)}ms`).join(", ")}`);
}
for (const repo of args.repo ?? []) {
  const dir = resolve(repo);
  const timings = CONFIGS.map((config) => time(config, dir));
  scaling.push({ scenario: `repo ${dir.split("/").at(-1)}`, timings });
  console.error(`  ${dir}: ${timings.map((timing) => `${timing.config} ${fmt(timing.ms)}ms`).join(", ")}`);
}
printScaling(scaling);
results.scaling = scaling;

if (args.rules) {
  // One rule at a time on the largest trees. `in rule`: the JS thread's CPU time in the rule's own code
  // (create and visitors), the measure least disturbed by a loaded machine.
  console.log("\n| rule | tree | wall | wall − noop | CPU − noop | in rule (CPU ms) | in rule µs/file | fs calls/file |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|");
  const perRule: Array<Record<string, unknown>> = [];
  for (const tree of trees.filter(({ size }) => size === largest)) {
    const floor = time(CONFIGS.find(({ name }) => name === "noop") as Config, tree.dir);
    for (const rule of ALL_RULES.filter((candidate) => stackOf(candidate) === tree.stack)) {
      const timing = time(writeConfig(`rule-${rule}`, structure([rule], TIMED)), tree.dir, true);
      const stats = (timing.rules ?? []).map((run) => run[rule]);
      const inRule = median(stats.map((stat) => stat?.cpu ?? 0));
      const fsCalls = Object.values(stats[0]?.fs ?? {}).reduce((sum, count) => sum + count, 0);
      perRule.push({ rule, tree: treeName(tree), wall: timing.ms, cpu: timing.cpu, floorWall: floor.ms, floorCpu: floor.cpu, inRule, inRuleWall: median(stats.map((stat) => stat?.ms ?? 0)), fs: stats[0]?.fs ?? {}, files: timing.files });
      console.log(
        `| ${rule} | ${treeName(tree)} | ${fmt(timing.ms)} | ${signed(timing.ms - floor.ms)} | ${signed(timing.cpu - floor.cpu)} | ${fmt(inRule)} | ${((inRule / timing.files) * 1000).toFixed(1)} | ${(fsCalls / timing.files).toFixed(1)} |`,
      );
    }
  }
  results.perRule = perRule;
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`\nraw results: ${join(OUT, "results.json")}`);
