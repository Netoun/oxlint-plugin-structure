import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Synthetic projects for the benchmark: a React Router app, an Elysia API and a NestJS API of about
 * `size` source files, near-clean (a fixed handful of violations), written to exercise the rules'
 * expensive paths: alias and relative imports, cross-feature imports, shared code, a route config split
 * over three files, entities at a module root.
 */

export type Stack = "react-router" | "elysia" | "nestjs";

type Files = Map<string, string>;

/** ~40 lines of TypeScript, so oxlint's own parse and lint cost is realistic. */
function body(name: string, imports: readonly string[], jsx: boolean): string {
  const used = imports.map((_, index) => `dep${index}`);
  const lines = [
    ...imports.map((specifier, index) => `import * as dep${index} from "${specifier}";`),
    "",
    `export type ${name}Options = { id: string; limit: number; tags: readonly string[] };`,
    "",
    `export function ${name}(options: ${name}Options) {`,
    "  const seen = new Set<string>();",
    "  const result: string[] = [];",
    "  for (const tag of options.tags) {",
    "    if (seen.has(tag) || result.length >= options.limit) continue;",
    "    seen.add(tag);",
    "    result.push(`${options.id}:${tag}`);",
    "  }",
    `  const deps = [${used.join(", ")}].map((dep) => Object.keys(dep).length);`,
    "  return { result, deps, total: deps.reduce((sum, count) => sum + count, 0) };",
    "}",
    "",
    `export const ${name}Defaults: ${name}Options = { id: "${name}", limit: 10, tags: ["a", "b", "c"] };`,
    "",
    `export async function load${name}(fetcher: (url: string) => Promise<unknown>) {`,
    `  const response = await fetcher("/api/${name.toLowerCase()}");`,
    "  if (typeof response !== \"object\" || response === null) throw new Error(\"bad response\");",
    "  return response;",
    "}",
  ];
  if (jsx) {
    lines.push(
      "",
      `export default function ${name}View({ title }: { title: string }) {`,
      `  const data = ${name}(${name}Defaults);`,
      "  return (",
      "    <section>",
      "      <h1>{title}</h1>",
      "      <ul>{data.result.map((item) => <li key={item}>{item}</li>)}</ul>",
      "    </section>",
      "  );",
      "}",
    );
  }
  return `${lines.join("\n")}\n`;
}

const pascal = (name: string) =>
  name
    .split(/[-._/]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

/** `features/feat3/lib/feat3-util-1.ts` → `Feat3Util1`, a valid identifier. */
const identifier = (path: string) => pascal(path.replace(/\.[^.]+$/, "").split("/").at(-1) ?? "X");

/**
 * React Router, mode pages, `appDirectory: "app"`, aliases `~/*`. `featureSize` files per feature:
 * 15% routed pages (one layout), 40% components, 15% hooks, 20% lib, 10% tests. Feature i imports
 * features i+1 and i+2, and the shared `common` feature; feature 1 imports feature 0 once, the one cycle.
 * About 10% of the files are shared code outside `features/`.
 */
function reactRouter(size: number, featureSize: number): Files {
  const files: Files = new Map();
  const sharedCount = Math.max(6, Math.round(size * 0.1));
  const featureCount = Math.max(3, Math.round((size - sharedCount) / featureSize));
  const perFeature = Math.max(8, Math.round((size - sharedCount) / featureCount));

  files.set("package.json", JSON.stringify({ name: "rr-bench", private: true, dependencies: { react: "*", "react-router": "*", "@react-router/dev": "*" } }));
  files.set("react-router.config.ts", 'import type { Config } from "@react-router/dev/config";\n\nexport default { appDirectory: "app", ssr: false } satisfies Config;\n');
  files.set("tsconfig.json", '{\n  // JSONC, as tsconfig writes it\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": { "~/*": ["./app/*"] },\n  },\n}\n');

  // Shared code: components/ui, lib, hooks. Each imports two other shared files.
  const shared: string[] = [];
  for (let index = 0; index < sharedCount; index++) {
    const kind = index % 3;
    shared.push(kind === 0 ? `components/ui/button-${index}.tsx` : kind === 1 ? `lib/format-${index}.ts` : `hooks/use-media-${index}.ts`);
  }
  shared.forEach((path, index) => {
    const others = [shared[(index + 1) % shared.length], shared[(index + 2) % shared.length]].map((other) => `~/${(other ?? "").replace(/\.tsx?$/, "")}`);
    files.set(`app/${path}`, body(identifier(path), others, path.endsWith(".tsx")));
  });
  files.set("app/root.tsx", body("Root", ["react-router", `~/${(shared[0] ?? "").replace(/\.tsx?$/, "")}`], true));

  const featureName = (index: number) => `feat${index}`;
  /** Per feature: its non-test files, by folder. */
  const layout = (feature: string) => {
    const count = (share: number) => Math.max(1, Math.round(perFeature * share));
    const pages = Array.from({ length: count(0.15) }, (_, index) => `pages/${feature}-item-${index}-page.tsx`);
    pages[0] = `pages/${feature}-layout.tsx`;
    return {
      pages,
      components: Array.from({ length: count(0.4) }, (_, index) => `components/${feature}-widget-${index}.tsx`),
      hooks: Array.from({ length: count(0.15) }, (_, index) => `hooks/use-${feature}-state-${index}.ts`),
      lib: Array.from({ length: count(0.2) }, (_, index) => `lib/${feature}-util-${index}.ts`),
      tests: count(0.1),
    };
  };
  const features = [...Array.from({ length: featureCount }, (_, index) => featureName(index)), "common"];
  const routes: Array<{ feature: number; page: string; layout: boolean }> = [];

  features.forEach((feature, featureIndex) => {
    const { pages, components, hooks, lib, tests } = layout(feature);
    const isCommon = feature === "common";
    const routed = isCommon ? [] : pages;
    const all = [...(isCommon ? [] : routed), ...components, ...hooks, ...lib];
    const libOf = (other: string) => `~/features/${other}/lib/${other}-util-0`;
    all.forEach((path, index) => {
      const imports: string[] = [];
      // Same feature: relative, two files.
      for (const step of [1, 2]) {
        const other = all[(index + step) % all.length] ?? path;
        if (other === path || other.startsWith("pages/")) continue;
        imports.push(`${dirname(path) === dirname(other) ? "./" : "../"}${dirname(path) === dirname(other) ? "" : `${dirname(other)}/`}${other.split("/").at(-1)?.replace(/\.tsx?$/, "")}`);
      }
      // Shared code through the alias, and the shared feature.
      imports.push(`~/${(shared[index % shared.length] ?? "").replace(/\.tsx?$/, "")}`);
      if (!isCommon) imports.push(libOf("common"));
      // Cross-feature: one file in three imports feature i+1 or i+2.
      if (!isCommon && featureCount > 2 && index % 3 === 0) {
        imports.push(libOf(featureName((featureIndex + 1 + (index % 2)) % featureCount)));
      }
      // The one cycle: feat1 also imports feat0, which imports feat1.
      if (feature === featureName(1) && index === 1) imports.push(libOf(featureName(0)));
      files.set(`app/features/${feature}/${path}`, body(identifier(path), imports, path.endsWith(".tsx")));
    });
    for (let index = 0; index < tests; index++) {
      const subject = components[index % components.length] ?? "";
      files.set(`app/features/${feature}/${subject.replace(/\.tsx$/, ".test.tsx")}`, body(`${identifier(subject)}Test`, [`./${subject.split("/").at(-1)?.replace(/\.tsx$/, "")}`], false));
    }
    routed.forEach((page, index) => routes.push({ feature: featureIndex, page: `features/${feature}/${page}`, layout: index === 0 }));
  });

  // The route config, split in three: routes.ts declares a third of the features, imports one part
  // relatively and one through the alias; the alias part declares its paths with relative().
  const third = Math.max(1, Math.floor(featureCount / 3));
  const declare = (part: typeof routes, pathOf: (page: string) => string) => {
    const byFeature = new Map<number, typeof routes>();
    for (const route of part) byFeature.set(route.feature, [...(byFeature.get(route.feature) ?? []), route]);
    return [...byFeature.values()].map((featureRoutes) => {
      const [layoutRoute, ...leaves] = featureRoutes;
      const children = leaves.map((leaf, index) => `    route("${featureRoutes[0]?.feature}/${index}", "${pathOf(leaf.page)}"),`);
      return `  layout("${pathOf(layoutRoute?.page ?? "")}", [\n${children.join("\n")}\n  ]),`;
    });
  };
  const partA = routes.filter((route) => route.feature < third);
  const partB = routes.filter((route) => route.feature >= third && route.feature < 2 * third);
  const partC = routes.filter((route) => route.feature >= 2 * third);
  files.set(
    "app/routes.ts",
    [
      'import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";',
      'import { partB } from "./routes/part-b";',
      'import { partC } from "~/routes/part-c";',
      "",
      "export default [",
      `  index("${routes[1]?.page ?? routes[0]?.page}"),`,
      ...declare(partA, (page) => page),
      "  ...partB,",
      "  ...partC,",
      "] satisfies RouteConfig;",
      "",
    ].join("\n"),
  );
  files.set(
    "app/routes/part-b.ts",
    ['import { layout, route } from "@react-router/dev/routes";', "", "export const partB = [", ...declare(partB, (page) => page), "];", ""].join("\n"),
  );
  files.set(
    "app/routes/part-c.ts",
    [
      'import { relative } from "@react-router/dev/routes";',
      "",
      "const { layout, route } = relative(import.meta.dirname);",
      "",
      "export const partC = [",
      ...declare(partC, (page) => `../${page}`),
      "];",
      "",
    ].join("\n"),
  );
  return files;
}

/**
 * Elysia or NestJS: `src/modules/<module>/` of `moduleSize` files each — role files, contracts,
 * a lib/ (Elysia) or utils/ (NestJS) folder, one sub-feature, tests. Half the NestJS modules keep one
 * entity at their root, the other half three in entities/.
 */
function modules(stack: "elysia" | "nestjs", size: number, moduleSize: number): Files {
  const files: Files = new Map();
  const dependency = stack === "elysia" ? { elysia: "*" } : { "@nestjs/core": "*", "@nestjs/common": "*" };
  files.set("package.json", JSON.stringify({ name: `${stack}-bench`, private: true, dependencies: dependency }));
  files.set("tsconfig.json", '{ "compilerOptions": { "strict": true } }\n');
  files.set("src/index.ts", body("Main", ["./modules/mod0/mod0.module"], false));
  const moduleCount = Math.max(2, Math.round(size / moduleSize));
  const roles = stack === "elysia" ? ["module", "routes", "service", "macro", "guard"] : ["module", "controller", "service", "mapper", "factory", "guard"];
  const helpers = stack === "elysia" ? "lib" : "utils";
  for (let index = 0; index < moduleCount; index++) {
    const module = `mod${index}`;
    const paths: string[] = [];
    for (const role of roles) paths.push(`${module}.${role}.ts`, `${module}-extra.${role}.ts`);
    paths.push(`contracts/${module}.contract.ts`, `contracts/${module}-status.contract.ts`);
    paths.push(`report/report.${stack === "elysia" ? "routes" : "controller"}.ts`, `report/report.service.ts`);
    if (stack === "nestjs") {
      if (index % 2 === 0) paths.push(`${module}.entity.ts`);
      else paths.push(`entities/${module}-item.entity.ts`, `entities/${module}-line.entity.ts`, `entities/${module}-event.entity.ts`);
    }
    for (let extra = 0; paths.length < moduleSize - 2; extra++) paths.push(`${helpers}/${module}-helper-${extra}.ts`);
    paths.push(`${module}.service.spec.ts`, `${module}-helper.test.ts`);
    paths.forEach((path, fileIndex) => {
      const imports = [`./${(paths[(fileIndex + 1) % paths.length] ?? "").replace(/\.ts$/, "")}`];
      if (index > 0) imports.push(`../mod${index - 1}/mod${index - 1}.service`);
      files.set(`src/modules/${module}/${path}`, moduleFile(path, imports));
    });
  }
  files.set("src/modules/test/health.test.ts", body("Health", [], false));
  return files;
}

/** A module file whose exported class matches its name, as nestjs-class-name wants. */
function moduleFile(path: string, imports: readonly string[]): string {
  const name = path.split("/").at(-1) ?? "";
  const [stem = "", role = ""] = name.replace(/\.ts$/, "").split(/\.(?=[^.]+$)/);
  const text = body(`${identifier(stem)}Impl`, imports.map((specifier) => specifier.replace(/^\.\/(?:[^/]+\/)*/, "./")), false);
  if (!/\.(?:spec|test)$/.test(stem) && role !== "" && role !== "contract" && role !== "factory") {
    const className = pascal(stem) + (role === "entity" ? "" : pascal(role));
    const decorator = role === "entity" ? "@Entity()\n" : "";
    return `${text}\n${decorator}export class ${className} {\n  readonly id = "${className}";\n}\n`;
  }
  return text;
}

export type Tree = { stack: Stack; size: number; groupSize: number; dir: string; fileCount: number };

/** Writes the tree to `dir`, replacing what was there. */
export function generate(stack: Stack, size: number, groupSize: number, dir: string): Tree {
  const files = stack === "react-router" ? reactRouter(size, groupSize) : modules(stack, size, groupSize);
  rmSync(dir, { recursive: true, force: true });
  for (const [path, text] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const fileCount = [...files.keys()].filter((path) => /\.(?:tsx?|jsx?|mjs)$/.test(path)).length;
  return { stack, size, groupSize, dir, fileCount };
}
