import { requireAdminRole } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { prisma } from "@/lib/prisma";
import { IaTabs } from "./ia-tabs";

export const dynamic = "force-dynamic";

export default async function IaConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const config = await getAiConfig();
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <IaTabs
      config={{
        hasKey: config.hasKey,
        usdBrlRate: config.usdBrlRate,
        markupPercent: config.markupPercent,
        creditTokenFactor: config.creditTokenFactor,
        qualifierModel: config.qualifierModel,
        lensAdvisorModel: config.lensAdvisorModel,
        ocrModel: config.ocrModel,
        copilotModel: config.copilotModel,
        transcriptionModel: config.transcriptionModel,
        hasOpenaiKey: config.hasOpenaiKey,
      }}
      companies={companies}
    />
  );
}
