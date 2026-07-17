import { requireAdmin, requireSupportScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin, Users, ShoppingCart, Package, Calendar, DollarSign } from "lucide-react";
import { ResendChargeButton } from "@/components/admin/resend-charge-button";
import { NovaCobrancaButton } from "@/components/admin/nova-cobranca-button";
import { CompanyActions } from "./company-actions";
import { CompanyTabs, TabPanel } from "./company-tabs";
import { CompanyNotes } from "./company-notes";
import { CompanyUsers } from "./company-users";
import { CompanyBranches } from "./company-branches";
import { CompanyDataForm } from "./company-data-form";
import { CompanyNetwork } from "./company-network";
import { CompanyAiPanel } from "./company-ai-panel";
import { CompanyWhatsappPanel } from "./company-whatsapp-panel";
import { HealthBadge } from "@/components/health-badge";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { adminStatusLabel } from "@/lib/admin-status";
import { CompanyTimeline } from "./company-timeline";
import { CompanyOnboarding } from "./company-onboarding";
import { CompanyTags } from "./company-tags";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function mesmoDia(a: Date | string | null | undefined, b: Date): boolean {
  if (!a) return false;
  const da = new Date(a);
  if (Number.isNaN(da.getTime())) return false;
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  return key(da) === key(b);
}

export default async function EmpresaDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;

  // A lista já filtra por escopo, mas a URL é adivinhável: sem esta checagem um
  // admin restrito abre /admin/clientes/<id> de empresa fora do seu escopo.
  // notFound() (e não 403) para não confirmar a existência do id.
  const scoped = await requireSupportScope(admin.id, id);
  if (!scoped) notFound();

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

  // Sprint 2.2 — ActivityLog, Onboarding, Tags
  const activityLogs = await prisma.activityLog.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const onboardingChecklist = await prisma.onboardingChecklist.findUnique({
    where: { companyId: id },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  const companyTags = await prisma.companyTag.findMany({
    where: { companyId: id },
    include: { tag: true },
    orderBy: { createdAt: "asc" },
  });

  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="p-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/clientes" aria-label="Voltar para lista de clientes" className="p-2 rounded-lg bg-muted hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">{company.name}</h1>
              {company.isBlocked && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                  Bloqueado
                </span>
              )}
              {company.healthScore && company.healthCategory && (
                <HealthBadge score={company.healthScore} category={company.healthCategory} size="md" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">{company.email ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NovaCobrancaButton companyId={company.id} />
          <CompanyActions
            companyId={company.id}
            companyName={company.name}
            isBlocked={company.isBlocked}
            subscriptionStatus={currentSubscription?.status ?? null}
            billingCycle={currentSubscription?.billingCycle ?? null}
            currentPlanId={currentSubscription?.planId ?? null}
          />
        </div>
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
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Health Score Detalhado</h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <ScoreBar label="Usage" score={latestHealthScore.usageScore} />
                    <ScoreBar label="Billing" score={latestHealthScore.billingScore} />
                    <ScoreBar label="Engagement" score={latestHealthScore.engagementScore} />
                    <ScoreBar label="Support" score={latestHealthScore.supportScore} />
                  </div>

                  {latestHealthScore.riskFactors && Array.isArray(latestHealthScore.riskFactors) && (latestHealthScore.riskFactors as string[]).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-destructive mb-2">⚠️ Fatores de Risco:</p>
                      <ul className="space-y-1">
                        {(latestHealthScore.riskFactors as string[]).map((risk, i) => (
                          <li key={i} className="text-xs text-muted-foreground pl-4">• {risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestHealthScore.opportunities && Array.isArray(latestHealthScore.opportunities) && (latestHealthScore.opportunities as string[]).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-info mb-2">💡 Oportunidades:</p>
                      <ul className="space-y-1">
                        {(latestHealthScore.opportunities as string[]).map((opp, i) => (
                          <li key={i} className="text-xs text-muted-foreground pl-4">• {opp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-3">
                    Calculado em {new Date(latestHealthScore.calculatedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              )}

              {/* Informações gerais */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Informações Gerais</h2>
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

              {/* Onboarding Checklist */}
              <CompanyOnboarding checklist={onboardingChecklist} />

              {/* Usuários */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Usuários ({company.users.length})</h2>
                </div>
                {company.users.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum usuário</p>
                ) : (
                  <div className="divide-y divide-border">
                    {company.users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{u.role}</span>
                          {!u.active && <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">Inativo</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filiais */}
              {company.branches.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">Filiais ({company.branches.length})</h2>
                  </div>
                  <div className="divide-y divide-border">
                    {company.branches.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.name}</p>
                          {b.city && <p className="text-xs text-muted-foreground">{b.city}, {b.state}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline de Atividades */}
              <CompanyTimeline logs={activityLogs} />
            </div>

            {/* Coluna lateral */}
            <div className="space-y-5">
              {/* Assinatura Resumo */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Assinatura Atual</h2>
                {currentSubscription ? (
                  <div className="space-y-2.5">
                    <SubRow label="Plano" value={currentSubscription.plan.name} />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <AdminStatusBadge kind="subscription" status={currentSubscription.status} />
                    </div>
                    <SubRow label="Ciclo" value={currentSubscription.billingCycle === "YEARLY" ? "Anual" : "Mensal"} />
                    {currentSubscription.trialEndsAt && (
                      <SubRow label="Trial expira" value={new Date(currentSubscription.trialEndsAt).toLocaleDateString("pt-BR")} />
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Sem assinatura ativa</p>
                  </div>
                )}
              </div>

              {/* Tags */}
              <CompanyTags
                companyId={id}
                initialTags={companyTags}
                availableTags={allTags}
              />

              {/* Últimas Faturas (resumo) */}
              {invoices.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">Últimas 3 Faturas</h2>
                  </div>
                  <div className="divide-y divide-border">
                    {invoices.slice(0, 3).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-xs font-mono text-foreground">{inv.number}</p>
                          <p className="text-xs text-muted-foreground">{new Date(inv.issuedAt).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">
                            R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                          <AdminStatusBadge kind="invoice" status={inv.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabPanel>

        {/* TAB: DADOS DA EMPRESA */}
        <TabPanel tabId="dados">
          <CompanyDataForm
            company={{
              id: company.id,
              name: company.name,
              tradeName: company.tradeName,
              cnpj: company.cnpj,
              email: company.email,
              phone: company.phone,
              address: company.address,
              city: company.city,
              state: company.state,
              zipCode: company.zipCode,
              website: company.website,
              createdAt: company.createdAt.toISOString(),
            }}
          />
        </TabPanel>

        {/* TAB: ASSINATURA */}
        <TabPanel tabId="assinatura">
          <div className="space-y-5">
            {currentSubscription ? (
              <>
                {/* Detalhes da Assinatura */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-5">Detalhes da Assinatura</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="ID" value={currentSubscription.id} />
                    <InfoRow label="Plano" value={currentSubscription.plan.name} />
                    <InfoRow label="Status" value={adminStatusLabel("subscription", currentSubscription.status)} />
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
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h2 className="text-sm font-semibold text-foreground">Histórico de Alterações</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {subscriptionHistory.map((hist) => (
                        <div key={hist.id} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground">
                              {hist.action === "created" && "Criada"}
                              {hist.action === "upgraded" && "Upgrade"}
                              {hist.action === "downgraded" && "Downgrade"}
                              {hist.action === "canceled" && "Cancelada"}
                              {hist.action === "reactivated" && "Reativada"}
                              {hist.action === "extended_trial" && "Trial Estendido"}
                              {hist.action === "billing_cycle_changed" && "Ciclo Alterado"}
                              {!["created", "upgraded", "downgraded", "canceled", "reactivated", "extended_trial", "billing_cycle_changed"].includes(hist.action) && hist.action}
                            </span>
                            <span className="text-xs text-muted-foreground">{new Date(hist.createdAt).toLocaleString("pt-BR")}</span>
                          </div>
                          {hist.reason && <p className="text-xs text-muted-foreground">{hist.reason}</p>}
                          <p className="text-xs text-muted-foreground">Por: {hist.adminName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Esta empresa não possui assinatura ativa</p>
              </div>
            )}
          </div>
        </TabPanel>

        {/* TAB: FILIAIS */}
        <TabPanel tabId="filiais">
          <CompanyBranches
            companyId={id}
            maxBranches={currentSubscription?.plan?.maxBranches ?? company.maxBranches}
          />
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
            <div className="rounded-xl border border-border bg-card">
              <EmptyState icon={DollarSign} message="Nenhuma fatura encontrada" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <ResponsiveTable minWidth={880}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo Pgto</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-foreground">{inv.number}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(inv.issuedAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        R$ {(inv.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <AdminStatusBadge kind="invoice" status={inv.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {inv.billingType || "—"}
                      </TableCell>
                      <TableCell>
                        <ResendChargeButton
                          invoiceId={inv.id}
                          invoiceSent={inv.invoiceSent}
                          invoiceSentAt={inv.invoiceSentAt ? inv.invoiceSentAt.toISOString() : null}
                          sentToday={mesmoDia(inv.invoiceSentAt, new Date())}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </ResponsiveTable>
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
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum snapshot de uso registrado</p>
              <p className="text-xs text-muted-foreground mt-1">Snapshots são gerados automaticamente pelo sistema</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usageSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      {new Date(snapshot.date).toLocaleDateString("pt-BR")}
                    </h3>
                    {snapshot.lastLoginAt && (
                      <span className="text-xs text-muted-foreground">
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

        {/* TAB: REDE */}
        <TabPanel tabId="rede">
          <CompanyNetwork companyId={id} networkId={company.networkId} />
        </TabPanel>

        {/* TAB: IA */}
        <TabPanel tabId="ia">
          <CompanyAiPanel companyId={id} />
          <div className="mt-6">
            <CompanyWhatsappPanel companyId={id} />
          </div>
        </TabPanel>
      </CompanyTabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <Icon className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  // Tom semântico via token (theme-aware), não cor hardcoded.
  const getColor = (s: number) => {
    if (s >= 80) return "bg-success";
    if (s >= 60) return "bg-info";
    if (s >= 40) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">{score}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div className={`h-2 rounded-full ${getColor(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function UsageMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
