import { readSection } from "../settings.js";

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

/** Reads and validates the settings; a wrong setting throws, so a typo never passes silently. */
export function readSettings(settings: Readonly<Record<string, unknown>>): ReactRouterSettings {
  const read = readSection(settings, "react-router", DEFAULT_SETTINGS, [
    "nonRouteFolders",
    "leafSuffixes",
    "layoutSuffixes",
  ]);
  const fail = (problem: string): never => {
    throw new Error(`structure settings["react-router"]: ${problem}`);
  };
  if (read.mode !== "pages" && read.mode !== "flat") fail('mode must be "pages" or "flat"');
  if (read.featuresDir.includes("/")) fail("featuresDir must be a folder name");
  if (read.routeFolder.includes("/")) fail("routeFolder must be a folder name");
  return read;
}
