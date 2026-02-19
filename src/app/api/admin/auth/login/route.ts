import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar AdminUser
    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      console.log(`[ADMIN-LOGIN] Admin não encontrado: ${email}`);
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    if (!admin.active) {
      console.log(`[ADMIN-LOGIN] Admin inativo: ${email}`);
      return NextResponse.json(
        { error: "Conta desativada" },
        { status: 401 }
      );
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      console.log(`[ADMIN-LOGIN] Senha incorreta para: ${email}`);
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    // Atualizar último login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Criar JWT
    const token = await new SignJWT({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isAdmin: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(JWT_SECRET);

    // Setar cookie
    const cookieStore = await cookies();
    cookieStore.set("admin.session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 horas
    });

    console.log(`[ADMIN-LOGIN] Login bem-sucedido: ${email} (${admin.role})`);

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("[ADMIN-LOGIN] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
