import { connection } from "next/server";
import { CLAUDE_LEAD_MODELS, type LeadOptions } from "@/features/sessions/model/Lead";
import { codexModels } from "@/features/sessions/server/codexModels";
import { checkProviders } from "@/features/sessions/server/providerChecks";
import { readSettings, savedLead } from "@/features/settings/server/settingsFile";

/**
 * ### GET
 *
 * @returns The lead picker's {@link LeadOptions}: your saved lead, whether
 *   Claude and Codex can run, and the models each offers.
 */
export async function GET(): Promise<Response> {
  await connection();
  const [settings, providers, codex] = await Promise.all([readSettings(), checkProviders(), codexModels()]);
  const options: LeadOptions = {
    saved: savedLead(settings),
    readiness: providers,
    models: { claude: CLAUDE_LEAD_MODELS, codex },
  };
  return Response.json(options);
}
