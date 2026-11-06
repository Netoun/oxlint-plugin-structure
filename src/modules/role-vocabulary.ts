import type { ModuleFile } from "./rules.js";

/**
 * `nestjs-role-vocabulary`: in `<name>.<segment>.ts` the dot announces a role. A segment that is not one
 * is a topic written with a dot where a hyphen belongs: `auth.cookie-domain.ts` is `auth-cookie-domain.ts`.
 * NestJS only: Elysia apps write dotted topics on purpose (`grocery.catalog.build.ts`).
 */

/** Test files keep their runner's suffix. */
const TEST_SUFFIXES = [".spec.ts", ".e2e-spec.ts", ".test.ts"];

export const roleVocabulary = {
  description: "The segment between the last two dots of a module file is a role; a topic takes a hyphen: auth-cookie-domain.ts.",
  check({ name, settings: { roles } }: ModuleFile): string | null {
    if (!name.endsWith(".ts") || TEST_SUFFIXES.some((suffix) => name.endsWith(suffix))) return null;
    if (roles.some((role) => name.endsWith(`.${role}.ts`))) return null;
    const stem = name.slice(0, -".ts".length);
    const dot = stem.lastIndexOf(".");
    if (dot <= 0 || dot === stem.length - 1) return null;
    const [base, segment] = [stem.slice(0, dot), stem.slice(dot + 1)];
    // `session-guard` → `-session.guard.ts`: the longest role it ends with, so a hyphenated role wins.
    const role = roles
      .filter((candidate) => segment.length > candidate.length + 1 && segment.endsWith(`-${candidate}`))
      .reduce<string | undefined>((longest, candidate) => (candidate.length > (longest?.length ?? 0) ? candidate : longest), undefined);
    // Without a role, no dot may stay: `auth.session.cookie-domain.ts` → `auth-session-cookie-domain.ts`.
    const rename =
      role === undefined ? `${base.replaceAll(".", "-")}-${segment}.ts` : `${base}-${segment.slice(0, -role.length - 1)}.${role}.ts`;
    const known = `${roles.slice(0, 3).join(", ")}${roles.length > 3 ? "…" : ""}`;
    return `${segment} is not a role (${known}) → rename it ${rename}, or add ${segment} to settings.structure.nestjs.extraRoles`;
  },
};
