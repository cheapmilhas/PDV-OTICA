import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireAuth, requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { readXlsxRows } from "@/lib/xlsx-read";

/**
 * POST /api/suppliers/import
 * Importa fornecedores a partir de arquivo Excel.
 *
 * Import em massa: restrito a ADMIN/GERENTE (espelha customers/import). Antes
 * qualquer papel logado importava sem restrição.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    await requireRole(["ADMIN", "GERENTE"]);
    const companyId = await getCompanyId();
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Anti-OOM/zip-bomb: rejeita antes de carregar o arrayBuffer em memória.
    const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx 5MB)" },
        { status: 400 }
      );
    }

    // Converter File para Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ler arquivo Excel
    const rawData: any[] = await readXlsxRows(buffer);

    if (rawData.length === 0) {
      return NextResponse.json(
        { error: "Planilha vazia" },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      errors: [] as string[],
      created: [] as string[],
      updated: [] as string[],
    };

    // Processar cada linha
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // +2 porque Excel começa em 1 e tem header

      try {
        // Validações básicas
        if (!row["Nome"]) {
          results.errors.push(`Linha ${rowNum}: Nome é obrigatório`);
          continue;
        }

        // Remover formatação do CNPJ/CPF (deixar só números)
        const cnpj = row["CNPJ/CPF"]
          ? row["CNPJ/CPF"].toString().replace(/\D/g, "")
          : null;

        // Validar CNPJ/CPF se fornecido
        if (cnpj && cnpj.length !== 11 && cnpj.length !== 14) {
          results.errors.push(`Linha ${rowNum}: CNPJ/CPF inválido (deve ter 11 ou 14 dígitos)`);
          continue;
        }

        // Remover formatação dos telefones
        const phone = row["Telefone"]
          ? row["Telefone"].toString().replace(/\D/g, "")
          : null;
        const contactPhone = row["Telefone do Contato"]
          ? row["Telefone do Contato"].toString().replace(/\D/g, "")
          : null;

        // Remover formatação do CEP
        const zipCode = row["CEP"]
          ? row["CEP"].toString().replace(/\D/g, "")
          : null;

        // Parsear ativo
        const active = row["Ativo"]
          ? row["Ativo"].toString().toLowerCase() === "sim" || row["Ativo"] === "1"
          : true;

        // Casar SÓ por CNPJ — nunca por nome. Antes o match era OR [{name},{cnpj}],
        // então dois fornecedores homônimos viravam o mesmo registro e o import
        // SOBRESCREVIA os dados de um com os do outro. Sem CNPJ na linha, CRIA
        // novo (não arrisca casar fornecedor errado por nome).
        const existingSupplier = cnpj
          ? await prisma.supplier.findFirst({
              where: { companyId, cnpj },
            })
          : null;

        const supplierData = {
          name: row["Nome"],
          cnpj,
          stateRegistration: row["Inscrição Estadual"] || null,
          phone,
          email: row["Email"] || null,
          address: row["Endereço"] || null,
          number: row["Número"] || null,
          complement: row["Complemento"] || null,
          neighborhood: row["Bairro"] || null,
          city: row["Cidade"] || null,
          state: row["Estado"] || null,
          zipCode,
          contactName: row["Nome do Contato"] || null,
          contactPhone,
          contactEmail: row["Email do Contato"] || null,
          notes: row["Observações"] || null,
          active,
        };

        if (existingSupplier) {
          // Atualizar fornecedor existente
          await prisma.supplier.update({
            where: { id: existingSupplier.id },
            data: supplierData,
          });
          results.updated.push(row["Nome"]);
        } else {
          // Criar novo fornecedor
          await prisma.supplier.create({
            data: {
              companyId,
              ...supplierData,
            },
          });
          results.created.push(row["Nome"]);
        }

        results.success++;
      } catch (error: any) {
        results.errors.push(`Linha ${rowNum}: ${error.message}`);
      }
    }

    return NextResponse.json({
      message: `Importação concluída: ${results.success} fornecedores processados`,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
