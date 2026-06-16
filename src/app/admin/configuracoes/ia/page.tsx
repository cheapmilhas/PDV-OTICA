import { requireAdminRole } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { IaClient } from "./ia-client";

export const dynamic = "force-dynamic";

export default async function IaConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const config = await getAiConfig();

  return (
    <IaClient
      config={{
        hasKey: config.hasKey,
        usdBrlRate: config.usdBrlRate,
        markupPercent: config.markupPercent,
        creditTokenFactor: config.creditTokenFactor,
      }}
    />
  );
}
