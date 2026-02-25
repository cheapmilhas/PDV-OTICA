import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError, businessRuleError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { parseCSV } from "@/services/reconciliation-parser.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: batchId } = await params;

    // Verificar batch
    const batch = await prisma.reconciliationBatch.findFirst({
      where: { id: batchId, companyId, status: { in: ["DRAFT", "IMPORTED"] } },
    });
    if (!batch) throw notFoundError("Batch não encontrado ou em status inválido");

    // Ler form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const templateId = formData.get("templateId") as string | null;

    if (!file) throw businessRuleError("Arquivo CSV é obrigatório");
    if (!templateId) throw businessRuleError("templateId é obrigatório");

    // Buscar template
    const template = await prisma.reconciliationTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw notFoundError("Template não encontrado");

    // Ler conteúdo do arquivo
    const fileContent = await file.text();

    // Parse CSV
    const parseResult = parseCSV(fileContent, {
      columnMapping: template.columnMapping as any,
      delimiter: template.delimiter,
      dateFormat: template.dateFormat,
      decimalSep: template.decimalSep,
      skipRows: template.skipRows,
    });

    if (parseResult.items.length === 0) {
      throw businessRuleError(
        `Nenhum item válido encontrado no CSV. Erros: ${parseResult.errors.join("; ")}`
      );
    }

    // Deletar itens antigos (reimportação)
    await prisma.reconciliationItem.deleteMany({
      where: { batchId },
    });

    // Criar itens
    await prisma.reconciliationItem.createMany({
      data: parseResult.items.map((item) => ({
        batchId,
        externalDate: item.externalDate,
        externalAmount: item.externalAmount,
        externalId: item.externalId || null,
        externalRef: item.externalRef || null,
        cardBrand: item.cardBrand || null,
        cardLastDigits: item.cardLastDigits || null,
        installments: item.installments || null,
        direction: "CREDIT" as const,
        rawData: item.rawData,
        status: "PENDING" as const,
      })),
    });

    // Atualizar batch
    const periodDates = parseResult.items.map((i) => i.externalDate).sort((a, b) => a.getTime() - b.getTime());

    await prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: {
        status: "IMPORTED",
        fileName: file.name,
        totalItems: parseResult.items.length,
        totalAmount: parseResult.totalAmount,
        unmatchedCount: parseResult.items.length,
        importedAt: new Date(),
        periodStart: periodDates[0],
        periodEnd: periodDates[periodDates.length - 1],
      },
    });

    return successResponse({
      imported: parseResult.items.length,
      totalAmount: parseResult.totalAmount,
      errors: parseResult.errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
