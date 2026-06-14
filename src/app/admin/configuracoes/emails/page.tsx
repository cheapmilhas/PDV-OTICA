import { requireAdminRole } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { EmailsClient } from "./emails-client";

export default async function EmailsConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const config = await getSaasEmailConfig();
  const logs = await prisma.saasEmailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { company: { select: { name: true } } },
  });

  return (
    <EmailsClient
      config={{
        masterEnabled: config.masterEnabled,
        testMode: config.testMode,
        testEmail: config.testEmail,
        welcomeEnabled: config.welcomeEnabled,
        trialEndingEnabled: config.trialEndingEnabled,
        trialExpiredEnabled: config.trialExpiredEnabled,
        invoiceOverdueEnabled: config.invoiceOverdueEnabled,
        paymentConfirmedEnabled: config.paymentConfirmedEnabled,
        subscriptionSuspendedEnabled: config.subscriptionSuspendedEnabled,
        subscriptionCanceledEnabled: config.subscriptionCanceledEnabled,
        invoiceGenerationEnabled: config.invoiceGenerationEnabled,
        invoiceCreatedEnabled: config.invoiceCreatedEnabled,
        invoiceDueSoonEnabled: config.invoiceDueSoonEnabled,
      }}
      logs={logs.map((l) => ({
        id: l.id,
        companyName: l.company?.name ?? l.companyId,
        eventType: l.eventType,
        status: l.status,
        to: l.to,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
