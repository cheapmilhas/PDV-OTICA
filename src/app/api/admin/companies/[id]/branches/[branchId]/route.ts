import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";
import { parseOptionalPositiveInt } from "@/lib/parse-int-field";

const log = logger.child({ route: "admin/companies/[id]/branches/[branchId]" });

/**
 * PATCH /api/admin/companies/[id]/branches/[branchId]
 * Atualiza dados de uma filial (admin)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId, branchId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  try {
    const body = await request.json();
    const { name, code, address, city, state, zipCode, phone, nfeSeries, active } = body;

    // Verificar se filial pertence à empresa
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, companyId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Filial não encontrada" }, { status: 404 });
    }

    // Se está desativando, verificar se pode
    if (active === false && branch.active) {
      const openShifts = await prisma.cashShift.count({
        where: { branchId, status: "OPEN" },
      });
      if (openShifts > 0) {
        return NextResponse.json({
          error: "Não é possível desativar a filial: existem caixas abertos. Feche-os primeiro.",
        }, { status: 400 });
      }
    }

    // Verificar código único (se mudou)
    if (code !== undefined && code !== branch.code) {
      if (code?.trim()) {
        const existingCode = await prisma.branch.findFirst({
          where: { companyId, code: code.trim(), id: { not: branchId } },
        });
        if (existingCode) {
          return NextResponse.json({ error: `Código "${code}" já está em uso` }, { status: 400 });
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (city !== undefined) updateData.city = city?.trim() || null;
    if (state !== undefined) updateData.state = state?.trim() || null;
    if (zipCode !== undefined) updateData.zipCode = zipCode?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (nfeSeries !== undefined) {
      const parsed = parseOptionalPositiveInt(nfeSeries, "Série NF-e");
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.nfeSeries = parsed.value;
    }
    if (active !== undefined) updateData.active = active;

    const updated = await prisma.branch.update({
      where: { id: branchId },
      data: updateData,
    });

    // Audit log
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: active === false ? "BRANCH_DEACTIVATED" : "BRANCH_UPDATED",
        metadata: { branchId, branchName: updated.name, changes: Object.keys(updateData) },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    log.error("Erro ao atualizar filial", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
