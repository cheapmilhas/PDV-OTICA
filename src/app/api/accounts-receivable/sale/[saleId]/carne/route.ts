import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { saleDisplayNumber } from "@/lib/sale-number";
import { companyHeaderHtml } from "@/lib/pdf-header";

/**
 * GET /api/accounts-receivable/sale/[saleId]/carne
 *
 * Gera HTML imprimível do carnê (1 capa + 1 página por parcela).
 * Cliente pode imprimir direto do browser (sem dependência de jsPDF no server,
 * que é pesado e ainda tem CVEs).
 *
 * Returns: text/html
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { saleId } = await params;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: {
        customer: { select: { name: true, cpf: true, phone: true, email: true } },
        company: { select: { name: true, cnpj: true, phone: true } },
        branch: { select: { name: true, address: true, city: true, state: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: { message: "Venda não encontrada" } }, { status: 404 });
    }

    // Logo/identidade vêm de CompanySettings (Company não tem logoUrl).
    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { logoUrl: true, displayName: true, cnpj: true, address: true, phone: true, email: true },
    });
    const displayName = settings?.displayName || sale.company.name;
    const headerHtml = companyHeaderHtml({
      logoUrl: settings?.logoUrl,
      companyName: displayName,
      cnpj: settings?.cnpj || sale.company.cnpj,
      address: settings?.address,
      phone: settings?.phone || sale.company.phone,
      email: settings?.email,
    });
    // Escapa o nome para uso direto em HTML nas páginas por-parcela (anti-XSS).
    const displayNameHtml = displayName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const installments = await prisma.accountReceivable.findMany({
      where: { saleId, companyId },
      orderBy: [{ installmentNumber: "asc" }, { dueDate: "asc" }],
    });

    if (installments.length === 0) {
      return NextResponse.json(
        { error: { message: "Venda não possui parcelas a receber" } },
        { status: 400 },
      );
    }

    const formatBRL = (v: number | string) =>
      `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatDate = (d: Date) =>
      new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const totalAmount = installments.reduce((s, i) => s + Number(i.amount), 0);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Carnê — Venda ${saleDisplayNumber(sale)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1a1a; font-size: 13px; }
  .page { page-break-after: always; padding: 12mm; }
  .page:last-child { page-break-after: auto; }
  h1 { margin: 0 0 8px; font-size: 18px; }
  .header { border-bottom: 2px solid #6366f1; padding-bottom: 8px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { font-weight: 600; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  th { background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #374151; }
  .parcela-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin-top: 20px; }
  .parcela-num { font-size: 32px; font-weight: 700; color: #6366f1; }
  .parcela-valor { font-size: 24px; font-weight: 700; }
  .barra { background: #6366f1; color: white; padding: 8px 12px; border-radius: 4px; font-weight: 600; }
  .small { font-size: 10px; color: #6b7280; }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>

<!-- CAPA -->
<div class="page">
  ${headerHtml}
  <div class="header">
    <h1>Carnê de Pagamento</h1>
  </div>

  <div class="grid">
    <div>
      <div class="label">Cliente</div>
      <div class="value">${sale.customer?.name ?? "—"}</div>
      ${sale.customer?.cpf ? `<div class="small">CPF ${sale.customer.cpf}</div>` : ""}
      ${sale.customer?.phone ? `<div class="small">${sale.customer.phone}</div>` : ""}
    </div>
    <div>
      <div class="label">Venda</div>
      <div class="value">${saleDisplayNumber(sale)}</div>
      <div class="small">Filial: ${sale.branch.name}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Parcela</th>
        <th>Vencimento</th>
        <th style="text-align:right">Valor</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${installments
        .map(
          (inst) => `
        <tr>
          <td>${inst.installmentNumber}/${inst.totalInstallments}</td>
          <td>${formatDate(inst.dueDate)}</td>
          <td style="text-align:right">${formatBRL(Number(inst.amount))}</td>
          <td>${inst.status}</td>
        </tr>`,
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="text-align:right; font-weight:600">Total</td>
        <td style="text-align:right; font-weight:700">${formatBRL(totalAmount)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <p class="small" style="margin-top:24px">
    Em caso de atraso, multa de ${Number(installments[0].finePercent ?? 0)}% e juros de
    ${Number(installments[0].interestPercent ?? 0)}% ao mês sobre o valor da parcela,
    após carência de ${installments[0].graceDays ?? 0} dias.
  </p>
</div>

<!-- 1 PÁGINA POR PARCELA -->
${installments
  .map(
    (inst) => `
  <div class="page">
    <div class="header">
      <h1>${displayNameHtml}</h1>
      <div class="small">Comprovante de Parcela</div>
    </div>

    <div class="parcela-card">
      <div class="grid">
        <div>
          <div class="label">Parcela</div>
          <div class="parcela-num">${inst.installmentNumber}/${inst.totalInstallments}</div>
        </div>
        <div style="text-align:right">
          <div class="label">Valor</div>
          <div class="parcela-valor">${formatBRL(Number(inst.amount))}</div>
        </div>
      </div>

      <div style="margin-top:16px" class="grid">
        <div>
          <div class="label">Vencimento</div>
          <div class="value">${formatDate(inst.dueDate)}</div>
        </div>
        <div>
          <div class="label">Cliente</div>
          <div class="value">${sale.customer?.name ?? "—"}</div>
        </div>
      </div>

      <div style="margin-top:16px">
        <div class="barra">Venda ${saleDisplayNumber(sale)} — Parcela ${inst.installmentNumber}/${inst.totalInstallments}</div>
      </div>

      <p class="small" style="margin-top:16px">
        Após o vencimento: multa ${Number(inst.finePercent ?? 0)}% + juros ${Number(inst.interestPercent ?? 0)}% a.m.
        Carência: ${inst.graceDays ?? 0} dias.
      </p>
    </div>
  </div>
`,
  )
  .join("")}

<script>
  // Auto-print quando aberto pelo botão
  if (window.location.search.includes("print=1")) {
    window.print();
  }
</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
