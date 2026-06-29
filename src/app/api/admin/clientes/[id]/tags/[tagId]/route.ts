import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireSupportScope } from "@/lib/admin-session";

// DELETE /api/admin/clientes/[id]/tags/[tagId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId, tagId } = await params;

  if (!(await requireSupportScope(admin.id, companyId))) {
    return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
  }

  const existing = await prisma.companyTag.findUnique({
    where: { companyId_tagId: { companyId, tagId } },
  });
  if (!existing) return NextResponse.json({ error: "Associação não encontrada" }, { status: 404 });

  await prisma.companyTag.delete({ where: { id: existing.id } });

  return NextResponse.json({ success: true });
}
