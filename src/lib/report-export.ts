"use client";

import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

interface PDFColumn {
  header: string;
  key: string;
  format?: "currency" | "percent" | "number" | "text";
  width?: number;
}

interface PDFExportOptions {
  title: string;
  subtitle?: string;
  period?: { start: Date; end: Date };
  sections: Array<{
    title: string;
    columns: PDFColumn[];
    data: Record<string, any>[];
  }>;
}

interface ExcelExportOptions {
  fileName: string;
  sheets: Array<{
    name: string;
    data: any[][];
  }>;
}

function formatValue(value: any, fmt?: string): string {
  if (value == null) return "N/A";
  if (fmt === "currency") return formatCurrency(Number(value));
  if (fmt === "percent") return `${Number(value).toFixed(1)}%`;
  if (fmt === "number") return Number(value).toLocaleString("pt-BR");
  return String(value);
}

export async function exportToPDF(options: PDFExportOptions) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.text(options.title, pageWidth / 2, 18, { align: "center" });

  if (options.subtitle) {
    doc.setFontSize(10);
    doc.text(options.subtitle, pageWidth / 2, 25, { align: "center" });
  }

  if (options.period) {
    doc.setFontSize(9);
    doc.text(
      `Período: ${format(options.period.start, "dd/MM/yyyy")} a ${format(options.period.end, "dd/MM/yyyy")}`,
      pageWidth / 2,
      options.subtitle ? 31 : 25,
      { align: "center" }
    );
  }

  let startY = options.period ? (options.subtitle ? 38 : 32) : (options.subtitle ? 32 : 25);

  // Sections
  for (const section of options.sections) {
    if (startY > 260) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(11);
    doc.text(section.title, 14, startY);

    autoTable(doc, {
      startY: startY + 4,
      head: [section.columns.map((c) => c.header)],
      body: section.data.map((row) =>
        section.columns.map((c) => formatValue(row[c.key], c.format))
      ),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
    });

    startY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const dateStr = options.period
    ? format(options.period.start, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");
  const fileName = `${options.title.toLowerCase().replace(/\s+/g, "-")}-${dateStr}.pdf`;
  doc.save(fileName);
}

export async function exportToExcel(options: ExcelExportOptions) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const sheet of options.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(wb, options.fileName);
}
