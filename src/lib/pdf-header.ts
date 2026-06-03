import type jsPDF from "jspdf";

/**
 * Fonte única de cabeçalho de empresa para TODOS os documentos (PDV Ótica).
 *
 * Três renderizadores compartilham os mesmos dados:
 *  - `drawPdfHeader`  → jsPDF (PDFs gerados com a lib jspdf)
 *  - `companyHeaderHtml` → string HTML (geradores que montam HTML e imprimem)
 *  - React `<PrintHeader>` (src/components/print/print-header.tsx) para páginas
 *    client. NÃO importável aqui (este módulo é agnóstico de framework).
 *
 * Guard de logo: só aceitamos data-URL PNG/JPEG. WEBP (e qualquer outro) cai no
 * fallback de texto — addImage do jsPDF lança em formato não suportado e
 * derrubaria o documento (500) sem o try/catch.
 */
export interface CompanyHeaderData {
  logoUrl?: string | null;
  companyName: string;
  cnpj?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Aceita apenas data:image/png|jpg|jpeg (o que o jsPDF.addImage suporta com segurança). */
export function isSafePdfLogo(logoUrl?: string | null): logoUrl is string {
  if (!logoUrl) return false;
  return /^data:image\/(png|jpe?g)/i.test(logoUrl);
}

/**
 * Desenha o cabeçalho no topo de um documento jsPDF e retorna o `y` logo abaixo
 * da linha divisória (onde o conteúdo deve começar).
 *
 * Layout: logo (ou nome em negrito) à esquerda; endereço/telefone/CNPJ à direita;
 * linha divisória. Espelha o padrão defensivo de src/app/api/sales/[id]/pdf/route.ts.
 */
export function drawPdfHeader(
  doc: jsPDF,
  data: CompanyHeaderData,
  startY = 15
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const y = startY;
  const name = data.companyName || "Empresa";

  // ── Esquerda: logo ou nome ──
  if (isSafePdfLogo(data.logoUrl)) {
    try {
      const imgType =
        data.logoUrl.includes("jpeg") || data.logoUrl.includes("jpg")
          ? "JPEG"
          : "PNG";
      doc.addImage(data.logoUrl, imgType, 15, y, 40, 18);
    } catch {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(name, 15, y + 10);
    }
  } else {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(name, 15, y + 10);
  }

  // ── Direita: dados da empresa ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const rightX = pageWidth - 15;
  let infoY = y + 5;
  if (data.address) {
    doc.text(data.address, rightX, infoY, { align: "right" });
    infoY += 5;
  }
  if (data.phone) {
    doc.text(data.phone, rightX, infoY, { align: "right" });
    infoY += 5;
  }
  if (data.cnpj) {
    doc.text(`CNPJ: ${data.cnpj}`, rightX, infoY, { align: "right" });
    infoY += 5;
  }
  if (data.email) {
    doc.text(data.email, rightX, infoY, { align: "right" });
  }

  // ── Linha divisória ──
  const lineY = y + 28;
  doc.setDrawColor(200);
  doc.line(15, lineY, pageWidth - 15, lineY);

  return lineY + 10;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Cabeçalho como string HTML, para geradores que montam HTML e imprimem.
 * Mesmo guard de logo: aceita qualquer `data:image/*` (o navegador renderiza
 * WEBP normalmente em <img>, então aqui o guard é só "é data-URL de imagem").
 */
export function companyHeaderHtml(data: CompanyHeaderData): string {
  const name = escapeHtml(data.companyName || "Empresa");
  const isImg = !!data.logoUrl && /^data:image\//i.test(data.logoUrl);

  const left = isImg
    ? `<img src="${data.logoUrl}" alt="${name}" style="max-width:160px;max-height:64px;object-fit:contain;object-position:left" />`
    : `<div style="font-size:22px;font-weight:700;color:#374151">${name}</div>`;

  const info: string[] = [`<div style="font-size:15px;font-weight:700">${name}</div>`];
  if (data.cnpj) info.push(`<div style="color:#6b7280">CNPJ: ${escapeHtml(data.cnpj)}</div>`);
  if (data.address) info.push(`<div style="color:#6b7280">${escapeHtml(data.address)}</div>`);
  if (data.phone) info.push(`<div style="color:#6b7280">Tel: ${escapeHtml(data.phone)}</div>`);
  if (data.email) info.push(`<div style="color:#6b7280">${escapeHtml(data.email)}</div>`);

  return `
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #d1d5db">
  <div style="flex-shrink:0">${left}</div>
  <div style="text-align:right;font-size:12px">${info.join("")}</div>
</div>`.trim();
}
