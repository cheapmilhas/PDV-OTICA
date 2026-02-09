import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { parse, isValid } from "date-fns";

/**
 * POST /api/customers/import
 * Importa clientes a partir de arquivo Excel
 */
export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Converter File para Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ler arquivo Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

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

        // Remover formatação do CPF (deixar só números)
        const cpf = row["CPF"]
          ? row["CPF"].toString().replace(/\D/g, "")
          : null;

        // Validar CPF se fornecido
        if (cpf && cpf.length !== 11) {
          results.errors.push(`Linha ${rowNum}: CPF inválido`);
          continue;
        }

        // Remover formatação dos telefones
        const phone = row["Telefone"]
          ? row["Telefone"].toString().replace(/\D/g, "")
          : null;
        const phone2 = row["Telefone 2"]
          ? row["Telefone 2"].toString().replace(/\D/g, "")
          : null;

        // Remover formatação do CEP
        const zipCode = row["CEP"]
          ? row["CEP"].toString().replace(/\D/g, "")
          : null;

        // Parsear data de nascimento
        let birthDate = null;
        if (row["Data de Nascimento"]) {
          const dateStr = row["Data de Nascimento"].toString();
          const parsedDate = parse(dateStr, "dd/MM/yyyy", new Date());
          if (isValid(parsedDate)) {
            birthDate = parsedDate;
          }
        }

        // Parsear gênero
        let gender = null;
        if (row["Gênero"]) {
          const genderStr = row["Gênero"].toString().toUpperCase();
          if (["M", "F", "OUTRO"].includes(genderStr)) {
            gender = genderStr;
          }
        }

        // Parsear aceita marketing
        const acceptsMarketing = row["Aceita Marketing"]
          ? row["Aceita Marketing"].toString().toLowerCase() === "sim" || row["Aceita Marketing"] === "1"
          : false;

        // Parsear ativo
        const active = row["Ativo"]
          ? row["Ativo"].toString().toLowerCase() === "sim" || row["Ativo"] === "1"
          : true;

        // Verificar se cliente já existe (por CPF ou nome)
        const whereConditions: any[] = [{ name: row["Nome"] }];
        if (cpf) {
          whereConditions.push({ cpf });
        }

        const existingCustomer = await prisma.customer.findFirst({
          where: {
            companyId,
            OR: whereConditions,
          },
        });

        const customerData = {
          name: row["Nome"],
          cpf,
          rg: row["RG"] || null,
          phone,
          phone2,
          email: row["Email"] || null,
          birthDate,
          gender,
          address: row["Endereço"] || null,
          number: row["Número"] || null,
          complement: row["Complemento"] || null,
          neighborhood: row["Bairro"] || null,
          city: row["Cidade"] || null,
          state: row["Estado"] || null,
          zipCode,
          acceptsMarketing,
          referralSource: row["Fonte de Indicação"] || null,
          notes: row["Observações"] || null,
          active,
        };

        if (existingCustomer) {
          // Atualizar cliente existente
          await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: customerData,
          });
          results.updated.push(row["Nome"]);
        } else {
          // Criar novo cliente
          await prisma.customer.create({
            data: {
              companyId,
              ...customerData,
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
      message: `Importação concluída: ${results.success} clientes processados`,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
