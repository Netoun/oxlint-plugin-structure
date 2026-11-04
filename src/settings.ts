import { isRecord } from "./eslint.js";

type SettingValue = string | readonly string[];

const NAME = /^[\w.-]+$/;
const PATH = /^[\w.-]+(\/[\w.-]+)*$/;

/**
 * Reads `settings.structure[section]`, every key optional. A key missing from `defaults`, or a value
 * of the wrong shape, throws: a typo must never turn a rule off silently. String defaults accept a
 * relative path; list defaults accept a list of names, non-empty for the keys in `nonEmpty`.
 */
export function readSection<T extends Record<string, SettingValue>>(
  settings: Readonly<Record<string, unknown>>,
  section: string,
  defaults: T,
  nonEmpty: readonly (keyof T)[] = [],
): T {
  const fail = (problem: string): never => {
    throw new Error(`structure settings["${section}"]: ${problem}`);
  };
  const structure = settings.structure;
  const raw = isRecord(structure) ? structure[section] : undefined;
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return fail("must be an object");

  const read: Record<string, SettingValue> = { ...defaults };
  for (const [key, value] of Object.entries(raw)) {
    const fallback = defaults[key];
    if (fallback === undefined) return fail(`unknown key "${key}"`);
    if (typeof fallback === "string") {
      if (typeof value !== "string" || !PATH.test(value)) fail(`${key} must be a name or a relative path`);
      read[key] = String(value);
    } else {
      const required = nonEmpty.includes(key);
      if (!Array.isArray(value) || (required && value.length === 0) || !value.every((item) => typeof item === "string" && NAME.test(item))) {
        return fail(`${key} must be a ${required ? "non-empty " : ""}list of names`);
      }
      read[key] = value.map(String);
    }
  }
  // Every key of `read` comes from `defaults` and holds a value of the same shape.
  return read as T;
}
