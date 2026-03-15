import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
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
    await requirePermission("customers.create");
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
        // Suporte a múltiplos formatos de coluna (sistema padrão + sistema antigo Ado)
        const nome = row["Nome"] || row["Nome / Razão Social"];
        const docRaw = row["CPF"] || row["Documento"];
        const rgRaw = row["RG"] || row["RG / IE"];
        const emailRaw = row["Email"] || row["email"];
        const telRaw = row["Telefone"] || row["telefone"] || row["celular"];
        const tel2Raw = row["Telefone 2"] || row["celular1"] || row["celular2"];
        const cepRaw = row["CEP"];
        const enderecoRaw = row["Endereço"];
        const numeroRaw = row["Número"];
        const compRaw = row["Complemento"];
        const bairroRaw = row["Bairro"];
        const cidadeRaw = row["Cidade"];
        const estadoRaw = row["Estado"];
        const dataNascRaw = row["Data de Nascimento"];
        const generoRaw = row["Gênero"] || row["Sexo"];
        const ativoRaw = row["Ativo"];
        const obsRaw = row["Observações"] || row["Observação"];
        const externalIdRaw = row["Cliente ID"] || row["Codigo Externo"];

        // Validações básicas
        if (!nome) {
          results.errors.push(`Linha ${rowNum}: Nome é obrigatório`);
          continue;
        }

        // Remover formatação do CPF/CNPJ (deixar só números)
        const cpf = docRaw
          ? docRaw.toString().replace(/\D/g, "")
          : null;

        // Validar CPF se fornecido (aceitar CPF 11 ou CNPJ 14 dígitos)
        if (cpf && cpf.length !== 11 && cpf.length !== 14) {
          results.errors.push(`Linha ${rowNum}: CPF/CNPJ inválido`);
          continue;
        }

        // Remover formatação dos telefones
        const phone = telRaw
          ? telRaw.toString().replace(/\D/g, "")
          : null;
        const phone2 = tel2Raw
          ? tel2Raw.toString().replace(/\D/g, "")
          : null;

        // Remover formatação do CEP
        const zipCode = cepRaw
          ? cepRaw.toString().replace(/\D/g, "")
          : null;

        // Parsear data de nascimento (dd/MM/yyyy ou serial Excel)
        let birthDate = null;
        if (dataNascRaw) {
          if (typeof dataNascRaw === "number") {
            // Serial Excel: dias desde 1900-01-01
            const excelEpoch = new Date(1899, 11, 30);
            birthDate = new Date(excelEpoch.getTime() + dataNascRaw * 86400000);
          } else {
            const dateStr = dataNascRaw.toString();
            const parsedDate = parse(dateStr, "dd/MM/yyyy", new Date());
            if (isValid(parsedDate)) {
              birthDate = parsedDate;
            }
          }
        }

        // Parsear gênero
        let gender = null;
        if (generoRaw) {
          const genderStr = generoRaw.toString().toUpperCase().trim();
          if (genderStr === "M" || genderStr === "MASCULINO") gender = "M";
          else if (genderStr === "F" || genderStr === "FEMININO") gender = "F";
          else if (genderStr === "OUTRO") gender = "OUTRO";
        }

        // Parsear aceita marketing
        const acceptsMarketing = row["Aceita Marketing"]
          ? row["Aceita Marketing"].toString().toLowerCase() === "sim" || row["Aceita Marketing"] === "1"
          : true;

        // Parsear ativo
        const active = ativoRaw
          ? ativoRaw.toString().toLowerCase() === "sim" || ativoRaw === "1"
          : true;

        // Verificar se cliente já existe (por CPF ou nome)
        const whereConditions: any[] = [{ name: nome }];
        if (cpf) {
          whereConditions.push({ cpf });
        }

        const existingCustomer = await prisma.customer.findFirst({
          where: {
            companyId,
            OR: whereConditions,
          },
        });

        // Determinar tipo de pessoa (PF ou PJ)
        const personType = cpf && cpf.length === 14 ? "PJ" : "PF";

        const customerData = {
          name: nome,
          personType,
          cpf: cpf && cpf.length === 11 ? cpf : null,
          cnpj: cpf && cpf.length === 14 ? cpf : null,
          rg: rgRaw ? String(rgRaw) : null,
          phone,
          phone2,
          email: emailRaw ? String(emailRaw) : null,
          birthDate,
          gender,
          address: enderecoRaw ? String(enderecoRaw) : null,
          number: numeroRaw ? String(numeroRaw) : null,
          complement: compRaw ? String(compRaw) : null,
          neighborhood: bairroRaw ? String(bairroRaw) : null,
          city: cidadeRaw ? String(cidadeRaw) : null,
          state: estadoRaw ? String(estadoRaw) : null,
          zipCode,
          acceptsMarketing,
          referralSource: row["Fonte de Indicação"] || row["Origem do Cliente"] || null,
          notes: obsRaw ? String(obsRaw) : null,
          externalId: externalIdRaw ? String(externalIdRaw) : null,
          active,
        };

        if (existingCustomer) {
          // Atualizar cliente existente
          await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: customerData,
          });
          results.updated.push(nome);
        } else {
          // Criar novo cliente
          await prisma.customer.create({
            data: {
              companyId,
              ...customerData,
            },
          });
          results.created.push(nome);
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
