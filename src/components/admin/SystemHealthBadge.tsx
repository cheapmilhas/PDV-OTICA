import Link from "next/link";
import { HeartPulse } from "lucide-react";

/**
 * Sino/indicador da Saúde do Sistema — ZERO POLLING por design. A contagem de
 * incidentes abertos é lida NO SERVIDOR (layout async) a cada navegação e passada
 * como prop; não há setInterval nem fetch no cliente (foi o polling que derrubou
 * a Vercel). Some quando não há nada aberto — só chama atenção quando importa.
 */
export function SystemHealthBadge({ openCount }: { openCount: number }) {
  if (openCount <= 0) return null;
  return (
    <Link
      href="/admin/configuracoes/saude"
      title={`${openCount} incidente(s) de sistema aberto(s)`}
      className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
    >
      <HeartPulse className="h-5 w-5" />
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">
        {openCount > 99 ? "99+" : openCount}
      </span>
    </Link>
  );
}
