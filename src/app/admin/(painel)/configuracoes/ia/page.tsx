import { requireAdminRole } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { getAiConfigHistory } from "@/services/ai-config-history.service";
import { prisma } from "@/lib/prisma";
import { IaTabs } from "./ia-tabs";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../dashboard-filters";

export const dynamic = "force-dynamic";

export default async function IaConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  // O resto de Configurações é global/sistema, mas o picker de empresa (overrides
  // de IA por empresa) segue o produto ativo — senão o operador vê empresas do
  // outro produto no dropdown.
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  const [config, companies, history] = await Promise.all([
    getAiConfig(),
    prisma.company.findMany({
      where: pf.company,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getAiConfigHistory(30),
  ]);

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
        modelPricing: config.modelPricing,
      }}
      companies={companies}
      history={history}
    />
  );
}
