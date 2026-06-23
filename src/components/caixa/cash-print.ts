import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import type { MovRow } from "@/components/caixa/movimentacoes-table";
import type { SalesByMethodEntry } from "@/components/caixa/conferencia-formas";

/**
 * Monta o HTML do relatório de impressão do caixa a partir dos DADOS, com CSS
 * próprio embutido — independente do Tailwind.
 *
 * Rotina 21/06: o relatório saía "totalmente desestruturado" porque a versão
 * antiga copiava o innerHTML (classes Tailwind) para uma janela de impressão
 * sem Tailwind carregado. Aqui o markup usa apenas as classes definidas no
 * <style> abaixo, então a estrutura (grid, tabela, cores) é preservada.
 */

export interface PrintableCashRegister {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  difference: number | null;
  totalSales: number;
  totalExpenses: number;
  openedByUser: { name: string };
  closedByUser?: { name: string } | null;
  branch: { name: string };
}

function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function dt(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** Escapa texto para evitar HTML injection (notas, nomes, etc.). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

function movDescription(m: MovRow): string {
  if (m.kind === "RECEIVABLE") return `Venda #${m.saleNumber} · ${esc(m.sellerName)}`;
  if (m.kind === "VOIDED") return `Venda cancelada #${m.saleNumber} · ${esc(m.sellerName)}`;
  // MOVEMENT
  return esc(m.note || m.type);
}

function movTipoLabel(m: MovRow): string {
  if (m.kind === "RECEIVABLE") return "A receber";
  if (m.kind === "VOIDED") return "Cancelada";
  return esc(m.type);
}

export function buildPrintHtml(
  caixa: PrintableCashRegister,
  transactions: MovRow[],
  salesByMethod: SalesByMethodEntry[]
): string {
  const statusLabel = caixa.status === "CLOSED" ? "Fechado" : "Aberto";

  const movRows =
    transactions.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#666;">Sem movimentações</td></tr>`
      : transactions
          .map((m) => {
            const isOut = m.kind === "MOVEMENT" && m.direction === "OUT";
            const sign = isOut ? "-" : "+";
            const colorClass = m.kind === "VOIDED" ? "red" : isOut ? "red" : "green";
            return `<tr>
              <td>${dt(m.createdAt)}</td>
              <td>${movTipoLabel(m)}</td>
              <td>${movDescription(m)}</td>
              <td class="text-right ${colorClass}">${sign} ${brl(m.amount)}</td>
            </tr>`;
          })
          .join("");

  const conferenciaRows =
    salesByMethod.length === 0
      ? ""
      : `
        <h2>Conferência por forma de pagamento</h2>
        <table>
          <thead><tr><th>Forma</th><th class="text-right">Qtd</th><th class="text-right">Valor</th></tr></thead>
          <tbody>
            ${salesByMethod
              .map(
                (s) => `<tr>
                  <td>${esc(methodLabel(s.method))}</td>
                  <td class="text-right">${s.count}</td>
                  <td class="text-right">${brl(s.amount)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`;

  const fechamentoRows =
    caixa.status === "CLOSED"
      ? `
        <div class="summary-item">
          <div class="summary-label">Saldo Final (contado)</div>
          <div class="summary-value">${caixa.closingBalance !== null ? brl(caixa.closingBalance) : "-"}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Diferença</div>
          <div class="summary-value ${
            caixa.difference !== null && caixa.difference < 0
              ? "red"
              : caixa.difference !== null && caixa.difference > 0
                ? "green"
                : ""
          }">${caixa.difference !== null ? brl(caixa.difference) : "-"}</div>
        </div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório de Caixa</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      .muted { color: #666; font-size: 11px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-top: 8px; }
      .field-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .03em; }
      .field-value { font-weight: 600; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
      th { background: #f5f5f5; font-weight: bold; }
      .text-right { text-align: right; }
      .green { color: #16a34a; } .red { color: #dc2626; }
      .summary { display: flex; gap: 16px; margin: 8px 0; flex-wrap: wrap; }
      .summary-item { background: #f9f9f9; border: 1px solid #e5e5e5; padding: 8px 12px; border-radius: 4px; min-width: 140px; }
      .summary-label { font-size: 10px; color: #666; }
      .summary-value { font-size: 14px; font-weight: bold; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <h1>Relatório de Caixa</h1>
    <div class="muted">${esc(caixa.branch.name)} · ${statusLabel}</div>

    <h2>Informações do Turno</h2>
    <div class="grid">
      <div><div class="field-label">Aberto por</div><div class="field-value">${esc(caixa.openedByUser.name)}</div></div>
      <div><div class="field-label">Fechado por</div><div class="field-value">${esc(caixa.closedByUser?.name || "-")}</div></div>
      <div><div class="field-label">Abertura</div><div class="field-value">${dt(caixa.openedAt)}</div></div>
      <div><div class="field-label">Fechamento</div><div class="field-value">${caixa.closedAt ? dt(caixa.closedAt) : "Caixa aberto"}</div></div>
    </div>

    <h2>Resumo Financeiro</h2>
    <div class="summary">
      <div class="summary-item"><div class="summary-label">Saldo Inicial</div><div class="summary-value">${brl(caixa.openingBalance)}</div></div>
      <div class="summary-item"><div class="summary-label">Total Vendas</div><div class="summary-value green">${brl(caixa.totalSales)}</div></div>
      <div class="summary-item"><div class="summary-label">Total Despesas</div><div class="summary-value red">${brl(caixa.totalExpenses)}</div></div>
      <div class="summary-item"><div class="summary-label">Saldo Esperado</div><div class="summary-value">${caixa.expectedBalance !== null ? brl(caixa.expectedBalance) : "-"}</div></div>
      ${fechamentoRows}
    </div>

    ${conferenciaRows}

    <h2>Movimentações</h2>
    <table>
      <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Descrição</th><th class="text-right">Valor</th></tr></thead>
      <tbody>${movRows}</tbody>
    </table>

    <script>window.onload = function () { window.print(); }</script>
  </body>
</html>`;
}
