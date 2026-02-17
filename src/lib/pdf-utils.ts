import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Company, Customer, Sale, AccountReceivable } from "@prisma/client";

interface CarneData {
  sale: Sale & {
    customer: Customer;
    items: Array<{ product: { name: string }; qty: number; unitPrice: number }>;
  };
  company: Company;
  installments: AccountReceivable[];
  logoUrl?: string;
}

/**
 * Gera PDF do carnê de pagamento com blocos destacáveis por parcela
 *
 * @param data - Dados da venda, empresa e parcelas
 * @returns Buffer do PDF gerado
 */
export function generateCarnePDF(data: CarneData): Buffer {
  const { sale, company, installments } = data;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const blockWidth = pageWidth - margin * 2;
  const blockHeight = 68; // altura de cada bloco de parcela
  const cutLineGap = 8;   // espaço total para linha de corte entre blocos

  let y = margin;

  for (let i = 0; i < installments.length; i++) {
    const inst = installments[i];
    const parcelaNum = inst.installmentNumber || i + 1;
    const totalParcelas = inst.totalInstallments || installments.length;
    const isPaid = inst.status === "RECEIVED";

    // Nova página se não cabe mais um bloco
    if (y + blockHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    // ── Borda do bloco ──
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.rect(margin, y, blockWidth, blockHeight);

    // ── Cabeçalho do bloco (fundo cinza) ──
    doc.setFillColor(235, 235, 235);
    doc.rect(margin, y, blockWidth, 11, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(company.name, margin + 4, y + 7.5);

    // Número da parcela (destaque no canto direito)
    doc.setFontSize(12);
    const parcelaLabel = `PARCELA ${parcelaNum}/${totalParcelas}`;
    doc.text(parcelaLabel, pageWidth - margin - 4, y + 7.5, { align: "right" });

    // ── Linha divisória abaixo do cabeçalho ──
    doc.setLineWidth(0.2);
    doc.setDrawColor(160);
    doc.line(margin, y + 11, margin + blockWidth, y + 11);

    // ── Dados do cliente e venda ──
    let ly = y + 17;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);

    doc.text(`Cliente: ${sale.customer.name}`, margin + 4, ly);
    if (sale.customer.cpf) {
      doc.text(`CPF: ${sale.customer.cpf}`, margin + 4, ly + 5);
      ly += 5;
    }
    doc.text(`Venda: #${sale.id.substring(0, 8).toUpperCase()}`, margin + 4, ly + 5);
    doc.text(
      `Emissão: ${format(new Date(sale.createdAt), "dd/MM/yyyy", { locale: ptBR })}`,
      margin + 4,
      ly + 10
    );

    // ── Linha divisória antes dos valores ──
    const divY = ly + 14;
    doc.setDrawColor(180);
    doc.line(margin + 4, divY, margin + blockWidth - 4, divY);

    // ── Vencimento e Valor em destaque ──
    const valY = divY + 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("VENCIMENTO:", margin + 4, valY);
    doc.text(
      format(new Date(inst.dueDate), "dd/MM/yyyy", { locale: ptBR }),
      margin + 38, valY
    );

    doc.text("VALOR:", pageWidth / 2 + 2, valY);
    doc.setFontSize(13);
    doc.text(
      `R$ ${Number(inst.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      pageWidth / 2 + 18, valY
    );

    // Carimbo "PAGO" se já pago
    if (isPaid) {
      doc.setDrawColor(0, 140, 0);
      doc.setLineWidth(0.6);
      doc.roundedRect(pageWidth - margin - 22, valY - 6, 18, 9, 1, 1, "S");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 130, 0);
      doc.text("PAGO", pageWidth - margin - 13, valY - 0.5, { align: "center" });
      doc.setTextColor(0);
      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
    }

    // ── Área de assinatura ──
    const sigY = y + blockHeight - 10;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text("Assinatura/Carimbo:", margin + 4, sigY);
    doc.setDrawColor(120);
    doc.line(margin + 36, sigY, margin + 110, sigY);
    doc.text("Data Pgto: ___/___/______", pageWidth - margin - 52, sigY);
    doc.setTextColor(0);

    // ── Linha de corte (exceto após a última parcela) ──
    if (i < installments.length - 1) {
      const cutY = y + blockHeight + cutLineGap / 2;
      doc.setDrawColor(130);
      doc.setLineWidth(0.3);

      // Linha tracejada manual (jsPDF não tem setLineDashPattern no tipado)
      const dashLen = 2;
      const gapLen = 2;
      const lineStart = margin + 6;
      const lineEnd = pageWidth - margin - 6;
      let x = lineStart;
      while (x < lineEnd) {
        const segEnd = Math.min(x + dashLen, lineEnd);
        doc.line(x, cutY, segEnd, cutY);
        x += dashLen + gapLen;
      }

      // Símbolo de tesoura nas pontas
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text("\u2702", margin, cutY + 1.5);
      doc.text("\u2702", pageWidth - margin - 3, cutY + 1.5, { align: "right" });
      doc.setTextColor(0);

      y = y + blockHeight + cutLineGap;
    } else {
      y = y + blockHeight + margin;
    }
  }

  // ── Rodapé na última página ──
  const pageCount = (doc.internal as any).pages.length - 1;
  doc.setPage(pageCount);
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120);
  doc.text(
    "Guarde este carnê. Destaque cada parcela ao efetuar o pagamento.",
    pageWidth / 2,
    pageHeight - 4,
    { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
