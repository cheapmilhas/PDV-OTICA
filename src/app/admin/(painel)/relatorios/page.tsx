import { requireFinanceAccess } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, CreditCard, FileText, Ticket, Download, Heart, Activity, TrendingUp } from "lucide-react";
import { computeMRR, computeChurnRate, type SubscriptionForMRR } from "@/lib/admin-metrics";
import { computeTrialConversion, TRIAL_COHORT_START } from "@/lib/trial-conversion";
import { startOfLocalMonth } from "@/lib/date-utils";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../dashboard-filters";
import { ReconcileBillingButton } from "./ReconcileBillingButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { DollarSign } from "lucide-react";

export default async function RelatoriosPage() {
  // Tela DEDICADA a agregado financeiro: MRR, churn e conversão de trial da
  // operadora inteira, mais os cards de export. Não há nada aqui que sobre para
  // quem não tem papel financeiro — então barra a página, não esconde blocos
  // (diferente do dashboard, que é a home e o alvo do redirect deste gate).
  await requireFinanceAccess();

  // Lente de produto. Subscription e SupportTicket chegam a Company pela relação
  // `company` → mesma via do dashboard (pf.subscriptionCompany). Os helpers de
  // métrica (computeMRR/computeChurnRate) continuam puros: só recebem subscriptions
  // JÁ filtradas por produto — a parametrização é na query, não no helper.
  const product = await getProductContext();
  const pSub = buildDashboardFilters(product).subscriptionCompany;

  const now = new Date();
  // Início do mês no fuso local (BRT), não no fuso do servidor (UTC na Vercel).
  // Alimenta churn/tickets/base ativa: sem isso, eventos das últimas horas do
  // mês (BRT) caíam no mês seguinte, distorcendo numerador E denominador do churn.
  const startOfMonth = startOfLocalMonth(now);

  const [
    activeSubscriptions,
    trialSubscriptions,
    canceledThisMonth,
    ticketsThisMonth,
    activeAtMonthStart,
    mrrData,
    trialsForConversion,
  ] = await Promise.all([
    prisma.subscription.count({ where: { AND: [pSub, { status: "ACTIVE" }] } }),
    prisma.subscription.count({ where: { AND: [pSub, { status: "TRIAL" }] } }),
    prisma.subscription.count({
      where: { AND: [pSub, { status: "CANCELED", canceledAt: { gte: startOfMonth } }] },
    }),
    prisma.supportTicket.count({ where: { AND: [pSub, { createdAt: { gte: startOfMonth } }] } }),
    // Base inicial do mês (ESTIMATIVA — status atual ≠ status passado): assinaturas
    // ativadas antes do início do mês e ainda não canceladas naquele momento.
    prisma.subscription.count({
      where: {
        AND: [
          pSub,
          {
            activatedAt: { lt: startOfMonth },
            OR: [{ canceledAt: null }, { canceledAt: { gte: startOfMonth } }],
          },
        ],
      },
    }),
    // MRR: precisa do plano (preços) + ciclo/desconto da subscription.
    prisma.subscription.findMany({
      where: { AND: [pSub, { status: "ACTIVE" }] },
      include: { plan: { select: { priceMonthly: true, priceYearly: true } } },
    }),
    // N4: conversão de trial. Traz TODA assinatura que um dia teve trial —
    // inclusive canceladas: quem converteu e depois cancelou continua sendo
    // conversão histórica, e filtrar por status apagaria isso da série.
    // Sem filtro de status, portanto; o recorte é `trialStartedAt != null`.
    prisma.subscription.findMany({
      where: { AND: [pSub, { trialStartedAt: { not: null } }] },
      select: {
        id: true,
        companyId: true,
        trialStartedAt: true,
        trialEndsAt: true,
        activatedAt: true,
      },
    }),
  ]);

  // MRR com desconto vigente + ciclo normalizado (helper puro, em centavos).
  const subsForMrr: SubscriptionForMRR[] = mrrData.map((s) => ({
    priceMonthly: s.plan.priceMonthly,
    priceYearly: s.plan.priceYearly,
    billingCycle: s.billingCycle,
    discountPercent: s.discountPercent,
    discountExpiresAt: s.discountExpiresAt,
  }));
  const mrrEstimado = computeMRR(subsForMrr, now);

  const churnRate = computeChurnRate({
    canceledInPeriod: canceledThisMonth,
    activeAtPeriodStart: activeAtMonthStart,
  });
  const churnPct = (churnRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  // N4: conversão de trial (helper puro; a query já veio filtrada por produto).
  //
  // 🔑 O corte de coorte NÃO é cosmético. `trialEndsAt` sobrevive à expiração,
  // então sem ele todo trial antigo entraria na conta — e como a conversão
  // manual por fatura só passou a gravar `activatedAt` a partir desta entrega,
  // cliente antigo que converteu à mão entraria como PERDA, afundando a taxa
  // por um defeito de registro e não por um fato comercial.
  const conv = computeTrialConversion(trialsForConversion, now, TRIAL_COHORT_START);

  return (
    <div className="p-6">
      <PageHeader
        title="Relatórios"
        subtitle="Gere relatórios e exporte dados do sistema"
        actions={<ReconcileBillingButton />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={DollarSign}
          label="MRR"
          value={`R$ ${(mrrEstimado / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
        />
        <KPICard
          icon={Users}
          label="Clientes Ativos"
          value={String(activeSubscriptions)}
          hint={`+ ${trialSubscriptions} em trial`}
        />
        <KPICard
          icon={Activity}
          label="Churn (Mês) · est."
          value={`${churnPct}%`}
          hint={`${canceledThisMonth} cancelada${canceledThisMonth === 1 ? "" : "s"} de ${activeAtMonthStart} ativas`}
        />
        <KPICard
          icon={Ticket}
          label="Tickets (Mês)"
          value={String(ticketsThisMonth)}
        />
      </div>

      {/* N4 — Conversão de trial.
          A unidade é a ASSINATURA-TRIAL, não a empresa: uma empresa pode ter
          várias assinaturas, e contar por empresa esconderia a tentativa que
          falhou de quem trialou duas vezes. Por isso o rótulo diz "trials". */}
      <h2 className="text-lg font-semibold mb-1">Conversão de trial</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Trials com resultado fechado: converteram, ou o prazo acabou sem conversão.
        {conv.inProgress > 0 && ` ${conv.inProgress} ainda em andamento (fora da taxa).`}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KPICard
          icon={TrendingUp}
          label="Taxa de conversão"
          // rate null = nenhum trial fechou ainda. Mostrar "0%" aqui seria
          // mentira: não houve nada para converter.
          value={
            conv.rate === null
              ? "—"
              : `${(conv.rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
          }
          hint={
            conv.rate === null
              ? "nenhum trial fechado ainda"
              : `${conv.converted} de ${conv.eligible} trials`
          }
        />
        <KPICard
          icon={Users}
          label="Trials convertidos"
          value={String(conv.converted)}
          hint="inclui quem cancelou depois"
        />
        <KPICard
          icon={Activity}
          label="Tempo até converter"
          value={
            conv.avgDaysToConvert === null
              ? "—"
              : `${conv.avgDaysToConvert.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`
          }
          hint="média do início do trial à ativação"
        />
      </div>
      <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 mb-6">
        <p className="text-muted-foreground text-sm">
          Conta apenas trials iniciados a partir de 27/07/2026
          {conv.excludedLegacy > 0 && (
            <>
              {" "}
              — <strong>{conv.excludedLegacy}</strong> trial
              {conv.excludedLegacy === 1 ? "" : "s"} anterior
              {conv.excludedLegacy === 1 ? "" : "es"} {conv.excludedLegacy === 1 ? "ficou" : "ficaram"} de fora
            </>
          )}
          . Antes dessa data, conversão confirmada manualmente por fatura não era
          registrada, então esses trials apareceriam como perda mesmo tendo virado
          cliente.
        </p>
      </div>

      {/* Aviso */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        <p className="text-amber-700 text-sm">
          ⚠️ MRR e Churn são estimados com base nas assinaturas. Para dados precisos de receita,
          integre com gateway de pagamento (sprint futuro).
        </p>
      </div>

      {/* Cards de Export */}
      <h2 className="text-lg font-semibold mb-4">Exportar Dados</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ExportCard
          title="Clientes"
          description="Lista completa de clientes cadastrados"
          icon={Users}
          href="/api/admin/export/clientes"
        />
        <ExportCard
          title="Assinaturas"
          description="Status e histórico de assinaturas"
          icon={CreditCard}
          href="/api/admin/export/assinaturas"
        />
        <ExportCard
          title="Faturas"
          description="Histórico de cobranças emitidas"
          icon={FileText}
          href="/api/admin/export/faturas"
        />
        <ExportCard
          title="Tickets"
          description="Histórico de suporte"
          icon={Ticket}
          href="/api/admin/export/tickets"
        />
        {/* Health só para ótica — na visão Medical o export sairia vazio. */}
        {product !== "VIS_MEDICAL" && (
          <ExportCard
            title="Health Scores"
            description="Saúde dos clientes"
            icon={Heart}
            href="/api/admin/export/health-scores"
          />
        )}
        <ExportCard
          title="Auditoria"
          description="Log de ações administrativas"
          icon={Activity}
          href="/api/admin/export/auditoria"
        />
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  icon: any;
  href: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <a
        href={href}
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/70 transition-colors"
      >
        <Download className="w-4 h-4" />
        Baixar CSV
      </a>
    </div>
  );
}
