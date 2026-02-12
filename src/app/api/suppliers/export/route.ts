import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

/**
 * GET /api/suppliers/export
 * Exporta todos os fornecedores em formato Excel
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();

    // Buscar todos os fornecedores da empresa
    const suppliers = await prisma.supplier.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    // Preparar dados para exportação
    const data = suppliers.map((supplier: any) => ({
      Nome: supplier.name,
      "CNPJ/CPF": supplier.cnpj || "",
      "Inscrição Estadual": (supplier as any).stateRegistration || "",
      Telefone: supplier.phone || "",
      Email: supplier.email || "",
      Endereço: supplier.address || "",
      Número: supplier.number || "",
      Complemento: supplier.complement || "",
      Bairro: supplier.neighborhood || "",
      Cidade: supplier.city || "",
      Estado: supplier.state || "",
      CEP: supplier.zipCode || "",
      "Nome do Contato": supplier.contactName || "",
      "Telefone do Contato": supplier.contactPhone || "",
      "Email do Contato": supplier.contactEmail || "",
      Observações: supplier.notes || "",
      Ativo: supplier.active ? "Sim" : "Não",
    }));

    // Criar planilha
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fornecedores");

    // Ajustar largura das colunas
    worksheet["!cols"] = [
      { wch: 40 }, // Nome
      { wch: 18 }, // CNPJ/CPF
      { wch: 18 }, // Inscrição Estadual
      { wch: 18 }, // Telefone
      { wch: 30 }, // Email
      { wch: 40 }, // Endereço
      { wch: 10 }, // Número
      { wch: 20 }, // Complemento
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 8 },  // Estado
      { wch: 15 }, // CEP
      { wch: 30 }, // Nome do Contato
      { wch: 18 }, // Telefone do Contato
      { wch: 30 }, // Email do Contato
      { wch: 40 }, // Observações
      { wch: 8 },  // Ativo
    ];

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Retornar arquivo
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Disposition": `attachment; filename="fornecedores_${new Date().toISOString().split("T")[0]}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
