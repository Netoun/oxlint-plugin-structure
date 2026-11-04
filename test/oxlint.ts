import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PLUGIN = join(import.meta.dir, "../dist/index.js");
/** The oxlint binary; `OXLINT_BIN` runs the suite against another version. */
const OXLINT = process.env.OXLINT_BIN ?? join(import.meta.dir, "../node_modules/.bin/oxlint");

export const EMPTY_MODULE = "export {};\n";

type Diagnostic = { code?: string; message: string };

export type Fixture = {
  /** Path → content, relative to the project root. */
  files: Record<string, string>;
  /** `settings.structure` of the lint config. */
  structure?: Record<string, unknown> | undefined;
  /** Rule names without the `structure/` prefix, all turned on at "error". */
  rules: readonly string[];
};

/** Lints a throwaway project with the built plugin; returns `rule: message` lines, sorted. Throws on a plugin crash. */
export function lintFixture({ files, structure, rules }: Fixture): string[] {
  const dir = mkdtempSync(join(tmpdir(), "structure-"));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  try {
    write(
      ".oxlintrc.json",
      JSON.stringify({
        jsPlugins: [PLUGIN],
        settings: structure ? { structure } : {},
        rules: Object.fromEntries(rules.map((rule) => [`structure/${rule}`, "error"])),
      }),
    );
    for (const [path, text] of Object.entries(files)) write(path, text);

    const result = Bun.spawnSync({ cmd: [OXLINT, "--format", "json", "."], cwd: dir });
    let diagnostics: Diagnostic[];
    try {
      diagnostics = (JSON.parse(result.stdout.toString()) as { diagnostics: Diagnostic[] }).diagnostics;
    } catch {
      throw new Error(result.stdout.toString() + result.stderr.toString());
    }
    const crash = diagnostics.find((diagnostic) => diagnostic.message.startsWith("Error running JS plugin"));
    if (crash) throw new Error(crash.message);
    return diagnostics
      .flatMap(({ code, message }) => (code?.startsWith("structure(") ? [`${code.slice("structure(".length, -1)}: ${message}`] : []))
      .sort();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
