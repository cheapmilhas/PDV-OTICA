import { PrismaClient } from "@prisma/client";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

interface DefaultTemplate {
  name: string;
  acquirerName: string;
  columnMapping: Record<string, number | string>;
  delimiter: string;
  dateFormat: string;
  decimalSep: string;
  skipRows: number;
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Stone Padrão",
    acquirerName: "Stone",
    columnMapping: {
      date: 0,
      nsu: 1,
      authCode: 2,
      brand: 3,
      lastDigits: 4,
      installments: 5,
      grossAmount: 6,
      netAmount: 7,
      feeAmount: 8,
    },
    delimiter: ";",
    dateFormat: "dd/MM/yyyy",
    decimalSep: ",",
    skipRows: 1,
  },
  {
    name: "Cielo CSV",
    acquirerName: "Cielo",
    columnMapping: {
      date: 0,
      nsu: 2,
      authCode: 3,
      brand: 4,
      lastDigits: 5,
      installments: 6,
      grossAmount: 7,
      netAmount: 8,
      feeAmount: 9,
    },
    delimiter: ";",
    dateFormat: "dd/MM/yyyy",
    decimalSep: ",",
    skipRows: 1,
  },
  {
    name: "Rede Padrão",
    acquirerName: "Rede",
    columnMapping: {
      date: 0,
      nsu: 1,
      authCode: 2,
      brand: 3,
      lastDigits: 4,
      installments: 5,
      grossAmount: 6,
      netAmount: 7,
      feeAmount: 8,
    },
    delimiter: ",",
    dateFormat: "dd/MM/yyyy",
    decimalSep: ".",
    skipRows: 1,
  },
  {
    name: "Genérico CSV",
    acquirerName: "Genérico",
    columnMapping: {
      date: 0,
      nsu: 1,
      authCode: 2,
      brand: 3,
      lastDigits: 4,
      installments: 5,
      grossAmount: 6,
    },
    delimiter: ",",
    dateFormat: "dd/MM/yyyy",
    decimalSep: ",",
    skipRows: 1,
  },
];

/**
 * Configura templates padrão de conciliação para uma empresa.
 * IDEMPOTENTE — usa upsert.
 */
export async function setupReconciliationDefaults(
  tx: TransactionClient,
  companyId: string
): Promise<void> {
  for (const tpl of DEFAULT_TEMPLATES) {
    await tx.reconciliationTemplate.upsert({
      where: {
        companyId_name: { companyId, name: tpl.name },
      },
      update: {
        acquirerName: tpl.acquirerName,
        columnMapping: tpl.columnMapping as any,
        delimiter: tpl.delimiter,
        dateFormat: tpl.dateFormat,
        decimalSep: tpl.decimalSep,
        skipRows: tpl.skipRows,
      },
      create: {
        companyId,
        name: tpl.name,
        acquirerName: tpl.acquirerName,
        isSystem: true,
        columnMapping: tpl.columnMapping as any,
        delimiter: tpl.delimiter,
        dateFormat: tpl.dateFormat,
        decimalSep: tpl.decimalSep,
        skipRows: tpl.skipRows,
      },
    });
  }
}
