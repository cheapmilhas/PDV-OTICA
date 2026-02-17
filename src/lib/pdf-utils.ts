import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
 * Gera PDF do carnê de pagamento
 *
 * @param data - Dados da venda, empresa e parcelas
 * @returns Buffer do PDF gerado
 */
export function generateCarnePDF(data: CarneData): Buffer {
  const { sale, company, installments, logoUrl } = data;
  const doc = new jsPDF();

  // Configurações
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPosition = 20;

  // ========== CABEÇALHO ==========
  // Logo (se existir)
  if (logoUrl && logoUrl.startsWith("data:image")) {
    try {
      const logoWidth = 40;
      const logoHeight = 20;
      const logoX = (pageWidth - logoWidth) / 2;
      const imgType = logoUrl.includes("image/jpeg") || logoUrl.includes("image/jpg") ? "JPEG" : "PNG";
      doc.addImage(logoUrl, imgType, logoX, yPosition, logoWidth, logoHeight);
      yPosition += logoHeight + 5;
    } catch {
      // Se falhar ao adicionar logo, continua sem ela
    }
  }

  // Nome da empresa
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.name, pageWidth / 2, yPosition, { align: "center" });
  yPosition += 8;

  // CNPJ e endereço
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `CNPJ: ${company.cnpj || "Não informado"}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );
  yPosition += 5;
  doc.text(
    `${company.address || ""}, ${company.city || ""} - ${company.state || ""}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );
  yPosition += 5;
  doc.text(
    `Tel: ${company.phone || ""} | Email: ${company.email || ""}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );
  yPosition += 15;

  // Linha divisória
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  // ========== TÍTULO ==========
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("CARNÊ DE PAGAMENTO", pageWidth / 2, yPosition, {
    align: "center",
  });
  yPosition += 10;

  // ========== DADOS DO CLIENTE ==========
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DO CLIENTE", margin, yPosition);
  yPosition += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nome: ${sale.customer.name}`, margin, yPosition);
  yPosition += 5;
  doc.text(
    `CPF: ${sale.customer.cpf || "Não informado"}`,
    margin,
    yPosition
  );
  yPosition += 5;
  doc.text(
    `Telefone: ${sale.customer.phone || "Não informado"}`,
    margin,
    yPosition
  );
  yPosition += 5;
  doc.text(
    `Endereço: ${sale.customer.address || ""}, ${sale.customer.city || ""} - ${sale.customer.state || ""}`,
    margin,
    yPosition
  );
  yPosition += 10;

  // ========== DADOS DA VENDA ==========
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DADOS DA VENDA", margin, yPosition);
  yPosition += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Venda Nº: ${sale.id.substring(0, 8).toUpperCase()}`,
    margin,
    yPosition
  );
  yPosition += 5;
  doc.text(
    `Data: ${format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    margin,
    yPosition
  );
  yPosition += 5;
  doc.text(
    `Valor Total: R$ ${Number(sale.total).toFixed(2)}`,
    margin,
    yPosition
  );
  yPosition += 5;
  doc.text(`Nº de Parcelas: ${installments.length}x`, margin, yPosition);
  yPosition += 12;

  // ========== TABELA DE PARCELAS ==========
  const tableData = installments.map((inst) => [
    `${inst.installmentNumber}/${inst.totalInstallments}`,
    format(new Date(inst.dueDate), "dd/MM/yyyy", { locale: ptBR }),
    `R$ ${Number(inst.amount).toFixed(2)}`,
    inst.status === "RECEIVED" ? "✓ Pago" : "Pendente",
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [["Parcela", "Vencimento", "Valor", "Status"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: 255,
      fontStyle: "bold",
    },
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { halign: "center", cellWidth: 25 },
      1: { halign: "center", cellWidth: 35 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "center", cellWidth: 30 },
    },
  });

  // Posição após tabela
  yPosition = (doc as any).lastAutoTable.finalY + 15;

  // ========== RODAPÉ ==========
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(
    "Este carnê é um comprovante de parcelamento. Guarde-o para controle dos pagamentos.",
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );
  yPosition += 5;
  doc.text(
    `Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );

  // Retornar como Buffer
  return Buffer.from(doc.output("arraybuffer"));
}
