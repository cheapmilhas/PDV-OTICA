// src/app/admin/monitoramento/page.tsx
//
// Cockpit de monitoramento (Fase 5): faixa de status + 2 colunas (Sistema | Clientes).
// Server component: faz a carga inicial server-side (sem flash de loading) e passa o
// payload para o cockpit-client, que mantém o PULSO atualizado via polling.
import { requireAdmin } from "@/lib/admin-session";
import { getSystemPulse } from "@/lib/monitoring/system-pulse";
import { getSystemTrends } from "@/lib/monitoring/system-trends";
import { getClientHealthSnapshot } from "@/lib/monitoring/client-health-snapshot";
import { Gauge } from "lucide-react";
import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

export default async function MonitoramentoPage() {
  await requireAdmin();

  const [pulse, trends, clientHealth] = await Promise.all([
    getSystemPulse(),
    getSystemTrends(),
    getClientHealthSnapshot(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-600/20">
          <Gauge className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoramento</h1>
          <p className="text-sm text-gray-400">
            Saúde do sistema e dos clientes em um só lugar.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Como ler:</span> o{" "}
        <span className="text-gray-300">pulso</span> reflete a instância que respondeu
        agora (memória, latência, cache). As{" "}
        <span className="text-gray-300">tendências</span> agregam toda a frota nas
        últimas 24h.
      </div>

      <CockpitClient initial={{ pulse, trends, clientHealth }} />
    </div>
  );
}
