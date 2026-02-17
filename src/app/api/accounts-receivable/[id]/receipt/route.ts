import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function getPaymentMethodLabel(method?: string): string {
  const labels: Record<string, string> = {
    CASH: "Dinheiro",
    CREDIT_CARD: "Cartão de Crédito",
    DEBIT_CARD: "Cartão de Débito",
    PIX: "PIX",
    BANK_TRANSFER: "Transferência",
    BANK_SLIP: "Boleto",
  };
  return labels[method || ""] || method || "Não informado";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const receivable = await prisma.accountReceivable.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { name: true, cpf: true } },
        sale: { select: { id: true } },
        receivedBy: { select: { name: true } },
      },
    });

    if (!receivable) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    if (receivable.status !== "RECEIVED") {
      return NextResponse.json({ error: "Esta conta ainda não foi recebida" }, { status: 400 });
    }

    const [company, companySettings] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, phone: true, cnpj: true },
      }),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: { logoUrl: true, displayName: true },
      }),
    ]);

    const companyName = companySettings?.displayName || company?.name || "Empresa";
    const logoUrl = companySettings?.logoUrl;
    const paidAmount = Number(receivable.receivedAmount || receivable.amount);
    const receiptNumber = `${id.substring(0, 8).toUpperCase()}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo de Pagamento</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; max-width: 420px; margin: 0 auto; color: #333; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
    .logo { max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; }
    .company-name { font-size: 18px; font-weight: bold; margin-bottom: 2px; }
    .company-info { font-size: 10px; color: #666; }
    .title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin-top: 8px; letter-spacing: 1px; }
    .receipt-number { font-size: 10px; color: #888; margin-top: 2px; }
    .section { margin: 12px 0; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
    .label { color: #666; }
    .value { font-weight: 500; }
    .amount-box { background: #f0f9f0; border: 2px solid #4caf50; border-radius: 6px; padding: 16px; text-align: center; margin: 16px 0; }
    .amount-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .amount-value { font-size: 28px; font-weight: bold; color: #2e7d32; margin-top: 4px; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #999; border-top: 1px dashed #ccc; padding-top: 12px; }
    .signature-area { margin-top: 30px; display: flex; justify-content: space-around; }
    .signature-line { text-align: center; width: 160px; }
    .signature-line hr { border: none; border-top: 1px solid #333; margin-bottom: 4px; }
    .signature-label { font-size: 10px; color: #666; }
    @media print {
      body { padding: 5px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ""}
    <div class="company-name">${companyName}</div>
    ${company?.cnpj ? `<div class="company-info">CNPJ: ${company.cnpj}</div>` : ""}
    ${company?.phone ? `<div class="company-info">Tel: ${company.phone}</div>` : ""}
    <div class="title">Recibo de Pagamento</div>
    <div class="receipt-number">Nº ${receiptNumber}</div>
  </div>

  <div class="section">
    <div class="row">
      <span class="label">Data:</span>
      <span class="value">${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
    </div>
    <div class="row">
      <span class="label">Cliente:</span>
      <span class="value">${receivable.customer?.name || receivable.description}</span>
    </div>
    ${receivable.customer?.cpf ? `
    <div class="row">
      <span class="label">CPF:</span>
      <span class="value">${receivable.customer.cpf}</span>
    </div>` : ""}
    ${receivable.sale?.id ? `
    <div class="row">
      <span class="label">Ref. Venda:</span>
      <span class="value">${receivable.sale.id.substring(0, 8).toUpperCase()}</span>
    </div>` : ""}
    <div class="row">
      <span class="label">Descrição:</span>
      <span class="value">${receivable.description}</span>
    </div>
    <div class="row">
      <span class="label">Parcela:</span>
      <span class="value">${receivable.installmentNumber} / ${receivable.totalInstallments}</span>
    </div>
    <div class="row">
      <span class="label">Vencimento:</span>
      <span class="value">${format(receivable.dueDate, "dd/MM/yyyy", { locale: ptBR })}</span>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-label">Valor Pago</div>
    <div class="amount-value">R$ ${paidAmount.toFixed(2).replace(".", ",")}</div>
  </div>

  <div class="section">
    <div class="row">
      <span class="label">Recebido por:</span>
      <span class="value">${receivable.receivedBy?.name || "-"}</span>
    </div>
    <div class="row">
      <span class="label">Data Pagamento:</span>
      <span class="value">${receivable.receivedDate ? format(receivable.receivedDate, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}</span>
    </div>
  </div>

  <div class="signature-area">
    <div class="signature-line">
      <hr />
      <div class="signature-label">Assinatura do Cliente</div>
    </div>
    <div class="signature-line">
      <hr />
      <div class="signature-label">Assinatura do Operador</div>
    </div>
  </div>

  <div class="footer">
    <p>${companyName} — Este recibo comprova o pagamento da parcela indicada.</p>
    <p style="margin-top:4px;">Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
