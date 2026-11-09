import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import plugin from "../src/index.js";
import { generate, type Stack } from "./generate.js";

/**
 * A CPU profile of oxlint's Node process (where JS plugins run) on one synthetic tree, summarised: the
 * plugin's functions ranked by inclusive time (their own time plus what they call: fs, regexes…), and
 * the top self-time frames overall.
 *
 *   bun bench/profile.ts --stack react-router --size 10000 [--group 25] [--rules react-router-feature-cycles,…]
 */

const { values: args } = parseArgs({
  options: {
    stack: { type: "string", default: "react-router" },
    size: { type: "string", default: "10000" },
    group: { type: "string", default: "25" },
    rules: { type: "string" },
    top: { type: "string", default: "25" },
    out: { type: "string", default: join(tmpdir(), "oxlint-structure-bench", "profile") },
  },
});

const ROOT = resolve(import.meta.dir, "..");
const OXLINT = join(ROOT, "node_modules/oxlint/bin/oxlint");
const OUT = resolve(args.out);
const stack = args.stack as Stack;
const rules = args.rules?.split(",") ?? Object.keys(plugin.rules).filter((rule) => rule.startsWith(stack));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tree = generate(stack, Number(args.size), Number(args.group), join(OUT, "tree"));
const config = join(OUT, "config.json");
writeFileSync(config, JSON.stringify({ jsPlugins: [join(ROOT, "dist/index.js")], rules: Object.fromEntries(rules.map((rule) => [`structure/${rule}`, "error"])) }));

const start = performance.now();
Bun.spawnSync({ cmd: ["node", "--cpu-prof", `--cpu-prof-dir=${OUT}`, OXLINT, "-c", config, "--disable-nested-config", "--silent", tree.dir] });
console.log(`${tree.fileCount} files, rules: ${rules.join(", ")}; ${(performance.now() - start).toFixed(0)} ms with the profiler on`);

type Frame = { functionName: string; url: string; lineNumber: number };
type ProfileNode = { id: number; callFrame: Frame; children?: number[]; hitCount?: number };
type Profile = { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };

const profiles = readdirSync(OUT).filter((name) => name.endsWith(".cpuprofile"));
console.log(`${profiles.length} profile(s) in ${OUT}`);

for (const name of profiles) {
  const profile: Profile = JSON.parse(readFileSync(join(OUT, name), "utf8"));
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  // Self time per node from the samples.
  const self = new Map<number, number>();
  profile.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000));
  const total = [...self.values()].reduce((sum, ms) => sum + ms, 0);

  const label = ({ functionName, url, lineNumber }: Frame) =>
    `${functionName || "(anonymous)"} ${url.startsWith("file://") ? relative(ROOT, url.slice("file://".length)) : url}:${lineNumber + 1}`;
  const isPlugin = (frame: Frame) => frame.url.includes(`${ROOT}/dist/`);

  // Inclusive time per plugin function: each sample counts once for every distinct plugin frame on its stack.
  const inclusive = new Map<string, number>();
  const selfByLabel = new Map<string, number>();
  for (const [id, ms] of self) {
    const leaf = byId.get(id);
    if (leaf) selfByLabel.set(label(leaf.callFrame), (selfByLabel.get(label(leaf.callFrame)) ?? 0) + ms);
    const seen = new Set<string>();
    for (let node = leaf; node !== undefined; node = byId.get(parent.get(node.id) ?? -1)) {
      if (!isPlugin(node.callFrame)) continue;
      const key = label(node.callFrame);
      if (seen.has(key)) continue;
      seen.add(key);
      inclusive.set(key, (inclusive.get(key) ?? 0) + ms);
    }
  }
  const top = Number(args.top);
  const rows = (map: Map<string, number>) =>
    [...map].sort((a, b) => b[1] - a[1]).slice(0, top).map(([key, ms]) => `  ${ms.toFixed(0).padStart(7)} ms  ${((ms / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
  console.log(`\n${name}: ${total.toFixed(0)} ms sampled\nplugin functions, inclusive time:\n${rows(inclusive).join("\n")}`);
  console.log(`\nall frames, self time:\n${rows(selfByLabel).join("\n")}`);
}
