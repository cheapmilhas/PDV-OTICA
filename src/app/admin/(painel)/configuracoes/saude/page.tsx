import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdminRole } from "@/lib/admin-session";
import { getSystemHealthSnapshot } from "@/services/system-health.service";
import { PulsoView } from "./pulso-view";
import { RefreshHealthButton } from "./refresh-button";

/**
 * Saúde do Sistema — "O Pulso" (super admin).
 *
 * ATENÇÃO: rota diferente de /admin/saude (aquela é o health-score COMERCIAL das
 * óticas). Aqui é a saúde da INFRAESTRUTURA: banco, hospedagem, crons,
 * integrações, monitoramento de erros + feed de incidentes.
 *
 * Snapshot ON-DEMAND, zero-polling: `force-dynamic` remonta a cada visita e o
 * botão "Atualizar agora" faz router.refresh(). Nada de intervalo — pingar o
 * banco em loop quebraria o scale-to-zero do Neon.
 */
export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const snapshot = await getSystemHealthSnapshot();

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Saúde do Sistema"
        subtitle="O Pulso — um retrato do que está de pé agora. Atualizado só quando você pede."
        actions={<RefreshHealthButton />}
      />
      <PulsoView snapshot={snapshot} />
    </div>
  );
}
