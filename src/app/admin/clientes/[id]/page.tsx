import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin, Users, ShoppingCart, Package, Calendar, DollarSign } from "lucide-react";
import { CompanyActions } from "./company-actions";
import { CompanyTabs, TabPanel } from "./company-tabs";
import { CompanyNotes } from "./company-notes";
import { CompanyUsers } from "./company-users";
import { HealthBadge } from "@/components/health-badge";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
};
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-900/50 text-green-400",
  TRIAL: "bg-blue-900/50 text-blue-400",
  PAST_DUE: "bg-red-900/50 text-red-400",
  SUSPENDED: "bg-red-900/50 text-red-400",
  CANCELED: "bg-gray-800 text-gray-400",
  TRIAL_EXPIRED: "bg-orange-900/50 text-orange-400",
};
const INVOICE_STYLES: Record<string, string> = {
  PAID: "bg-green-900/50 text-green-400",
  PENDING: "bg-yellow-900/50 text-yellow-400",
  OVERDUE: "bg-red-900/50 text-red-400",
  CANCELED: "bg-gray-800 text-gray-400",
};

export default async function EmpresaDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      branches: { select: { id: true, name: true, city: true, state: true } },
      users: { select: { id: true, name: true, email: true, role: true, active: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true } },
      _count: { select: { sales: true, products: true, customers: true } },
    },
  });

  if (!company) notFound();

  const currentSubscription = company.subscriptions[0] ?? null;
  const invoices = currentSubscription
    ? await prisma.invoice.findMany({
        where: { subscriptionId: currentSubscription.id },
        orderBy: { issuedAt: "desc" },
      })
    : [];

  // Buscar histórico de assinatura
  const subscriptionHistory = currentSubscription
    ? await prisma.subscriptionHistory.findMany({
        where: { subscriptionId: currentSubscription.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  // Buscar snapshots de uso (últimos 30 dias)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const usageSnapshots = await prisma.usageSnapshot.findMany({
    where: {
      companyId: id,
      date: { gte: thirtyDaysAgo },
    },
    orderBy: { date: "desc" },
  });

  // Buscar último health score
  const latestHealthScore = await prisma.healthScore.findFirst({
    where: { companyId: id },
    orderBy: { calculatedAt: "desc" },
  });

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/clientes" className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">{company.name}</h1>
              {company.isBlocked && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-800">
                  Bloqueado
                </span>
              )}
              {company.healthScore && company.healthCategory && (
                <HealthBadge score={company.healthScore} category={company.healthCategory} size="md" />
              )}
            </div>
            <p className="text-sm text-gray-400">{company.email ?? "—"}</p>
          </div>
        </div>
        <CompanyActions
          companyId={company.id}
          companyName={company.name}
          isBlocked={company.isBlocked}
          subscriptionStatus={currentSubscription?.status ?? null}
          billingCycle={currentSubscription?.billingCycle ?? null}
          currentPlanId={currentSubscription?.planId ?? null}
        />
      </div>

      {/* Tabs */}
      <CompanyTabs>
        {/* TAB: RESUMO */}
        <TabPanel tabId="resumo">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-5">
              {/* Health Score Detalhado */}
              {latestHealthScore && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Health Score Detalhado</h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <ScoreBar label="Usage" score={latestHealthScore.usageScore} />
                    <ScoreBar label="Billing" score={latestHealthScore.billingScore} />
                    <ScoreBar label="Engagement" score={latestHealthScore.engagementScore} />
                    <ScoreBar label="Support" score={latestHealthScore.supportScore} />
                  </div>

                  {latestHealthScore.riskFactors && Array.isArray(latestHealthScore.riskFactors) && (latestHealthScore.riskFactors as string[]).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-red-400 mb-2">⚠️ Fatores de Risco:</p>
                      <ul className="space-y-1">
                        {(latestHealthScore.riskFactors as string[]).map((risk, i) => (
                          <li key={i} className="text-xs text-gray-400 pl-4">• {risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestHealthScore.opportunities && Array.isArray(latestHealthScore.opportunities) && (latestHealthScore.opportunities as string[]).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-400 mb-2">💡 Oportunidades:</p>
                      <ul className="space-y-1">
                        {(latestHealthScore.opportunities as string[]).map((opp, i) => (
                          <li key={i} className="text-xs text-gray-400 pl-4">• {opp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-gray-600 mt-3">
                    Calculado em {new Date(latestHealthScore.calculatedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              )}

              {/* Informações gerais */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Informações Gerais</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoRow label="CNPJ" value={company.cnpj ?? "—"} />
                  <InfoRow label="Telefone" value={company.phone ?? "—"} />
                  <InfoRow label="Cidade" value={company.city ? `${company.city}/${company.state}` : "—"} />
                  <InfoRow label="Slug" value={company.slug ?? "—"} />
                  <InfoRow label="Cadastro" value={new Date(company.createdAt).toLocaleDateString("pt-BR")} />
                  {company.blockedReason && <InfoRow label="Motivo bloqueio" value={company.blockedReason} />}
                </div>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Vendas" value={company._count.sales} icon={ShoppingCart} />
                <MetricCard label="Produtos" value={company._count.products} icon={Package} />
                <MetricCard label="Clientes" value={company._count.customers} icon={Users} />
              </div>

              {/* Usuários */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Usuários ({company.users.length})</h2>
                </div>
                {company.users.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-600">Nenhum usuário</p>
                ) : (
                  <div className="divide-y divide-gray-800/50">
                    {company.users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-white">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">{u.role}</span>
                          {!u.active && <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-400">Inativo</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filiais */}
              {company.branches.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Filiais ({company.branches.length})</h2>
                  </div>
                  <div className="divide-y divide-gray-800/50">
                    {company.branches.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-white">{b.name}</p>
                          {b.city && <p className="text-xs text-gray-500">{b.city}, {b.state}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Coluna lateral */}
            <div className="space-y-5">
              {/* Assinatura Resumo */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Assinatura Atual</h2>
                {currentSubscription ? (
                  <div className="space-y-2.5">
                    <SubRow label="Plano" value={currentSubscription.plan.name} />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Status</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[currentSubscription.status] ?? "bg-gray-800 text-gray-400"}`}>
                        {STATUS_LABELS[currentSubscription.status] ?? currentSubscription.status}
                      </span>
                    </div>
                    <SubRow label="Ciclo" value={currentSubscription.billingCycle === "YEARLY" ? "Anual" : "Mensal"} />
                    {currentSubscription.trialEndsAt && (
                      <SubRow label="Trial expira" value={new Date(currentSubscription.trialEndsAt).toLocaleDateString("pt-BR")} />
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Building2 className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Sem assinatura ativa</p>
                  </div>
                )}
              </div>

              {/* Últimas Faturas (resumo) */}
              {invoices.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Últimas 3 Faturas</h2>
                  </div>
                  <div className="divide-y divide-gray-800/50">
                    {invoices.slice(0, 3).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-xs font-mono text-gray-300">{inv.number}</p>
                          <p className="text-xs text-gray-500">{new Date(inv.issuedAt).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">
                            R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${INVOICE_STYLES[inv.status] ?? "bg-gray-800 text-gray-400"}`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabPanel>

        {/* TAB: ASSINATURA */}
        <TabPanel tabId="assinatura">
          <div className="space-y-5">
            {currentSubscription ? (
              <>
                {/* Detalhes da Assinatura */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                  <h2 className="text-sm font-semibold text-white mb-5">Detalhes da Assinatura</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="ID" value={currentSubscription.id} />
                    <InfoRow label="Plano" value={currentSubscription.plan.name} />
                    <InfoRow label="Status" value={STATUS_LABELS[currentSubscription.status] ?? currentSubscription.status} />
                    <InfoRow label="Ciclo de Cobrança" value={currentSubscription.billingCycle === "YEARLY" ? "Anual" : "Mensal"} />
                    <InfoRow label="Criada em" value={new Date(currentSubscription.createdAt).toLocaleDateString("pt-BR")} />
                    {currentSubscription.trialStartedAt && (
                      <InfoRow label="Trial iniciado" value={new Date(currentSubscription.trialStartedAt).toLocaleDateString("pt-BR")} />
                    )}
                    {currentSubscription.trialEndsAt && (
                      <InfoRow label="Trial expira" value={new Date(currentSubscription.trialEndsAt).toLocaleDateString("pt-BR")} />
                    )}
                    {currentSubscription.currentPeriodStart && (
                      <InfoRow label="Período atual (início)" value={new Date(currentSubscription.currentPeriodStart).toLocaleDateString("pt-BR")} />
                    )}
                    {currentSubscription.currentPeriodEnd && (
                      <InfoRow label="Período atual (fim)" value={new Date(currentSubscription.currentPeriodEnd).toLocaleDateString("pt-BR")} />
                    )}
                    {currentSubscription.discountPercent && (
                      <InfoRow label="Desconto" value={`${currentSubscription.discountPercent}%`} />
                    )}
                    {currentSubscription.canceledAt && (
                      <InfoRow label="Cancelada em" value={new Date(currentSubscription.canceledAt).toLocaleDateString("pt-BR")} />
                    )}
                    {currentSubscription.pastDueSince && (
                      <InfoRow label="Em atraso desde" value={new Date(currentSubscription.pastDueSince).toLocaleDateString("pt-BR")} />
                    )}
                  </div>
                </div>

                {/* Histórico da Assinatura */}
                {subscriptionHistory.length > 0 && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800">
                      <h2 className="text-sm font-semibold text-white">Histórico de Alterações</h2>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                      {subscriptionHistory.map((hist) => (
                        <div key={hist.id} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-white">
                              {hist.action === "created" && "Criada"}
                              {hist.action === "upgraded" && "Upgrade"}
                              {hist.action === "downgraded" && "Downgrade"}
                              {hist.action === "canceled" && "Cancelada"}
                              {hist.action === "reactivated" && "Reativada"}
                              {hist.action === "extended_trial" && "Trial Estendido"}
                              {hist.action === "billing_cycle_changed" && "Ciclo Alterado"}
                              {!["created", "upgraded", "downgraded", "canceled", "reactivated", "extended_trial", "billing_cycle_changed"].includes(hist.action) && hist.action}
                            </span>
                            <span className="text-xs text-gray-500">{new Date(hist.createdAt).toLocaleString("pt-BR")}</span>
                          </div>
                          {hist.reason && <p className="text-xs text-gray-400">{hist.reason}</p>}
                          <p className="text-xs text-gray-600">Por: {hist.adminName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
                <Building2 className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">Esta empresa não possui assinatura ativa</p>
              </div>
            )}
          </div>
        </TabPanel>

        {/* TAB: USUÁRIOS */}
        <TabPanel tabId="usuarios">
          <CompanyUsers
            companyId={id}
            branches={company.branches.map((b) => ({ id: b.id, name: b.name }))}
          />
        </TabPanel>

        {/* TAB: FATURAS */}
        <TabPanel tabId="faturas">
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
              <DollarSign className="h-12 w-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">Nenhuma fatura encontrada</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Número</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Emissão</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Vencimento</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Valor</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Tipo Pgto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-gray-300">{inv.number}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-400">
                          {new Date(inv.issuedAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-5 py-3 text-gray-400">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-5 py-3 text-white font-medium">
                          R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${INVOICE_STYLES[inv.status] ?? "bg-gray-800 text-gray-400"}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs">
                          {inv.billingType || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabPanel>

        {/* TAB: NOTAS */}
        <TabPanel tabId="notas">
          <CompanyNotes companyId={id} />
        </TabPanel>

        {/* TAB: USO */}
        <TabPanel tabId="uso">
          {usageSnapshots.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum snapshot de uso registrado</p>
              <p className="text-xs text-gray-600 mt-1">Snapshots são gerados automaticamente pelo sistema</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usageSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">
                      {new Date(snapshot.date).toLocaleDateString("pt-BR")}
                    </h3>
                    {snapshot.lastLoginAt && (
                      <span className="text-xs text-gray-500">
                        Último login: {new Date(snapshot.lastLoginAt).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <UsageMetric label="Usuários Ativos" value={snapshot.activeUsers} />
                    <UsageMetric label="Vendas" value={snapshot.totalSales} />
                    <UsageMetric label="Receita" value={`R$ ${(Number(snapshot.totalRevenue) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                    <UsageMetric label="Produtos" value={snapshot.totalProducts} />
                    <UsageMetric label="Clientes" value={snapshot.totalCustomers} />
                    <UsageMetric label="Ordens" value={snapshot.totalOrders} />
                    <UsageMetric label="Logins" value={snapshot.loginCount} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabPanel>
      </CompanyTabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-200">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
      <Icon className="h-5 w-5 text-gray-500 mx-auto mb-2" />
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return "bg-green-500";
    if (s >= 60) return "bg-blue-500";
    if (s >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-medium text-white">{score}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div className={`h-2 rounded-full ${getColor(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function UsageMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
