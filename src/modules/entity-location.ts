import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ModuleFile } from "./rules.js";

/**
 * A NestJS module or sub-feature keeps one entity at its root (`posts/post.entity.ts`); with several,
 * they live in its `entities/` folder. Only a file that declares an entity counts: an `auth.entity.ts`
 * that re-exports `entities/` for MikroORM's folder discovery is not one.
 */
export const ENTITY_LOCATION_DESCRIPTION =
  "A module or sub-feature keeps one entity at its root; several live in its entities/ folder.";

const ENTITIES = "entities";
const SUFFIX = ".entity.ts";
/** A MikroORM `@Entity(` or `@Embeddable(` decorator opening a line: an inline string or a `//` mention does not. */
const DECLARATION = /^\s*@(?:Entity|Embeddable)\s*\(/m;

const declaresEntity = (path: string) => DECLARATION.test(readFileSync(path, "utf8"));

export function entityLocation({ folders, name, modulesRoot, settings }: ModuleFile): string | null {
  if (folders.length === 0 || folders.includes(ENTITIES) || !name.endsWith(SUFFIX)) return null;
  const dir = join(modulesRoot, ...folders);
  if (!declaresEntity(join(dir, name))) return null;
  const count = readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(SUFFIX) && declaresEntity(join(dir, entry.name)),
  ).length;
  const root = folders.length === 1 ? "the module root" : "the sub-feature root";
  const target = `${[basename(settings.modulesDir), ...folders].join("/")}/${ENTITIES}/`;
  if (count > 1) return `${count} entities sit at ${root} → move them to ${target}`;
  if (existsSync(join(dir, ENTITIES))) return `an entity sits at ${root} beside ${ENTITIES}/ → move it to ${target}`;
  return null;
}
