import { connection } from "next/server";
import { defaultFolder } from "@/composition/server";
import { loadRepositories } from "@/features/github/server/repositories";

/**
 * ### GET
 *
 * @returns `{ repositories, defaultFolder }`: directories from `config/repositories.yaml`, for
 *   folder suggestions, and the folder a session works in when you leave its folder empty.
 */
export async function GET(): Promise<Response> {
  await connection();
  const [repositories, folder] = await Promise.all([loadRepositories(), defaultFolder()]);
  return Response.json({ repositories, defaultFolder: folder });
}
