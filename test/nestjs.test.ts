import { describe, expect, test } from "bun:test";
import { EMPTY_MODULE, lintFixture } from "./oxlint.js";

const RULES = ["role-prefix", "file-prefix", "module-entry"].map((rule) => `nestjs-${rule}`);

type Project = {
  /** Files under `apps/api/src/modules`. */
  files: string[];
  settings?: Record<string, unknown>;
  /** The framework `apps/api` depends on. */
  dependency?: string;
};

/** Lints `apps/api` with every nestjs rule on; returns `rule: message` lines without the `nestjs-` prefix. */
function lint({ files, settings, dependency = "@nestjs/core" }: Project): string[] {
  const tree: Record<string, string> = {
    "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { [dependency]: "11.0.0" } }),
  };
  for (const file of files) tree[`apps/api/src/modules/${file}`] = EMPTY_MODULE;
  return lintFixture({ files: tree, structure: settings ? { nestjs: settings } : undefined, rules: RULES }).map(
    (line) => line.replace(/^nestjs-/, ""),
  );
}

describe("nestjs", () => {
  test("passes modules that follow the anatomy, with entities/ and utils/ named after what they hold", () => {
    expect(
      lint({
        files: [
          "billing/billing.module.ts",
          "billing/billing.controller.ts",
          "billing/billing.controller.e2e-spec.ts",
          "billing/billing.service.ts",
          "billing/billing-alert.service.ts",
          "billing/billing.mapper.ts",
          "billing/billing.contract.ts",
          "billing/billing.factory.ts",
          "billing/billing-settings.ts",
          "billing/entities/stripe-event.entity.ts",
          "billing/utils/retention-discount.ts",
          "billing/utils/retention-discount.spec.ts",
          "billing/checkout/checkout.controller.ts",
          "billing/checkout/checkout.service.ts",
          "billing/contracts/billing-status.contract.ts",
          "posts/posts.module.ts",
          "posts/post.entity.ts",
        ],
      }),
    ).toEqual([]);
  });

  test("reports each file that leaks out of its module's anatomy", () => {
    expect(
      lint({
        files: [
          "storage/storage.module.ts",
          "storage/media-storage.service.ts",
          "billing/billing.module.ts",
          "billing/contracts/offer.contract.ts",
          "email/email.module.ts",
          "email/welcome-email.spec.ts",
          "landing-server/landing-server.guard.ts",
        ],
      }),
    ).toEqual(
      [
        "role-prefix: modules/storage/media-storage.service.ts: service files start with their module (storage.service.ts, storage-….service.ts) → rename it, or move it to the module it belongs to",
        "role-prefix: modules/billing/contracts/offer.contract.ts: contract files start with their module (billing.contract.ts, billing-….contract.ts) → rename it, or move it to the module it belongs to",
        "file-prefix: modules/email/welcome-email.spec.ts: start the name with its module (email.… or email-…)",
        "module-entry: modules/landing-server/landing-server.guard.ts: modules/landing-server/ has no landing-server.module.ts → add it, or move this file out of modules/",
      ].sort(),
    );
  });

  test("leaves a package of another framework alone", () => {
    expect(lint({ dependency: "elysia", files: ["storage/media-storage.service.ts"] })).toEqual([]);
  });

  test("takes its own settings, separate from elysia's", () => {
    expect(
      lint({
        settings: { freeNameFolders: [], roles: ["module", "service"] },
        files: ["billing/billing.module.ts", "billing/entities/stripe-event.entity.ts"],
      }),
    ).toEqual(["file-prefix: modules/billing/entities/stripe-event.entity.ts: start the name with its module (billing.… or billing-…)"]);
  });
});
