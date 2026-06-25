import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/clientes/[id]/notes/[noteId]" });

/**
 * PATCH /api/admin/clientes/[id]/notes/[noteId]
 * Atualiza uma nota (conteúdo ou isPinned)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, noteId } = await params;

  try {
    const body = await request.json();
    const { content, isPinned } = body;

    const updateData: any = {};
    if (content !== undefined) updateData.content = content.trim();
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    // Amarra a nota à empresa do path (defesa em profundidade): updateMany com
    // {id, companyId} não altera nota de outra empresa mesmo com noteId forjado.
    const result = await prisma.companyNote.updateMany({
      where: { id: noteId, companyId },
      data: updateData,
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    }
    const note = await prisma.companyNote.findUnique({ where: { id: noteId } });

    return NextResponse.json(note);
  } catch (error) {
    log.error("Erro ao atualizar", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro ao atualizar nota" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/clientes/[id]/notes/[noteId]
 * Deleta uma nota
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId, noteId } = await params;

  try {
    // Amarra a nota à empresa do path (deleteMany com {id, companyId} não apaga
    // nota de outra empresa mesmo com noteId forjado).
    const result = await prisma.companyNote.deleteMany({
      where: { id: noteId, companyId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Erro ao deletar", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro ao deletar nota" }, { status: 500 });
  }
}
