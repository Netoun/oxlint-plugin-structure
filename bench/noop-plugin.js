// The floor of any JS plugin: `empty` registers no visitor, so oxlint never builds the file's AST in JS;
// `program` registers an empty Program visitor, which makes oxlint hand every file's AST to JS.
export default {
  meta: { name: "noop" },
  rules: {
    empty: { meta: { type: "problem", docs: { description: "Does nothing." }, schema: [] }, create: () => ({}) },
    program: { meta: { type: "problem", docs: { description: "Visits Program, does nothing." }, schema: [] }, create: () => ({ Program() {} }) },
  },
};
