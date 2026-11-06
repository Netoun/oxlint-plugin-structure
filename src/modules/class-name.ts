import { type AstNode, isRecord, type Rule } from "../eslint.js";
import { moduleFile, roleOf, singular, type Stack } from "./rules.js";

/**
 * Roles whose files hold several classes named after something else: a factory file builds test
 * entities (`billing.factory.ts` holds `BillingAccountFactory`, `SubscriptionFactory`), a contract
 * file holds DTOs (`CreateInvoiceDto`).
 */
const FREE_CLASS_ROLES = ["factory", "contract"];

/** `browsing-cover-link` → `BrowsingCoverLink`. */
const pascal = (name: string) =>
  name
    .split(/[-._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const identifierName = (node: unknown): string | null =>
  isRecord(node) && node.type === "Identifier" && typeof node.name === "string" ? node.name : null;

/** The name of a class declaration, else null. */
const declaredClass = (node: unknown): string | null =>
  isRecord(node) && node.type === "ClassDeclaration" ? identifierName(node.id) : null;

/**
 * The classes `program` declares and exports, in source order: `export class X`, `export default class X`,
 * and `class X` exported by `export { X }` or `export default X`. A re-export from another file is not one.
 */
function exportedClasses(program: AstNode): string[] {
  const statements: unknown[] = "body" in program && Array.isArray(program.body) ? program.body : [];
  const exportedLocals = new Set<string>();
  for (const statement of statements) {
    if (!isRecord(statement)) continue;
    if (statement.type === "ExportDefaultDeclaration") {
      const local = identifierName(statement.declaration);
      if (local !== null) exportedLocals.add(local);
    }
    if (statement.type === "ExportNamedDeclaration" && statement.source === null && Array.isArray(statement.specifiers)) {
      const specifiers: unknown[] = statement.specifiers;
      for (const specifier of specifiers) {
        const local = isRecord(specifier) ? identifierName(specifier.local) : null;
        if (local !== null) exportedLocals.add(local);
      }
    }
  }
  const classes: string[] = [];
  for (const statement of statements) {
    if (!isRecord(statement)) continue;
    const local = declaredClass(statement);
    if (local !== null && exportedLocals.has(local)) classes.push(local);
    const isExport = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration";
    const exported = isExport ? declaredClass(statement.declaration) : null;
    if (exported !== null) classes.push(exported);
  }
  return classes;
}

/**
 * NestJS names a class after its file: `browsing-cover-link.service.ts` holds `BrowsingCoverLinkService`,
 * `posts.service.ts` may hold `PostService`, and an entity drops the role (`comment.entity.ts` holds `Comment`).
 */
export function classNameRule(stack: Stack): Rule {
  return {
    meta: {
      type: "problem",
      docs: { description: "A role file holds a class named after it: browsing-cover-link.service.ts → BrowsingCoverLinkService." },
      schema: [],
    },
    create(context) {
      const file = moduleFile(stack, context);
      const role = file === null ? undefined : roleOf(file);
      if (file === null || role === undefined || FREE_CLASS_ROLES.includes(role)) return {};
      const name = file.name.slice(0, -`.${role}.ts`.length);
      const suffix = role === "entity" ? "" : pascal(role);
      const expected = pascal(name) + suffix;
      const accepted = [expected, pascal(singular(name)) + suffix];
      return {
        Program(node) {
          const classes = exportedClasses(node);
          if (classes.length === 0 || classes.some((found) => accepted.includes(found))) return;
          const problem =
            classes.length === 1
              ? `the class is ${classes.join("")} → name it ${expected}, or rename the file after the class`
              : `the classes are ${classes.join(", ")} → name one of them ${expected}, or split the file, one class per file named after it`;
          context.report({ node, message: `${file.path}: ${problem}` });
        },
      };
    },
  };
}
