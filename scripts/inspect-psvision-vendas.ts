/**
 * INSPEÇÃO (somente leitura) — ler as planilhas "Relatorio Vendas Detalhada" da P.S Vision
 * para entender colunas/estrutura e descobrir se trazem preço/valor dos produtos.
 */
import * as XLSX from "xlsx";

const FILES = [
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/2397B463-5E5D-47C9-974B-52731031AA78/Relatorio Vendas Detalhada (2).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/D6DA6425-C4F4-44E4-9B50-BC8E7BC94737/Relatorio Vendas Detalhada (3).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/4E9695AC-E2B7-40C0-A6F1-859248DD7B22/Relatorio Vendas Detalhada (4).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/7951F78D-529D-46CE-B921-099D442A0B5F/Relatorio Vendas Detalhada (5).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/FCDD760E-C18D-4EED-8CDE-52A5880F1D9A/Relatorio Vendas Detalhada (6).xls",
];

for (const f of FILES) {
  console.log("\n\n========================================");
  console.log("ARQUIVO:", f.split("/").pop());
  console.log("========================================");
  try {
    const wb = XLSX.readFile(f);
    console.log("Abas:", wb.SheetNames);
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      console.log(`\n--- Aba "${sheetName}" (${rows.length} linhas) ---`);
      // Mostrar as primeiras 25 linhas brutas para entender cabeçalho/estrutura
      rows.slice(0, 25).forEach((r, i) => {
        console.log(`[${i}] ${JSON.stringify(r)}`);
      });
      if (rows.length > 25) console.log(`... (+${rows.length - 25} linhas)`);
    }
  } catch (e: any) {
    console.error("ERRO ao ler:", e.message);
  }
}
