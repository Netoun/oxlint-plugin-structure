import { isRecord } from "../eslint.js";

/** `settings.structure["react-router"]` in the lint config. Every key is optional. */
export type ReactRouterSettings = {
  /** "pages": route modules in `<featuresDir>/<f>/<routeFolder>/`. "flat": at the feature root. */
  mode: "pages" | "flat";
  featuresDir: string;
  /** Only read in mode "pages". */
  routeFolder: string;
  /** Folders that never hold route modules; the first three are named in fix messages. */
  nonRouteFolders: readonly string[];
  /** Suffixes of a leaf route module: `<name>-<suffix>.tsx`. */
  leafSuffixes: readonly string[];
  /** Suffixes of a route module with child routes. */
  layoutSuffixes: readonly string[];
};

export const DEFAULT_SETTINGS: ReactRouterSettings = {
  mode: "pages",
  featuresDir: "features",
  routeFolder: "pages",
  nonRouteFolders: ["components", "hooks", "lib", "utils", "store", "stores", "assets", "data", "forms"],
  leafSuffixes: ["page", "redirect"],
  layoutSuffixes: ["layout"],
};

function fail(problem: string): never {
  throw new Error(`structure settings["react-router"]: ${problem}`);
}

function name(raw: Record<string, unknown>, key: "featuresDir" | "routeFolder"): string {
  const value = raw[key] ?? DEFAULT_SETTINGS[key];
  if (typeof value !== "string" || !/^[\w.-]+$/.test(value)) fail(`${key} must be a folder name`);
  return String(value);
}

function names(
  raw: Record<string, unknown>,
  key: "nonRouteFolders" | "leafSuffixes" | "layoutSuffixes",
): readonly string[] {
  const value = raw[key] ?? DEFAULT_SETTINGS[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && /^[\w.-]+$/.test(item))) {
    fail(`${key} must be a non-empty list of names`);
  }
  return value.map(String);
}

/** Reads and validates the settings; a wrong setting throws, so a typo never passes silently. */
export function readSettings(settings: Readonly<Record<string, unknown>>): ReactRouterSettings {
  const structure = settings.structure;
  const raw = isRecord(structure) ? structure["react-router"] : undefined;
  if (raw === undefined) return DEFAULT_SETTINGS;
  if (!isRecord(raw)) return fail("must be an object");

  for (const key of Object.keys(raw)) {
    if (!(key in DEFAULT_SETTINGS)) fail(`unknown key "${key}"`);
  }
  const mode = raw.mode ?? DEFAULT_SETTINGS.mode;
  if (mode !== "pages" && mode !== "flat") return fail('mode must be "pages" or "flat"');

  return {
    mode,
    featuresDir: name(raw, "featuresDir"),
    routeFolder: name(raw, "routeFolder"),
    nonRouteFolders: names(raw, "nonRouteFolders"),
    leafSuffixes: names(raw, "leafSuffixes"),
    layoutSuffixes: names(raw, "layoutSuffixes"),
  };
}
