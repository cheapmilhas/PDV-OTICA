import { requireAdmin } from "@/lib/admin-session";
import { isFinanceRole } from "@/lib/admin-finance-roles";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, Building2, Clock, CreditCard, TrendingUp, DollarSign, Activity, CheckCircle2, Bell } from "lucide-react";
import Link from "next/link";
import { HealthBadge } from "@/components/health-badge";
import { RecalcHealthButton } from "./RecalcHealthButton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AlertCard } from "@/components/admin/AlertCard";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { computeTrend, formatTrend, computeMRR, computeMrrSeries, type SubscriptionForMRR, type SubscriptionForSeries } from "@/lib/admin-metrics";
import { MrrChart } from "@/components/admin/MrrChart";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "./dashboard-filters";

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  /**
   * ─── Por que o dashboard ESCONDE em vez de BARRAR ──────────────────────────
   *
   * As telas dedicadas do financeiro (`/admin/financeiro/**`, `/admin/relatorios`,
   * `/admin/grupo`) chamam `requireFinanceAccess()`, que redireciona para
   * `/admin?error=unauthorized`. `/admin` é ESTA página. Colocar o mesmo gate
   * aqui criaria um laço de redirecionamento infinito: SUPPORT abre
   * `/admin/relatorios` → vai para `/admin` → gate barra → vai para `/admin`…
   * (`src/proxy.ts` só checa `isAdmin`, nunca o papel, e o layout `(painel)` não
   * tem gate — não há nada que interrompa o laço.)
   *
   * Além disso o dashboard é a HOME do painel: barrá-lo deixaria um SUPPORT
   * legítimo sem nenhuma porta de entrada.
   *
   * Então a política aqui é: o papel decide se os dados financeiros são
   * CONSULTADOS — não apenas se são renderizados. Esconder o JSX mantendo a
   * query seria vazamento igual: o número viajaria no payload RSC (o `MrrChart`
   * é Client Component e recebe a série como prop) e apareceria em qualquer
   * inspeção de rede. Por isso `financeiro` abaixo é `null` para quem não tem
   * papel, e as queries de Invoice/MRR nem chegam a sair.
   */
  const canSeeFinance = isFinanceRole(admin.role);

  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  // Fase B: tendências mês atual vs. mês anterior (fuso SP — lição M2).
  const nowDate = new Date();
  const curStart = startOfLocalMonth(nowDate);
  const curEnd = endOfLocalMonth(nowDate);
  const prevRef = new Date(curStart.getTime() - 1); // 1ms antes do início do mês atual = mês anterior
  const prevStart = startOfLocalMonth(prevRef);
  const prevEnd = endOfLocalMonth(prevRef);

  // ─── Bloco SEMPRE permitido: operação, não dinheiro ───────────────────────
  const [
    totalCompanies,
    activeCount,
    trialCount,
    recentCompanies,
    expiringTrials,
    criticalHealthCount,
    atRiskHealthCount,
    lastHealthCalc,
    newCompaniesCur,
    newCompaniesPrev,
  ] = await Promise.all([
    prisma.company.count({ where: { ...pf.company } }),
    prisma.subscription.count({ where: { status: "ACTIVE", ...pf.subscriptionCompany } }),
    prisma.subscription.count({ where: { status: "TRIAL", ...pf.subscriptionCompany } }),
    prisma.company.findMany({
      take: 10,
      where: { ...pf.company },
      // tiebreaker por id: createdAt não é único (seed/import) → sem isto a
      // lista truncada troca de itens entre refreshes.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        subscriptions: { take: 1, orderBy: { createdAt: "desc" }, include: { plan: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.subscription.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { lte: new Date(Date.now() + 3 * 86400000), gte: new Date() },
        ...pf.subscriptionCompany,
      },
      include: { company: { select: { id: true, name: true } }, plan: { select: { name: true } } },
    }),
    prisma.company.count({ where: { healthCategory: "CRITICAL", ...pf.company } }),
    prisma.company.count({ where: { healthCategory: "AT_RISK", ...pf.company } }),
    // Fase A: data do health mais recente — mostra se os números de saúde estão frescos.
    prisma.company.findFirst({
      where: { healthUpdatedAt: { not: null }, ...pf.company },
      orderBy: { healthUpdatedAt: "desc" },
      select: { healthUpdatedAt: true },
    }),
    prisma.company.count({ where: { createdAt: { gte: curStart, lte: curEnd }, ...pf.company } }),
    prisma.company.count({ where: { createdAt: { gte: prevStart, lte: prevEnd }, ...pf.company } }),
  ]);

  /**
   * ─── Bloco FINANCEIRO: só roda com papel ──────────────────────────────────
   *
   * Escopo do bloco (o que conta como "financeiro" aqui): receita recebida,
   * MRR e a série do MRR — os agregados consolidados da operadora — mais os
   * sinais de cobrança (faturas vencidas e a vencer). Inadimplência e faturas
   * pendentes entram porque são estado de cobrança da carteira inteira, o mesmo
   * dado que `/admin/financeiro/inadimplencia` acabou de trancar; deixá-los no
   * dashboard trocaria a tela pelo atalho.
   *
   * Ficam DE FORA de propósito (seguem visíveis a SUPPORT): contagens de
   * empresas/assinaturas/trials, health score e empresas recentes. São sinais
   * operacionais que o suporte precisa para trabalhar, e nenhum deles carrega
   * valor em reais.
   */
  const financeiro = canSeeFinance
    ? await (async () => {
        const [pastDueCount, totalRevenue, activeSubs, pendingInvoicesCount, revenueCur, revenuePrev] =
          await Promise.all([
            prisma.subscription.count({ where: { status: "PAST_DUE", ...pf.subscriptionCompany } }),
            prisma.invoice.aggregate({ where: { status: "PAID", ...pf.invoiceCompany }, _sum: { total: true } }),
            prisma.subscription.findMany({ where: { status: "ACTIVE", ...pf.subscriptionCompany }, include: { plan: true } }),
            // Só a CONTAGEM: o card mostra `.length` e nada mais. Trazer as
            // faturas inteiras (com nome da empresa e vencimento) era over-fetch
            // de dado sensível para renderizar um número.
            prisma.invoice.count({
              where: {
                status: "PENDING",
                dueDate: { lte: new Date(Date.now() + 7 * 86400000) }, // Vence em 7 dias
                ...pf.invoiceCompany,
              },
            }),
            prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: curStart, lte: curEnd }, ...pf.invoiceCompany }, _sum: { total: true } }),
            prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: prevStart, lte: prevEnd }, ...pf.invoiceCompany }, _sum: { total: true } }),
          ]);

        // MRR com desconto vigente + ciclo normalizado (helper puro, centavos → reais).
        const subsForMrr: SubscriptionForMRR[] = activeSubs.map((sub) => ({
          priceMonthly: sub.plan.priceMonthly,
          priceYearly: sub.plan.priceYearly,
          billingCycle: sub.billingCycle,
          discountPercent: sub.discountPercent,
          discountExpiresAt: sub.discountExpiresAt,
        }));
        const subsForSeries: SubscriptionForSeries[] = activeSubs.map((sub) => ({
          priceMonthly: sub.plan.priceMonthly,
          priceYearly: sub.plan.priceYearly,
          billingCycle: sub.billingCycle,
          discountPercent: sub.discountPercent,
          discountExpiresAt: sub.discountExpiresAt,
          createdAt: sub.createdAt,
        }));

        return {
          pastDueCount,
          pendingInvoicesCount,
          totalRevenueValue: (totalRevenue._sum?.total ?? 0) / 100,
          mrrValue: computeMRR(subsForMrr, nowDate) / 100,
          mrrSeries: computeMrrSeries(subsForSeries, nowDate, 6),
          revenueTrend: computeTrend(
            (revenueCur._sum?.total ?? 0) / 100,
            (revenuePrev._sum?.total ?? 0) / 100
          ),
        };
      })()
    : null;

  const companiesTrend = computeTrend(newCompaniesCur, newCompaniesPrev);

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Bem-vindo, ${admin.name} · ${admin.role}`}
        actions={
          // Health é derivado de sinais óticos e o recálculo escreve SÓ em VIS_APP
          // (recalcAllActiveHealthScores filtra platformProduct). Na visão Medical o
          // botão operaria silenciosamente no outro produto e contradiz "indisponível" —
          // então some junto com o card de saúde.
          product !== "VIS_MEDICAL" ? (
            <div className="flex flex-col items-end gap-1">
              <RecalcHealthButton />
              <p className="text-xs text-muted-foreground">
                {lastHealthCalc?.healthUpdatedAt
                  ? `Saúde atualizada em ${new Date(lastHealthCalc.healthUpdatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`
                  : "Saúde ainda não calculada — clique para recalcular"}
              </p>
            </div>
          ) : undefined
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <KPICard
          label="Total de Empresas"
          value={String(totalCompanies)}
          icon={Building2}
          trend={companiesTrend.direction === "up" || companiesTrend.direction === "down"
            ? { direction: companiesTrend.direction, label: `${formatTrend(companiesTrend)} · novas no mês` }
            : undefined}
        />
        <KPICard label="Assinaturas Ativas" value={String(activeCount)} icon={CreditCard} />
        {financeiro && (
          <KPICard
            label="MRR"
            value={`R$ ${financeiro.mrrValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
          />
        )}
        <KPICard label="Em Trial" value={String(trialCount)} icon={Clock} />
        {financeiro && (
          <KPICard
            label="Recebido Total"
            value={`R$ ${financeiro.totalRevenueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={TrendingUp}
            hint="Soma das faturas pagas"
            trend={financeiro.revenueTrend.direction === "up" || financeiro.revenueTrend.direction === "down"
              ? { direction: financeiro.revenueTrend.direction, label: `${formatTrend(financeiro.revenueTrend)} · recebido vs. mês anterior` }
              : undefined}
          />
        )}
      </div>

      {/* Evolução do MRR — some inteiro sem papel financeiro (a série nem é consultada). */}
      {financeiro && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Evolução do MRR</h2>
              <p className="text-xs text-muted-foreground">Últimos 6 meses · aproximado pela data de início das assinaturas ativas</p>
            </div>
            <p className="text-lg font-semibold text-foreground">R$ {financeiro.mrrValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="h-56">
            <MrrChart data={financeiro.mrrSeries} />
          </div>
        </Card>
      )}

      {/* Health Score Resumo — oculto para medical: o score é derivado de sinais
          óticos (não há feed clínico até a F6), então os números seriam falsos. */}
      {product !== "VIS_MEDICAL" && (criticalHealthCount > 0 || atRiskHealthCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {criticalHealthCount > 0 && (
            <AlertCard
              tone="danger"
              icon={Activity}
              href="/admin/saude?category=CRITICAL"
              title={`${criticalHealthCount} cliente${criticalHealthCount > 1 ? "s" : ""} em estado crítico`}
              description="Requer ação imediata →"
            />
          )}
          {atRiskHealthCount > 0 && (
            <AlertCard
              tone="warning"
              icon={Activity}
              href="/admin/saude?category=AT_RISK"
              title={`${atRiskHealthCount} cliente${atRiskHealthCount > 1 ? "s" : ""} em risco`}
              description="Precisa atenção →"
            />
          )}
        </div>
      )}

      {/* Ações Pendentes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Ações Pendentes
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* "Nada pendente" só é verdade sobre o que ESTE usuário pode ver: sem
              papel financeiro os dois cards de cobrança nem existem, então a
              condição não pode olhar para eles. */}
          {(financeiro === null || (financeiro.pastDueCount === 0 && financeiro.pendingInvoicesCount === 0)) &&
            expiringTrials.length === 0 && (
              <AlertCard
                tone="success"
                icon={CheckCircle2}
                title="Nenhuma ação pendente no momento"
                className="md:col-span-3"
              />
            )}
          {financeiro !== null && financeiro.pastDueCount > 0 && (
            <AlertCard
              tone="danger"
              icon={AlertTriangle}
              href="/admin/financeiro/inadimplencia"
              title={`${financeiro.pastDueCount} fatura${financeiro.pastDueCount > 1 ? "s" : ""} vencida${financeiro.pastDueCount > 1 ? "s" : ""}`}
              description="Cobrar agora →"
            />
          )}
          {expiringTrials.length > 0 && (
            <AlertCard
              tone="warning"
              icon={Clock}
              href="/admin/clientes?status=TRIAL"
              title={`${expiringTrials.length} trial${expiringTrials.length > 1 ? "s" : ""} expirando`}
              description="Próximos 3 dias →"
            />
          )}
          {financeiro !== null && financeiro.pendingInvoicesCount > 0 && (
            <AlertCard
              tone="info"
              icon={CheckCircle2}
              href="/admin/financeiro/faturas?status=PENDING"
              title={`${financeiro.pendingInvoicesCount} fatura${financeiro.pendingInvoicesCount > 1 ? "s" : ""} a vencer`}
              description="Próximos 7 dias →"
            />
          )}
        </div>
      </div>

      {/* Empresas recentes */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Empresas Recentes</h2>
          <Link href="/admin/clientes" className="text-xs text-primary hover:text-primary/80">Ver todas →</Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usuários</TableHead>
              <TableHead>Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhuma empresa
                </TableCell>
              </TableRow>
            ) : (
              recentCompanies.map((c) => {
                const sub = c.subscriptions[0];
                const status = sub?.status ?? "NO_SUBSCRIPTION";
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-foreground hover:text-primary">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sub?.plan?.name ?? "—"}</TableCell>
                    <TableCell>
                      <AdminStatusBadge kind="subscription" status={status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c._count.users}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
