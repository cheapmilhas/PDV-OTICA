import { NextResponse } from "next/server";
import { getCompanyId, requireAuth, requireRole } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";
import * as XLSX from "xlsx";
import { format } from "date-fns";

/**
 * GET /api/customers/export
 * Exporta todos os clientes em formato Excel.
 *
 * E3 (Grupo E): exportação de PII (CPF/RG/endereço de toda a base) é
 * ADMIN-only e SEMPRE auditada (LGPD). Antes não exigia auth/permissão nem
 * gravava log — qualquer usuário baixava a base inteira sem rastro.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    await requireRole(["ADMIN"]);
    const companyId = await getCompanyId();

    // Buscar todos os clientes da empresa
    const customers = await prisma.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    // LGPD: registra quem exportou a base de PII e quantos registros.
    await logActivity({
      companyId,
      type: "DATA_UPDATED",
      title: "Exportou a base de clientes (XLSX com dados pessoais)",
      detail: { count: customers.length, resource: "customers.export" },
      actorId: session.user.id,
      actorType: ActorType.ADMIN,
      actorName: session.user.name ?? session.user.email ?? undefined,
    });

    // Preparar dados para exportação
    const data = customers.map((customer) => ({
      Nome: customer.name,
      CPF: customer.cpf || "",
      RG: customer.rg || "",
      Telefone: customer.phone || "",
      "Telefone 2": customer.phone2 || "",
      Email: customer.email || "",
      "Data de Nascimento": customer.birthDate
        ? format(new Date(customer.birthDate), "dd/MM/yyyy")
        : "",
      Gênero: customer.gender || "",
      Endereço: customer.address || "",
      Número: customer.number || "",
      Complemento: customer.complement || "",
      Bairro: customer.neighborhood || "",
      Cidade: customer.city || "",
      Estado: customer.state || "",
      CEP: customer.zipCode || "",
      "Aceita Marketing": customer.acceptsMarketing ? "Sim" : "Não",
      "Fonte de Indicação": customer.referralSource || "",
      Observações: customer.notes || "",
      Ativo: customer.active ? "Sim" : "Não",
    }));

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    // Ajustar largura das colunas
    worksheet["!cols"] = [
      { wch: 40 }, // Nome
      { wch: 15 }, // CPF
      { wch: 15 }, // RG
      { wch: 15 }, // Telefone
      { wch: 15 }, // Telefone 2
      { wch: 30 }, // Email
      { wch: 18 }, // Data de Nascimento
      { wch: 10 }, // Gênero
      { wch: 40 }, // Endereço
      { wch: 10 }, // Número
      { wch: 20 }, // Complemento
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 5 },  // Estado
      { wch: 12 }, // CEP
      { wch: 15 }, // Aceita Marketing
      { wch: 20 }, // Fonte de Indicação
      { wch: 40 }, // Observações
      { wch: 8 },  // Ativo
    ];

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Retornar arquivo
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="clientes_${new Date().toISOString().split("T")[0]}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
