import { NextRequest, NextResponse } from "next/server";
import { getCompanyId, requireAuth, requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";
import * as XLSX from "xlsx";
import { parse, isValid } from "date-fns";

/**
 * POST /api/customers/import
 * Importa clientes a partir de arquivo Excel.
 *
 * E3 (Grupo E): import em massa de PII é ADMIN-only e auditado (LGPD).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requireRole(["ADMIN"]);
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
      // H17: linhas sem CPF/CNPJ/Cliente ID são SEMPRE criadas como novo (nunca
      // atualizam por nome). Contabilizamos p/ avisar o ADMIN — reimportar uma
      // planilha legada sem identificadores duplica clientes.
      withoutIdentifier: 0,
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

        // Determinar tipo de pessoa (PF ou PJ)
        const personType = cpf && cpf.length === 14 ? "PJ" : "PF";

        // H17: casar SÓ por identificador único e confiável — NUNCA por nome.
        // Antes o match era OR [{name}, {cpf}], então dois clientes homônimos
        // ("Maria Silva") viravam o mesmo registro e o import SOBRESCREVIA os
        // dados de uma com os da outra. Agora o match é HIERÁRQUICO (não OR
        // plano, que poderia casar registros DIFERENTES por externalId vs cpf):
        // tenta externalId → cpf → cnpj, parando no primeiro. Sem identificador
        // na linha, CRIA novo (não arrisca sobrescrever cliente errado).
        const externalId = externalIdRaw ? String(externalIdRaw) : null;
        const cpfDigits = cpf && cpf.length === 11 ? cpf : null;
        const cnpjDigits = cpf && cpf.length === 14 ? cpf : null;

        let matchByExternalId: { id: string } | null = null;
        let matchByDoc: { id: string } | null = null;

        if (externalId) {
          // externalId não tem unique constraint — guarda contra duplicatas.
          const dupCount = await prisma.customer.count({
            where: { companyId, externalId },
          });
          if (dupCount > 1) {
            results.errors.push(
              `Linha ${rowNum}: "Cliente ID" ${externalId} corresponde a ${dupCount} clientes — corrija as duplicatas antes de reimportar.`
            );
            continue;
          }
          matchByExternalId = await prisma.customer.findFirst({
            where: { companyId, externalId },
            select: { id: true },
          });
        }

        if (cpfDigits) {
          matchByDoc = await prisma.customer.findUnique({
            where: { companyId_cpf: { companyId, cpf: cpfDigits } },
            select: { id: true },
          });
        } else if (cnpjDigits) {
          matchByDoc = await prisma.customer.findFirst({
            where: { companyId, cnpj: cnpjDigits },
            select: { id: true },
          });
        }

        // Conflito de identidade cruzada: externalId aponta um cliente e o
        // documento aponta OUTRO. Atualizar qualquer um corromperia dados —
        // registra erro e pula (o ADMIN resolve manualmente).
        if (
          matchByExternalId &&
          matchByDoc &&
          matchByExternalId.id !== matchByDoc.id
        ) {
          results.errors.push(
            `Linha ${rowNum}: conflito de identidade — "Cliente ID" pertence a um cliente e o CPF/CNPJ a outro. Corrija manualmente.`
          );
          continue;
        }

        // Prioridade: externalId, depois documento.
        const existingCustomer = matchByExternalId ?? matchByDoc;

        const customerData = {
          name: nome,
          personType,
          cpf: cpfDigits,
          cnpj: cnpjDigits,
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
          externalId,
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
          // Linha sem identificador → sempre cria (avisa o ADMIN no fim).
          if (!externalId && !cpfDigits && !cnpjDigits) {
            results.withoutIdentifier++;
          }
        }

        results.success++;
      } catch (error: any) {
        // H17: P2002 (unique CPF) com mensagem amigável — não vaza nome interno
        // da constraint do Prisma na resposta/auditoria.
        const message =
          error?.code === "P2002"
            ? "CPF/CNPJ já pertence a outro cliente nesta empresa"
            : error.message;
        results.errors.push(`Linha ${rowNum}: ${message}`);
      }
    }

    // LGPD: registra a importação em massa de PII.
    await logActivity({
      companyId,
      type: "DATA_UPDATED",
      title: "Importou clientes em massa (planilha)",
      detail: {
        processed: results.success,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
        resource: "customers.import",
      },
      actorId: session.user.id,
      actorType: ActorType.ADMIN,
      actorName: session.user.name ?? session.user.email ?? undefined,
    });

    const aviso =
      results.withoutIdentifier > 0
        ? ` (${results.withoutIdentifier} linha(s) sem CPF/CNPJ/Cliente ID foram criadas como NOVOS clientes — reimportar planilha sem identificador duplica cadastros)`
        : "";

    return NextResponse.json({
      message: `Importação concluída: ${results.success} clientes processados${aviso}`,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
