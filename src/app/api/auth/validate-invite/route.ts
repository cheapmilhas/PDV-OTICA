import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token não fornecido" }, { status: 400 });
  }

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: {
      company: { select: { tradeName: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  if (invite.status === "ACTIVATED") {
    return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 400 });
  }

  if (invite.status === "REVOKED") {
    return NextResponse.json({ error: "Este convite foi cancelado" }, { status: 400 });
  }

  if (new Date() > invite.expiresAt) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Este convite expirou. Solicite um novo ao administrador." }, { status: 400 });
  }

  return NextResponse.json({ invite });
}
