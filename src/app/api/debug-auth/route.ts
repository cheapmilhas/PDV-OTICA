import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * GET /api/debug-auth?email=xxx&password=yyy
 * TEMPORÁRIO - remover após debug
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "admin@pdvotica.com";
  const password = searchParams.get("password") || "admin123";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        active: true,
        role: true,
        branches: { include: { branch: { select: { id: true, name: true } } } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found", email });
    }

    const hashPrefix = user.passwordHash?.substring(0, 20) || "null";
    const match = await bcrypt.compare(password, user.passwordHash || "");

    // Tentar gerar um novo hash e comparar
    const newHash = await bcrypt.hash(password, 10);
    const newMatch = await bcrypt.compare(password, newHash);

    return NextResponse.json({
      found: true,
      email: user.email,
      active: user.active,
      role: user.role,
      hashPrefix,
      hashLength: user.passwordHash?.length,
      passwordMatch: match,
      newHashMatch: newMatch,
      branchCount: user.branches.length,
      firstBranch: user.branches[0]?.branch?.name || null,
      bcryptVersion: "bcryptjs",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
