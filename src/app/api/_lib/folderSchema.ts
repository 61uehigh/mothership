import path from "node:path";
import { z } from "zod";
import { expandHome, folderProblem } from "@/platform/folders";

/**
 * ### folderSchema
 *
 * A folder on this computer that must exist; `~` stands for your home
 * folder. A failure carries the code `folder-not-absolute` or
 * `folder-missing`. Empty stays empty, for "use the default".
 */
export const folderSchema = z
  .string()
  .trim()
  .transform(expandHome)
  .superRefine(async (dir, context) => {
    if (dir === "") return;
    const code = await folderProblem(dir);
    if (code !== undefined) context.addIssue({ code: "custom", message: code === "folder-missing" ? `No folder at ${dir}` : "Use a full path to a folder", params: { code } });
  })
  .transform((dir) => (dir === "" ? "" : path.resolve(dir)));

/**
 * ### optionalFolderSchema
 *
 * {@link folderSchema} where empty or absent means "use the default folder", parsed as `undefined`.
 */
export const optionalFolderSchema = folderSchema.optional().transform((dir) => (dir === "" ? undefined : dir));
