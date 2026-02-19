import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/clientes/[id]/notes
 * Lista notas de uma empresa
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const notes = await prisma.companyNote.findMany({
      where: { companyId: id },
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("[NOTES] Erro ao buscar:", error);
    return NextResponse.json({ error: "Erro ao buscar notas" }, { status: 500 });
  }
}

/**
 * POST /api/admin/clientes/[id]/notes
 * Cria uma nova nota
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { content, type, isPinned } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Conteúdo obrigatório" }, { status: 400 });
    }

    const note = await prisma.companyNote.create({
      data: {
        companyId: id,
        adminId: admin.id,
        adminName: admin.name,
        content: content.trim(),
        type: type || "general",
        isPinned: isPinned || false,
      },
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId: id,
        action: "NOTE_CREATED",
        metadata: { noteId: note.id, type },
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("[NOTES] Erro ao criar:", error);
    return NextResponse.json({ error: "Erro ao criar nota" }, { status: 500 });
  }
}
