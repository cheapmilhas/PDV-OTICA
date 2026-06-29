import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/clientes/[id]" });

/**
 * PATCH /api/admin/clientes/[id]
 * Atualiza dados cadastrais de uma empresa (admin)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  if (!(await requireCompanyScope(admin.id, companyId))) {
    return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, tradeName, cnpj, email, phone, address, city, state, zipCode, website } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome da empresa é obrigatório" }, { status: 400 });
    }

    // Verificar se empresa existe
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Verificar CNPJ único (se mudou)
    if (cnpj && cnpj !== company.cnpj) {
      const existingCnpj = await prisma.company.findFirst({
        where: { cnpj, id: { not: companyId } },
      });
      if (existingCnpj) {
        return NextResponse.json({ error: "CNPJ já está em uso por outra empresa" }, { status: 400 });
      }
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        name: name.trim(),
        tradeName: tradeName?.trim() || null,
        cnpj: cnpj?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        website: website?.trim() || null,
      },
    });

    // Audit log
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "COMPANY_UPDATED",
        metadata: { adminEmail: admin.email },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    log.error("Erro ao atualizar empresa", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
