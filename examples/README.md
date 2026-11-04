# Examples

One app per stack, each a tree that passes its own `.oxlintrc.json`:

| Folder          | Stack        | Detected by                  |
| --------------- | ------------ | ---------------------------- |
| `react-router/` | React Router | `react-router.config.ts`     |
| `elysia/`       | Elysia       | `elysia` in `package.json`   |
| `nestjs/`       | NestJS       | `@nestjs/core` in `package.json` |

Copy a folder, then install the plugin in the copy and lint it:

```bash
bun add -d @netoun/oxlint-plugin-structure oxlint
bunx oxlint .
```

Rename a file and run it again to read the message. `test/examples.test.ts` pins both ends: each
example passes its config (and `*-file-prefix` for the module stacks), and one renamed file gives
the exact message the main README shows.
