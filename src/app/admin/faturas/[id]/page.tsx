import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, CheckCircle, Circle, Send, CreditCard, Receipt, FileText } from "lucide-react";
import { InvoiceActions } from "./invoice-actions";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELED: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-800 text-gray-400",
  PENDING: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
  PAID: "bg-green-900/50 text-green-400 border border-green-800",
  OVERDUE: "bg-red-900/50 text-red-400 border border-red-800",
  CANCELED: "bg-gray-800 text-gray-500",
};

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
    <div className="p-6 text-white max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/faturas"
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Fatura #{invoice.number || invoice.id.slice(0, 8)}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[invoice.status]}`}>
              {STATUS_LABELS[invoice.status]}
            </span>
          </div>
          <p className="text-sm text-gray-400">{company.name} • {plan.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workflow de Etapas */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
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
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Observações</h2>
            {invoice.adminNotes ? (
              <p className="text-gray-300">{invoice.adminNotes}</p>
            ) : (
              <p className="text-gray-500 italic">Nenhuma observação</p>
            )}
            <InvoiceActions invoiceId={invoice.id} type="add_note" currentNote={invoice.adminNotes} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Valor */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm text-gray-500 mb-1">Valor</p>
            <p className="text-3xl font-bold text-white">
              R$ {(invoice.total / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            {invoice.discount > 0 && (
              <p className="text-sm text-green-400">
                Desconto: R$ {(invoice.discount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Datas */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Datas</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Criada em:</span>
                <span className="text-white">{new Date(invoice.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vencimento:</span>
                <span className="text-white">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("pt-BR") : "—"}</span>
              </div>
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Pago em:</span>
                  <span className="text-green-400">{new Date(invoice.paidAt).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Empresa */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Empresa</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-white">{company.name}</p>
                <p className="text-xs text-gray-500">{plan.name}</p>
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-gray-400">{company.email}</p>
              <p className="text-gray-400">{company.phone}</p>
            </div>
            <Link
              href={`/admin/empresas/${company.id}`}
              className="mt-3 block text-center text-sm text-indigo-400 hover:text-indigo-300"
            >
              Ver empresa →
            </Link>
          </div>

          {/* Links */}
          {(invoice.paymentUrl || invoice.boletoUrl || invoice.pixCode || invoice.nfUrl) && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Links</h3>
              <div className="space-y-2">
                {invoice.paymentUrl && (
                  <a
                    href={invoice.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Link de pagamento ↗
                  </a>
                )}
                {invoice.boletoUrl && (
                  <a
                    href={invoice.boletoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Boleto PDF ↗
                  </a>
                )}
                {invoice.nfUrl && (
                  <a
                    href={invoice.nfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Nota Fiscal ↗
                  </a>
                )}
              </div>
              {invoice.pixCode && (
                <div className="mt-3 p-2 bg-gray-800 rounded text-xs font-mono break-all text-gray-400">
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
    <div className={`flex gap-4 ${!isLast ? "pb-4 border-b border-gray-800" : ""}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        completed ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500"
      }`}>
        {completed ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${completed ? "text-green-400" : "text-gray-400"}`}>{title}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        {completed && completedAt && (
          <p className="text-xs text-gray-500 mt-1">
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
