import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { rolesConfigSchema, type Role } from "@/features/sessions/model/Roles";
import { configPath } from "@/platform/paths";

/**
 * ### loadRoles
 *
 * Reads `config/roles.yaml` fresh on every call so edits apply without a restart.
 *
 * @returns Roles in file order.
 */
export async function loadRoles(): Promise<Array<Role>> {
  const raw: unknown = load(await readFile(configPath("roles.yaml"), "utf8"));
  const config = rolesConfigSchema.parse(raw);
  return Object.entries(config.roles).map(([name, role]) => ({ name, ...role }));
}
