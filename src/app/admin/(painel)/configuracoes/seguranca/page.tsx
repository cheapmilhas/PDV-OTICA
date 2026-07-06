import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/admin/PageHeader";
import MfaSetup from "./mfa-setup";

export const dynamic = "force-dynamic";

export default async function SegurancaPage() {
  const session = await requireAdmin();
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.id },
    select: { mfaEnabled: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Segurança"
        subtitle="Verificação em duas etapas (2FA) para o seu acesso de administrador."
      />
      <MfaSetup initialEnabled={admin?.mfaEnabled ?? false} />
    </div>
  );
}
