import { AlertTriangle, CheckCircle2, CreditCard, Network, RefreshCw } from "lucide-react";

import { AlertCard } from "@/components/admin/AlertCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { KPICard } from "@/components/admin/KPICard";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui/card";
import { requireAdminRole } from "@/lib/admin-session";
import {
  getFederationHealth,
  type FilaSaude,
  type FilaSeveridade,
} from "@/services/federation-health.service";

/**
 * Saúde da Federação (N2) — o canal Vis↔Domus deixa de ser invisível.
 *
 * O canal é assíncrono: quatro filas drenadas por crons. Quando uma trava, o
 * sintoma aparece longe da causa — a clínica não provisiona, o plano não chega,
 * o acesso não é cortado — e hoje só o log do worker sabe. Esta tela responde
 * "o canal está de pé?" sem ninguém precisar abrir a Vercel.
 *
 * Sempre renderiza no servidor, a cada visita: um painel de saúde em cache
 * mostraria um problema já resolvido, ou pior, esconderia um novo.
 */
export const dynamic = "force-dynamic";

const TOM: Record<FilaSeveridade, { rotulo: string; classe: string }> = {
  ok: { rotulo: "Em dia", classe: "text-emerald-600 dark:text-emerald-400" },
  atencao: { rotulo: "Atrasado", classe: "text-amber-600 dark:text-amber-400" },
  critico: { rotulo: "Travado", classe: "text-destructive" },
};

function formatarIdade(desde: Date | null): string | null {
  if (!desde) return null;
  const minutos = Math.floor((Date.now() - desde.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}

function FilaLinha({ fila }: { fila: FilaSaude }) {
  const tom = TOM[fila.severidade];
  const idade = formatarIdade(fila.maisAntigoEm);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{fila.titulo}</p>
          <p className="mt-1 text-sm text-muted-foreground">{fila.descricao}</p>
        </div>
        <span className={`shrink-0 text-sm font-semibold ${tom.classe}`}>{tom.rotulo}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          Na fila: <strong className="text-foreground">{fila.pendentes}</strong>
        </span>
        {fila.atrasados > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            Atrasados: <strong>{fila.atrasados}</strong>
          </span>
        )}
        {fila.travados > 0 && (
          <span className="text-destructive">
            {/* Travado = esgotou as tentativas. Não sai daqui sozinho. */}
            Travados: <strong>{fila.travados}</strong>
          </span>
        )}
        {idade && <span className="text-muted-foreground">Mais antigo: {idade}</span>}
      </div>
    </Card>
  );
}

export default async function SaudeFederacaoPage() {
  // Mesmo gate das outras telas de infraestrutura (e-mails, sincronização):
  // isto expõe o estado operacional do canal de TODOS os clientes de uma vez,
  // não o de uma empresa. É leitura de plataforma, não de atendimento.
  await requireAdminRole(["SUPER_ADMIN"]);

  const saude = await getFederationHealth();
  const { planosEmRisco } = saude;
  const tudoEmDia = saude.geral === "ok";

  return (
    <div>
      <PageHeader
        title="Saúde da Federação"
        subtitle="Estado do canal entre o Vis e o Domus: provisionamento, permissões, revogações e trocas de plano."
      />

      {/* Cliente cobrado sem receber o plano vem PRIMEIRO: é o único estado
          aqui em que há dinheiro do cliente sem contrapartida. */}
      {planosEmRisco.cobradoSemAplicar > 0 && (
        <div className="mb-4">
          <AlertCard
            tone="danger"
            icon={CreditCard}
            title={`${planosEmRisco.cobradoSemAplicar} cliente(s) cobrado(s) sem receber o plano`}
            description="A cobrança foi confirmada mas o plano não chegou ao Domus. Exige correção manual."
          />
        </div>
      )}

      {planosEmRisco.revisaoManual > 0 && (
        <div className="mb-4">
          <AlertCard
            tone="warning"
            icon={AlertTriangle}
            title={`${planosEmRisco.revisaoManual} troca(s) de plano em revisão manual`}
            description="A saga parou num ponto que exige decisão humana."
          />
        </div>
      )}

      {/* Saga parada no meio: ainda não virou dano, mas é a antessala do
          "cobrado sem aplicar". Sem isto ficaria invisível — só os estados
          terminais apareciam. Achado do Codex. */}
      {planosEmRisco.presas > 0 && (
        <div className="mb-4">
          <AlertCard
            tone="warning"
            icon={RefreshCw}
            title={`${planosEmRisco.presas} troca(s) de plano parada(s) no meio do processo`}
            description="Começaram e não concluíram dentro do prazo esperado. Verificar antes que virem cobrança sem plano."
          />
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          icon={tudoEmDia ? CheckCircle2 : AlertTriangle}
          label="Estado do canal"
          value={tudoEmDia ? "Em dia" : TOM[saude.geral].rotulo}
          hint={tudoEmDia ? "Nenhuma pendência acumulada" : "Há itens exigindo atenção"}
        />
        <KPICard
          icon={Network}
          label="Itens aguardando"
          value={String(saude.filas.reduce((total, f) => total + f.pendentes, 0))}
          hint="Somados em todas as filas do canal"
        />
        <KPICard
          icon={RefreshCw}
          label="Trocas de plano com falha"
          value={String(planosEmRisco.falhas)}
          hint="Falha-segura: não houve cobrança"
        />
      </div>

      {tudoEmDia && saude.filas.every((f) => f.pendentes === 0) ? (
        <EmptyState
          icon={CheckCircle2}
          message="Canal em dia — nenhum item pendente entre o Vis e o Domus."
        />
      ) : (
        <div className="grid gap-4">
          {saude.filas.map((fila) => (
            <FilaLinha key={fila.chave} fila={fila} />
          ))}
        </div>
      )}
    </div>
  );
}
