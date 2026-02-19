import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

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

  const { noteId } = await params;

  try {
    const body = await request.json();
    const { content, isPinned } = body;

    const updateData: any = {};
    if (content !== undefined) updateData.content = content.trim();
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    const note = await prisma.companyNote.update({
      where: { id: noteId },
      data: updateData,
    });

    return NextResponse.json(note);
  } catch (error) {
    console.error("[NOTES] Erro ao atualizar:", error);
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

  const { noteId } = await params;

  try {
    await prisma.companyNote.delete({
      where: { id: noteId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NOTES] Erro ao deletar:", error);
    return NextResponse.json({ error: "Erro ao deletar nota" }, { status: 500 });
  }
}
