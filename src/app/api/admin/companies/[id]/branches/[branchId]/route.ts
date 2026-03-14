import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

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
    if (nfeSeries !== undefined) updateData.nfeSeries = nfeSeries ? parseInt(nfeSeries, 10) : null;
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
    console.error("[ADMIN-BRANCHES] Erro ao atualizar filial:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
