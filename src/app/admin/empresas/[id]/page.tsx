import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, MapPin, Users, ShoppingCart, Package } from "lucide-react";
import { CompanyActions } from "./company-actions";

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
    ? await prisma.invoice.findMany({ where: { subscriptionId: currentSubscription.id }, orderBy: { issuedAt: "desc" }, take: 5 })
    : [];

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/empresas" className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white">
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
            </div>
            <p className="text-sm text-gray-400">{company.email ?? "—"}</p>
          </div>
        </div>
        <CompanyActions
          companyId={company.id}
          companyName={company.name}
          isBlocked={company.isBlocked}
          subscriptionStatus={currentSubscription?.status ?? null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">
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
          {/* Assinatura */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Assinatura</h2>
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
                {currentSubscription.currentPeriodEnd && (
                  <SubRow label="Próx. cobrança" value={new Date(currentSubscription.currentPeriodEnd).toLocaleDateString("pt-BR")} />
                )}
                {currentSubscription.discountPercent && (
                  <SubRow label="Desconto" value={`${currentSubscription.discountPercent}%`} />
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Building2 className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Sem assinatura ativa</p>
              </div>
            )}
          </div>

          {/* Faturas */}
          {invoices.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Últimas Faturas</h2>
              </div>
              <div className="divide-y divide-gray-800/50">
                {invoices.map((inv) => (
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
