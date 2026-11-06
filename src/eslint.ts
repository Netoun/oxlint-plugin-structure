/** The slice of the ESLint rule API these rules use. oxlint's JS plugins implement the same surface. */

export type AstNode = { type: string };

export type CallExpression = AstNode & {
  type: "CallExpression";
  callee: AstNode;
  arguments: AstNode[];
};

export type ImportDeclaration = AstNode & {
  type: "ImportDeclaration";
  source: AstNode & { value: unknown };
  specifiers: AstNode[];
};

/** `export … from "x"` and `export * from "x"`; `source` is null for a plain `export { a }`. */
export type ExportDeclaration = AstNode & { source: (AstNode & { value: unknown }) | null };

export type VariableDeclarator = AstNode & {
  type: "VariableDeclarator";
  id: AstNode;
  init: AstNode | null;
};

export type RuleContext = {
  filename: string;
  settings: Readonly<Record<string, unknown>>;
  report(descriptor: { node: AstNode; message: string }): void;
};

export type Visitor = {
  Program?: (node: AstNode) => void;
  CallExpression?: (node: CallExpression) => void;
  ImportDeclaration?: (node: ImportDeclaration) => void;
  ExportNamedDeclaration?: (node: ExportDeclaration) => void;
  ExportAllDeclaration?: (node: ExportDeclaration) => void;
  VariableDeclarator?: (node: VariableDeclarator) => void;
};

export type Rule = {
  meta: { type: "problem"; docs: { description: string }; schema: [] };
  create(context: RuleContext): Visitor;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The text of a string literal or of a template literal without expressions, else null. */
export function staticString(node: AstNode | undefined): string | null {
  if (node === undefined) return null;
  if (node.type === "Literal" && "value" in node && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && "expressions" in node && "quasis" in node) {
    const { expressions, quasis } = node;
    if (!Array.isArray(expressions) || expressions.length > 0 || !Array.isArray(quasis)) return null;
    const [quasi]: unknown[] = quasis;
    if (isRecord(quasi) && isRecord(quasi.value) && typeof quasi.value.cooked === "string") {
      return quasi.value.cooked;
    }
  }
  return null;
}

const isNonEmptyArray = (node: AstNode): boolean =>
  node.type === "ArrayExpression" &&
  "elements" in node &&
  Array.isArray(node.elements) &&
  node.elements.length > 0;

/**
 * Whether `node`, an argument after a route's file, can hold child routes: a non-empty array
 * (`[...children]` too), or any expression, as `children` or `prefix("p", children)`, that is not an
 * options object, a literal or an empty array.
 */
export function mayHoldRoutes(node: AstNode): boolean {
  switch (node.type) {
    case "ArrayExpression":
      return isNonEmptyArray(node);
    case "ObjectExpression":
    case "Literal":
    case "TemplateLiteral":
      return false;
    default:
      return true;
  }
}

/** Local name → imported name, for the named imports of `node`. */
export function namedImports(node: ImportDeclaration): Map<string, string> {
  const names = new Map<string, string>();
  for (const specifier of node.specifiers) {
    if (specifier.type !== "ImportSpecifier" || !("imported" in specifier) || !("local" in specifier)) continue;
    const { imported, local } = specifier;
    if (!isRecord(imported) || !isRecord(local) || typeof local.name !== "string") continue;
    const name = typeof imported.name === "string" ? imported.name : imported.value;
    if (typeof name === "string") names.set(local.name, name);
  }
  return names;
}

/** `import.meta.dirname` or `__dirname`: the folder of the file it is written in. */
export function isOwnFolder(node: AstNode | undefined): boolean {
  if (node === undefined) return false;
  if (node.type === "Identifier") return "name" in node && node.name === "__dirname";
  if (node.type !== "MemberExpression" || !("object" in node) || !("property" in node)) return false;
  const { object, property } = node;
  return (
    isRecord(object) &&
    object.type === "MetaProperty" &&
    isRecord(object.meta) &&
    object.meta.name === "import" &&
    isRecord(property) &&
    property.name === "dirname"
  );
}

/** Local name → key, for the `{ key, key: local }` entries of an object pattern; null for another node. */
export function destructuredNames(node: AstNode): Map<string, string> | null {
  if (node.type !== "ObjectPattern" || !("properties" in node) || !Array.isArray(node.properties)) return null;
  const properties: unknown[] = node.properties;
  const names = new Map<string, string>();
  for (const property of properties) {
    if (!isRecord(property) || property.type !== "Property" || property.computed === true) continue;
    const { key, value } = property;
    const name = isRecord(key) ? (typeof key.name === "string" ? key.name : key.value) : undefined;
    if (typeof name === "string" && isRecord(value) && typeof value.name === "string") names.set(value.name, name);
  }
  return names;
}
