import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Dinheiro",
    CREDIT_CARD: "Cartão de Crédito",
    DEBIT_CARD: "Cartão de Débito",
    PIX: "PIX",
    STORE_CREDIT: "Crediário",
    MIXED: "Misto",
  };
  return labels[method] || method;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const sale = await prisma.sale.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
        payments: true,
        sellerUser: { select: { name: true } },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
    }

    const [company, companySettings] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, address: true, phone: true, cnpj: true },
      }),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: { logoUrl: true, displayName: true },
      }),
    ]);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 15;

    const companyName = companySettings?.displayName || company?.name || "Empresa";

    // ===== CABEÇALHO =====
    if (companySettings?.logoUrl && companySettings.logoUrl.startsWith("data:image")) {
      try {
        const imgType = companySettings.logoUrl.includes("jpeg") || companySettings.logoUrl.includes("jpg") ? "JPEG" : "PNG";
        doc.addImage(companySettings.logoUrl, imgType, 15, y, 40, 18);
      } catch {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, 15, y + 10);
      }
    } else {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 15, y + 10);
    }

    // Info empresa à direita
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const rightX = pageWidth - 15;
    if (company?.address) doc.text(company.address, rightX, y + 5, { align: "right" });
    if (company?.phone) doc.text(company.phone, rightX, y + 10, { align: "right" });
    if (company?.cnpj) doc.text(`CNPJ: ${company.cnpj}`, rightX, y + 15, { align: "right" });

    y += 28;
    doc.setDrawColor(200);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;

    // ===== TÍTULO =====
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROVANTE DE VENDA", pageWidth / 2, y, { align: "center" });
    y += 7;

    const saleNumber = String((sale as any).number || "").padStart(6, "0");
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Venda #${saleNumber}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text(
      format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 12;

    // ===== CLIENTE =====
    doc.setFillColor(245, 245, 245);
    doc.rect(15, y, pageWidth - 30, 24, "F");
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", 20, y);
    y += 5;

    const customerName = sale.customer?.name || (sale as any).customerName || "Não informado";
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${customerName}`, 20, y);
    y += 4;
    if (sale.customer?.cpf) doc.text(`CPF: ${sale.customer.cpf}`, 20, y);
    if (sale.customer?.phone) doc.text(`Fone: ${sale.customer.phone}`, 110, y);
    y += 12;

    // ===== ITENS =====
    const tableBody = sale.items.map((item) => [
      item.product?.name || (item as any).description || "Produto",
      String(item.qty),
      formatCurrency(Number(item.unitPrice)),
      Number(item.discount) > 0 ? formatCurrency(Number(item.discount)) : "-",
      formatCurrency(Number(item.lineTotal)),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Descrição", "Qtd", "Unit.", "Desc.", "Total"]],
      body: tableBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 15, halign: "center" },
        2: { cellWidth: 25, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
      },
      margin: { left: 15, right: 15 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // ===== TOTAIS =====
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", 130, y);
    doc.text(formatCurrency(Number(sale.subtotal)), pageWidth - 15, y, { align: "right" });
    y += 6;

    if (Number(sale.discountTotal) > 0) {
      doc.setTextColor(200, 50, 50);
      doc.text("Desconto:", 130, y);
      doc.text(`- ${formatCurrency(Number(sale.discountTotal))}`, pageWidth - 15, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", 130, y);
    doc.text(formatCurrency(Number(sale.total)), pageWidth - 15, y, { align: "right" });
    y += 12;

    // ===== PAGAMENTOS =====
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("FORMA DE PAGAMENTO", 15, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const payment of sale.payments) {
      const label = getPaymentMethodLabel(payment.method);
      const installments = (payment.installments ?? 0) > 1 ? ` (${payment.installments}x)` : "";
      doc.text(`${label}${installments}: ${formatCurrency(Number(payment.amount))}`, 20, y);
      y += 5;
    }
    y += 3;

    if ((sale as any).sellerUser?.name) {
      doc.text(`Vendedor: ${(sale as any).sellerUser.name}`, 15, y);
    }

    // ===== RODAPÉ =====
    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Obrigado pela preferência!", pageWidth / 2, footerY, { align: "center" });
    doc.text("Este documento não possui valor fiscal.", pageWidth / 2, footerY + 5, { align: "center" });

    const pdfBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="venda-${saleNumber}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
