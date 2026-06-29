import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readXlsxRows } from "./xlsx-read";

/**
 * Segurança (pentest 2026-06-27): readXlsxRows substitui XLSX.read (sheetjs,
 * CVE) por exceljs nos imports. Estes testes provam que o formato de saída
 * (array de objetos chaveados pelo cabeçalho) é equivalente ao que
 * XLSX.utils.sheet_to_json entregava, para os imports não quebrarem.
 */

async function makeXlsx(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dados");
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    ws.addRow(headers);
    for (const r of rows) ws.addRow(headers.map((h) => r[h]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("readXlsxRows", () => {
  it("lê linhas como objetos chaveados pelo cabeçalho", async () => {
    const buf = await makeXlsx([
      { Nome: "Ana", CPF: "111", Cidade: "SP" },
      { Nome: "Bruno", CPF: "222", Cidade: "RJ" },
    ]);
    const rows = await readXlsxRows(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Nome: "Ana", CPF: "111", Cidade: "SP" });
    expect(rows[1]).toMatchObject({ Nome: "Bruno", Cidade: "RJ" });
  });

  it("omite células vazias do objeto da linha (como sheet_to_json)", async () => {
    const buf = await makeXlsx([{ Nome: "Ana", Email: "", Tel: "999" }]);
    const rows = await readXlsxRows(buf);
    expect(rows[0]).toHaveProperty("Nome");
    expect(rows[0]).toHaveProperty("Tel");
    expect(rows[0]).not.toHaveProperty("Email");
  });

  it("ignora linhas totalmente vazias", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Dados");
    ws.addRow(["Nome", "Idade"]);
    ws.addRow(["Ana", 30]);
    ws.addRow([]); // linha vazia
    ws.addRow(["Bruno", 25]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const rows = await readXlsxRows(buf);
    expect(rows).toHaveLength(2);
  });

  it("preserva números e datas", async () => {
    const d = new Date("2026-01-15T00:00:00.000Z");
    const buf = await makeXlsx([{ Valor: 42.5, Data: d }]);
    const rows = await readXlsxRows(buf);
    expect(rows[0].Valor).toBe(42.5);
    expect(rows[0].Data).toBeInstanceOf(Date);
  });

  it("planilha sem dados → array vazio", async () => {
    const buf = await makeXlsx([]);
    const rows = await readXlsxRows(buf);
    expect(rows).toEqual([]);
  });
});
