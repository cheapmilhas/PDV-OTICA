import Link from "next/link";
import { PlugZap } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdminRole } from "@/lib/admin-session";
import { getIntegrationsStatus } from "@/services/integrations-status.service";

export const dynamic = "force-dynamic";

export default async function IntegracoesConfigPage() {
  await requireAdminRole(["SUPER_ADMIN"]);

  const integrations = await getIntegrationsStatus();

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="Integrações & Chaves"
        subtitle="Quais serviços externos estão configurados. Os valores dos segredos nunca são exibidos — só o status."
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <ul className="divide-y divide-border">
          {integrations.map((it) => (
            <li key={it.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <PlugZap className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{it.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {it.configured ? `Fonte: ${it.source}` : `Ajustar em: ${it.hint}`}
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold whitespace-nowrap ${
                  it.configured ? "text-success" : "text-warning"
                }`}
              >
                {it.configured ? "✓ configurado" : "✗ não configurado"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        A chave e o remetente de e-mail podem ser editados em{" "}
        <Link href="/admin/configuracoes/emails" className="text-primary hover:underline">
          Configurações → Emails
        </Link>
        . As demais integrações são definidas por variável de ambiente na Vercel.
      </p>
    </div>
  );
}
