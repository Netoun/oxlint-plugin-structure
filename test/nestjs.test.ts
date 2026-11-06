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
        "file-prefix: modules/email/welcome-email.spec.ts: the name does not start with its module → rename it email.… or email-…",
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
    ).toEqual(["file-prefix: modules/billing/entities/stripe-event.entity.ts: the name does not start with its module → rename it billing.… or billing-…"]);
  });

  test("extraRoles adds roles to the defaults: a role file is still named after its module", () => {
    expect(
      lint({
        settings: { extraRoles: ["session-guard"] },
        files: ["auth/auth.module.ts", "auth/auth.session-guard.ts", "auth/billing.session-guard.ts", "auth/billing.service.ts"],
      }),
    ).toEqual(
      [
        "role-prefix: modules/auth/billing.session-guard.ts: session-guard files start with their module (auth.session-guard.ts, auth-….session-guard.ts) → rename it, or move it to the module it belongs to",
        "role-prefix: modules/auth/billing.service.ts: service files start with their module (auth.service.ts, auth-….service.ts) → rename it, or move it to the module it belongs to",
      ].sort(),
    );
  });
});

describe("nestjs-entity-location", () => {
  const ENTITY = "@Entity()\nexport class Row {}\n";
  const EMBEDDABLE = "@Embeddable()\nexport class Line {}\n";
  const REEXPORT = 'export { Row } from "./entities/row.entity";\n';

  type EntityProject = { files: Record<string, string>; modulesDir?: string; dependency?: string };

  /** Lints `apps/api` with nestjs-entity-location only; `files` maps paths under the modules folder to their text. */
  function lintEntities({ files, modulesDir, dependency = "@nestjs/core" }: EntityProject): string[] {
    const tree: Record<string, string> = {
      "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { [dependency]: "11.0.0" } }),
    };
    for (const [path, text] of Object.entries(files)) tree[`apps/api/${modulesDir ?? "src/modules"}/${path}`] = text;
    const structure = modulesDir === undefined ? undefined : { nestjs: { modulesDir } };
    return lintFixture({ files: tree, structure, rules: ["nestjs-entity-location"] });
  }

  test("passes one entity at a root, several in entities/, and a re-export file beside entities/", () => {
    expect(
      lintEntities({
        files: {
          "posts/posts.module.ts": EMPTY_MODULE,
          "posts/post.entity.ts": ENTITY,
          "billing/billing.module.ts": EMPTY_MODULE,
          "billing/entities/stripe-event.entity.ts": ENTITY,
          "billing/entities/subscription.entity.ts": ENTITY,
          "billing/checkout/checkout.entity.ts": ENTITY,
          "auth/auth.module.ts": EMPTY_MODULE,
          "auth/auth.entity.ts": REEXPORT,
          "auth/entities/row.entity.ts": ENTITY,
          "tags/tags.module.ts": EMPTY_MODULE,
          "tags/tag.entity.ts": ENTITY,
          "tags/tag-color.entity.ts": 'export type TagColor = "red" | "blue";\n',
          "tags/tags-codegen.ts": "export const scaffold = `\n@Entity({ tableName: 'tag' })\n`;\n",
        },
      }),
    ).toEqual([]);
  });

  test("reports every entity of a root that holds several, and an entity beside entities/", () => {
    expect(
      lintEntities({
        files: {
          "programs/programs.module.ts": EMPTY_MODULE,
          "programs/program.entity.ts": ENTITY,
          "programs/program-module.entity.ts": ENTITY,
          "programs/program-module-skill.entity.ts": ENTITY,
          "posts/posts.module.ts": EMPTY_MODULE,
          "posts/post.entity.ts": ENTITY,
          "posts/entities/post-version.entity.ts": ENTITY,
          "folders/folders.module.ts": EMPTY_MODULE,
          "folders/folder.entity.ts": ENTITY,
          "folders/folder-info.entity.ts": ENTITY,
          "folders/entities/folder-tag.entity.ts": ENTITY,
          "billing/billing.module.ts": EMPTY_MODULE,
          "billing/checkout/checkout.entity.ts": ENTITY,
          "billing/checkout/checkout-line.entity.ts": EMBEDDABLE,
        },
      }),
    ).toEqual(
      [
        "nestjs-entity-location: modules/programs/program.entity.ts: 3 entities sit at the module root → move them to modules/programs/entities/",
        "nestjs-entity-location: modules/programs/program-module.entity.ts: 3 entities sit at the module root → move them to modules/programs/entities/",
        "nestjs-entity-location: modules/programs/program-module-skill.entity.ts: 3 entities sit at the module root → move them to modules/programs/entities/",
        "nestjs-entity-location: modules/posts/post.entity.ts: an entity sits at the module root beside entities/ → move it to modules/posts/entities/",
        "nestjs-entity-location: modules/folders/folder.entity.ts: 2 entities sit at the module root → move them to modules/folders/entities/",
        "nestjs-entity-location: modules/folders/folder-info.entity.ts: 2 entities sit at the module root → move them to modules/folders/entities/",
        "nestjs-entity-location: modules/billing/checkout/checkout.entity.ts: 2 entities sit at the sub-feature root → move them to modules/billing/checkout/entities/",
        "nestjs-entity-location: modules/billing/checkout/checkout-line.entity.ts: 2 entities sit at the sub-feature root → move them to modules/billing/checkout/entities/",
      ].sort(),
    );
  });

  test("leaves a package of another framework alone", () => {
    expect(
      lintEntities({
        dependency: "elysia",
        files: { "programs/program.entity.ts": ENTITY, "programs/program-module.entity.ts": ENTITY },
      }),
    ).toEqual([]);
  });

  test("follows modulesDir", () => {
    expect(
      lintEntities({
        modulesDir: "src/domains",
        files: { "posts/post.entity.ts": ENTITY, "posts/entities/post-version.entity.ts": ENTITY },
      }),
    ).toEqual([
      "nestjs-entity-location: domains/posts/post.entity.ts: an entity sits at the module root beside entities/ → move it to domains/posts/entities/",
    ]);
  });
});

describe("nestjs-class-name", () => {
  /** Lints `apps/api` with only nestjs-class-name on; `files` maps a path under `src/modules` to its source. */
  function lintClasses(files: Record<string, string>, settings?: Record<string, unknown>, dependency = "@nestjs/core") {
    const tree: Record<string, string> = {
      "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { [dependency]: "11.0.0" } }),
    };
    for (const [path, text] of Object.entries(files)) tree[`apps/api/src/modules/${path}`] = text;
    return lintFixture({ files: tree, structure: settings ? { nestjs: settings } : undefined, rules: ["nestjs-class-name"] }).map(
      (line) => line.replace(/^nestjs-class-name: /, ""),
    );
  }

  test("passes role files that hold a class named after them, the module's singular, entities without a suffix", () => {
    expect(
      lintClasses({
        "catalog/browsing-cover-link.service.ts": "export class BrowsingCoverLinkService {}\n",
        "posts/posts.module.ts": "@Module({})\nexport class PostModule {}\n",
        "posts/posts.service.ts": "class Cache {}\nexport class PostService {}\n",
        "posts/posts.controller.ts": "export class PostsController {}\nexport class PostsAdminController {}\n",
        "comments/comments.entity.ts": "export class Comment {}\n",
        "billing/entities/stripe-event.entity.ts": "export abstract class StripeEvent {}\n",
        "billing/billing.guard.ts": "export default class BillingGuard {}\n",
        "billing/billing.filter.ts": "class BillingFilter {}\nexport { BillingFilter };\n",
      }),
    ).toEqual([]);
  });

  test("skips factories, contracts, files that declare no exported class, and files with no role", () => {
    expect(
      lintClasses({
        "billing/billing.factory.ts": "export class BillingAccountFactory {}\nexport class SubscriptionFactory {}\n",
        "billing/billing.contract.ts": "export class CreateInvoiceDto {}\n",
        "billing/billing.mapper.ts": "export function toInvoiceDto() {}\n",
        "billing/billing.query.ts": "class Row {}\nexport const findInvoices = () => new Row();\n",
        "auth/auth.entity.ts": 'export { Account } from "./entities/account.entity";\n',
        "auth/entities/account.entity.ts": "export class Account {}\n",
        "billing/billing-settings.ts": "export class Settings {}\n",
      }),
    ).toEqual([]);
  });

  test("reports a role file whose classes are not named after it", () => {
    expect(
      lintClasses({
        "catalog/ingestion/services/edit-writer.service.ts": "export class EditWriter {}\n",
        "auth/superadmin.guard.ts": "export class SuperAdminGuard {}\n",
        "comments/comment.entity.ts": "export class CommentEntity {}\n",
        "storage/storage.service.ts": "class MediaStorage {}\nexport { MediaStorage };\n",
        "email/email.module.ts": "export default class MailModule {}\n",
        "billing/billing.mapper.ts": "export abstract class InvoiceRows {}\n",
        "billing/billing.seeder.ts": "class Seed {}\nexport default Seed;\n",
        "stats/stats.controller.ts": "export class DashboardStatsController {}\nexport class AdminStatsController {}\n",
      }),
    ).toEqual(
      [
        "modules/billing/billing.mapper.ts: the class is InvoiceRows → name it BillingMapper, or rename the file after the class",
        "modules/billing/billing.seeder.ts: the class is Seed → name it BillingSeeder, or rename the file after the class",
        "modules/catalog/ingestion/services/edit-writer.service.ts: the class is EditWriter → name it EditWriterService, or rename the file after the class",
        "modules/auth/superadmin.guard.ts: the class is SuperAdminGuard → name it SuperadminGuard, or rename the file after the class",
        "modules/comments/comment.entity.ts: the class is CommentEntity → name it Comment, or rename the file after the class",
        "modules/storage/storage.service.ts: the class is MediaStorage → name it StorageService, or rename the file after the class",
        "modules/email/email.module.ts: the class is MailModule → name it EmailModule, or rename the file after the class",
        "modules/stats/stats.controller.ts: the classes are DashboardStatsController, AdminStatsController → name one of them StatsController, or split the file, one class per file named after it",
      ].sort(),
    );
  });

  test("leaves a package of another framework alone", () => {
    expect(lintClasses({ "storage/storage.service.ts": "export class MediaStorage {}\n" }, undefined, "elysia")).toEqual([]);
  });

  test("checks the roles of the nestjs settings", () => {
    expect(
      lintClasses(
        {
          "billing/billing.controller.ts": "export class Invoices {}\n",
          "billing/billing.handler.ts": "export class Invoices {}\n",
        },
        { roles: ["module", "service", "handler"] },
      ),
    ).toEqual([
      "modules/billing/billing.handler.ts: the class is Invoices → name it BillingHandler, or rename the file after the class",
    ]);
  });
});

describe("nestjs-role-vocabulary", () => {
  /** Lints `apps/api` with only this rule on; returns its messages. */
  const vocabulary = ({ files, settings, dependency = "@nestjs/core" }: Project): string[] => {
    const tree: Record<string, string> = {
      "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { [dependency]: "11.0.0" } }),
    };
    for (const file of files) tree[`apps/api/src/modules/${file}`] = EMPTY_MODULE;
    const structure = settings ? { nestjs: settings } : undefined;
    return lintFixture({ files: tree, structure, rules: ["nestjs-role-vocabulary"] }).map((line) =>
      line.replace(/^nestjs-role-vocabulary: /, ""),
    );
  };

  test("passes roles, the recurring ones included, hyphenated topics, test files and the modules' test folder", () => {
    expect(
      vocabulary({
        files: [
          "auth/auth.module.ts",
          "auth/auth.service.ts",
          "auth/auth.config.ts",
          "auth/auth.cli.ts",
          "auth/auth.client.ts",
          "auth/auth.adapter.ts",
          "auth/auth.port.ts",
          "auth/auth.logic.ts",
          "auth/auth.decorator.ts",
          "auth/auth.middleware.ts",
          "auth/auth.provider.ts",
          "auth/auth.exception.ts",
          "auth/auth-cookie-domain.ts",
          "auth/auth.cookie-domain.spec.ts",
          "auth/auth.cookie-domain.e2e-spec.ts",
          "auth/auth.cookie-domain.test.ts",
          "auth/auth.client-types.d.ts",
          "auth/session/auth-session.guard.ts",
          "auth/webhooks/stripe-event.handler.ts",
          "auth/grocery.catalog.service.ts",
          "auth/tests/auth-backlog-fixtures.ts",
          "test/users.helper.ts",
        ],
      }),
    ).toEqual([]);
  });

  test("reports a topic written with a dot, with the rename that keeps a trailing role", () => {
    expect(
      vocabulary({
        files: [
          "auth/auth.module.ts",
          "auth/session/auth.session-guard.ts",
          "auth/session/auth.cookie-domain.ts",
          "auth/auth.permissions.ts",
          "auth/auth.session.cookie-domain.ts",
          "db/db.module.ts",
          "db/query-order.util.ts",
          "auth/tests/auth-backlog.fixtures.ts",
          "auth/sign-in/test/sign-in-e2e.helper.ts",
        ],
      }),
    ).toEqual(
      [
        "modules/auth/tests/auth-backlog.fixtures.ts: fixtures is not a role (module, controller, service…) → rename it auth-backlog-fixtures.ts, or add fixtures to settings.structure.nestjs.extraRoles",
        "modules/auth/sign-in/test/sign-in-e2e.helper.ts: helper is not a role (module, controller, service…) → rename it sign-in-e2e-helper.ts, or add helper to settings.structure.nestjs.extraRoles",
        "modules/auth/session/auth.session-guard.ts: session-guard is not a role (module, controller, service…) → rename it auth-session.guard.ts, or add session-guard to settings.structure.nestjs.extraRoles",
        "modules/auth/session/auth.cookie-domain.ts: cookie-domain is not a role (module, controller, service…) → rename it auth-cookie-domain.ts, or add cookie-domain to settings.structure.nestjs.extraRoles",
        "modules/auth/auth.permissions.ts: permissions is not a role (module, controller, service…) → rename it auth-permissions.ts, or add permissions to settings.structure.nestjs.extraRoles",
        "modules/auth/auth.session.cookie-domain.ts: cookie-domain is not a role (module, controller, service…) → rename it auth-session-cookie-domain.ts, or add cookie-domain to settings.structure.nestjs.extraRoles",
        "modules/db/query-order.util.ts: util is not a role (module, controller, service…) → rename it query-order-util.ts, or add util to settings.structure.nestjs.extraRoles",
      ].sort(),
    );
  });

  test("leaves a package of another framework alone: Elysia names files with dotted topics", () => {
    expect(
      vocabulary({ dependency: "elysia", files: ["db/db.auth-schema.ts", "grocery/grocery.catalog.build.ts"] }),
    ).toEqual([]);
  });

  test("adds extraRoles to the default roles", () => {
    expect(
      vocabulary({
        settings: { extraRoles: ["session-guard"] },
        files: ["auth/auth.module.ts", "auth/auth.service.ts", "auth/auth.session-guard.ts", "auth/auth.permissions.ts"],
      }),
    ).toEqual([
      "modules/auth/auth.permissions.ts: permissions is not a role (module, controller, service…) → rename it auth-permissions.ts, or add permissions to settings.structure.nestjs.extraRoles",
    ]);
  });

  test("reads its roles from roles, the longest trailing role first", () => {
    expect(
      vocabulary({
        settings: { roles: ["module", "guard", "auth-guard"] },
        files: [
          "auth/auth.module.ts",
          "auth/auth-session.auth-guard.ts",
          "auth/auth.session-auth-guard.ts",
          "auth/auth.service.ts",
        ],
      }),
    ).toEqual(
      [
        "modules/auth/auth.session-auth-guard.ts: session-auth-guard is not a role (module, guard, auth-guard) → rename it auth-session.auth-guard.ts, or add session-auth-guard to settings.structure.nestjs.extraRoles",
        "modules/auth/auth.service.ts: service is not a role (module, guard, auth-guard) → rename it auth-service.ts, or add service to settings.structure.nestjs.extraRoles",
      ].sort(),
    );
  });
});
