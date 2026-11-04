/** The slice of the ESLint rule API these rules use. oxlint's JS plugins implement the same surface. */

export type AstNode = { type: string };

export type CallExpression = AstNode & {
  type: "CallExpression";
  callee: AstNode;
  arguments: AstNode[];
};

export type ImportDeclaration = AstNode & {
  type: "ImportDeclaration";
  source: { value: unknown };
  specifiers: AstNode[];
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

export const isNonEmptyArray = (node: AstNode): boolean =>
  node.type === "ArrayExpression" &&
  "elements" in node &&
  Array.isArray(node.elements) &&
  node.elements.length > 0;

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
