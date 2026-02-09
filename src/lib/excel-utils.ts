import * as XLSX from "xlsx";

/**
 * Gera um arquivo Excel a partir de dados
 */
export function generateExcelFile<T extends Record<string, any>>(
  data: T[],
  columns: Array<{ header: string; key: keyof T; width?: number }>,
  sheetName: string = "Sheet1"
): Buffer {
  // Criar array de headers
  const headers = columns.map((col) => col.header);

  // Criar array de dados
  const rows = data.map((item) => columns.map((col) => item[col.key] ?? ""));

  // Combinar headers com dados
  const worksheetData = [headers, ...rows];

  // Criar worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Definir larguras das colunas
  worksheet["!cols"] = columns.map((col) => ({
    wch: col.width || 15,
  }));

  // Criar workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Gerar buffer
  const excelBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return excelBuffer as Buffer;
}

/**
 * Gera template Excel para importação
 */
export function generateTemplateFile(
  columns: Array<{ header: string; example?: string; width?: number }>,
  sheetName: string = "Template"
): Buffer {
  // Criar headers
  const headers = columns.map((col) => col.header);

  // Criar linha de exemplo
  const exampleRow = columns.map((col) => col.example || "");

  // Combinar
  const worksheetData = [headers, exampleRow];

  // Criar worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Definir larguras
  worksheet["!cols"] = columns.map((col) => ({
    wch: col.width || 20,
  }));

  // Estilizar primeira linha (headers) - adicionar cor de fundo
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!worksheet[cellAddress]) continue;

    // Headers em negrito (nota: xlsx básico não suporta estilos, mas mantemos para futuras melhorias)
    worksheet[cellAddress].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "4472C4" } },
      alignment: { horizontal: "center" },
    };
  }

  // Criar workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Gerar buffer
  const excelBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return excelBuffer as Buffer;
}

/**
 * Lê arquivo Excel e retorna dados
 */
export function readExcelFile<T>(
  fileBuffer: Buffer,
  columnMapping: Record<string, keyof T>
): T[] {
  // Ler workbook
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  // Pegar primeira sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Converter para JSON
  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  // Mapear colunas
  const mappedData = rawData.map((row) => {
    const mapped: any = {};
    Object.entries(columnMapping).forEach(([excelColumn, dataKey]) => {
      mapped[dataKey] = row[excelColumn];
    });
    return mapped as T;
  });

  return mappedData;
}
