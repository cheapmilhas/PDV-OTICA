import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, CheckCircle, Send, CreditCard, Receipt, FileText } from "lucide-react";
import { InvoiceActions } from "./invoice-actions";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          company: true,
          plan: true,
        },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const company = invoice.subscription.company;
  const plan = invoice.subscription.plan;

  return (
    <div className="p-6 text-foreground max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/financeiro/faturas"
          className="p-2 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Fatura #{invoice.number || invoice.id.slice(0, 8)}</h1>
            <AdminStatusBadge kind="invoice" status={invoice.status} />
          </div>
          <p className="text-sm text-muted-foreground">{company.name} • {plan.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workflow de Etapas */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Workflow de Cobrança</h2>

            <div className="space-y-4">
              {/* Etapa 1: Cobrança Gerada */}
              <WorkflowStep
                icon={FileText}
                title="Cobrança Gerada"
                completed={invoice.invoiceGenerated}
                completedAt={invoice.invoiceGeneratedAt}
                completedBy={invoice.invoiceGeneratedBy}
              />

              {/* Etapa 2: Enviado ao Cliente */}
              <WorkflowStep
                icon={Send}
                title="Enviado ao Cliente"
                subtitle={invoice.invoiceSentMethod ? `Via ${invoice.invoiceSentMethod}` : undefined}
                completed={invoice.invoiceSent}
                completedAt={invoice.invoiceSentAt}
                completedBy={invoice.invoiceSentBy}
                actionId="mark_sent"
                invoiceId={invoice.id}
                showAction={invoice.invoiceGenerated && !invoice.invoiceSent}
              />

              {/* Etapa 3: Pagamento Confirmado */}
              <WorkflowStep
                icon={CreditCard}
                title="Pagamento Confirmado"
                completed={invoice.paymentConfirmed}
                completedAt={invoice.paymentConfirmedAt}
                completedBy={invoice.paymentConfirmedBy}
                actionId="mark_paid"
                invoiceId={invoice.id}
                showAction={invoice.invoiceSent && !invoice.paymentConfirmed}
              />

              {/* Etapa 4: NF Gerada */}
              <WorkflowStep
                icon={Receipt}
                title="Nota Fiscal Gerada"
                subtitle={invoice.nfNumber ? `NF ${invoice.nfNumber}` : undefined}
                completed={invoice.nfGenerated}
                completedAt={invoice.nfGeneratedAt}
                completedBy={invoice.nfGeneratedBy}
                actionId="mark_nf_generated"
                invoiceId={invoice.id}
                showAction={invoice.paymentConfirmed && !invoice.nfGenerated}
              />

              {/* Etapa 5: NF Enviada */}
              <WorkflowStep
                icon={Send}
                title="Nota Fiscal Enviada"
                completed={invoice.nfSent}
                completedAt={invoice.nfSentAt}
                completedBy={invoice.nfSentBy}
                actionId="mark_nf_sent"
                invoiceId={invoice.id}
                showAction={invoice.nfGenerated && !invoice.nfSent}
                isLast
              />
            </div>
          </div>

          {/* Notas */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Observações</h2>
            {invoice.adminNotes ? (
              <p className="text-foreground">{invoice.adminNotes}</p>
            ) : (
              <p className="text-muted-foreground italic">Nenhuma observação</p>
            )}
            <InvoiceActions invoiceId={invoice.id} type="add_note" currentNote={invoice.adminNotes} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Valor */}
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground mb-1">Valor</p>
            <p className="text-3xl font-bold text-foreground">
              R$ {(invoice.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            {invoice.discount > 0 && (
              <p className="text-sm text-emerald-600">
                Desconto: R$ {(invoice.discount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Datas */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Datas</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criada em:</span>
                <span className="text-foreground">{new Date(invoice.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencimento:</span>
                <span className="text-foreground">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("pt-BR") : "—"}</span>
              </div>
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pago em:</span>
                  <span className="text-emerald-600">{new Date(invoice.paidAt).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Empresa */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Empresa</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-foreground">{company.name}</p>
                <p className="text-xs text-muted-foreground">{plan.name}</p>
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">{company.email}</p>
              <p className="text-muted-foreground">{company.phone}</p>
            </div>
            <Link
              href={`/admin/clientes/${company.id}`}
              className="mt-3 block text-center text-sm text-primary hover:text-primary"
            >
              Ver empresa →
            </Link>
          </div>

          {/* Links */}
          {(invoice.paymentUrl || invoice.boletoUrl || invoice.pixCode || invoice.nfUrl) && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Links</h3>
              <div className="space-y-2">
                {invoice.paymentUrl && (
                  <a
                    href={invoice.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-primary hover:text-primary"
                  >
                    Link de pagamento ↗
                  </a>
                )}
                {invoice.boletoUrl && (
                  <a
                    href={invoice.boletoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-primary hover:text-primary"
                  >
                    Boleto PDF ↗
                  </a>
                )}
                {invoice.nfUrl && (
                  <a
                    href={invoice.nfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-primary hover:text-primary"
                  >
                    Nota Fiscal ↗
                  </a>
                )}
              </div>
              {invoice.pixCode && (
                <div className="mt-3 p-2 bg-muted rounded text-xs font-mono break-all text-muted-foreground">
                  PIX: {invoice.pixCode.slice(0, 30)}...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente de etapa do workflow
function WorkflowStep({
  icon: Icon,
  title,
  subtitle,
  completed,
  completedAt,
  completedBy,
  actionId,
  invoiceId,
  showAction,
  isLast,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  completed: boolean;
  completedAt?: Date | null;
  completedBy?: string | null;
  actionId?: string;
  invoiceId?: string;
  showAction?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className={`flex gap-4 ${!isLast ? "pb-4 border-b border-border" : ""}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        completed ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground"
      }`}>
        {completed ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${completed ? "text-emerald-600" : "text-muted-foreground"}`}>{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {completed && completedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(completedAt).toLocaleString("pt-BR")}
            {completedBy && ` • por ${completedBy}`}
          </p>
        )}
        {showAction && actionId && invoiceId && (
          <InvoiceActions invoiceId={invoiceId} type={actionId} />
        )}
      </div>
    </div>
  );
}
