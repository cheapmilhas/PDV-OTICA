import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
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
      <div>
        <h1 className="text-2xl font-bold text-white">Segurança</h1>
        <p className="text-gray-400 mt-1">
          Verificação em duas etapas (2FA) para o seu acesso de administrador.
        </p>
      </div>
      <MfaSetup initialEnabled={admin?.mfaEnabled ?? false} />
    </div>
  );
}
