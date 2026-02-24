import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  message: z.string().min(1, "Mensagem é obrigatória"),
});

/**
 * POST /api/public/contact
 * Recebe formulário de contato da landing page.
 * Salva como GlobalAudit (sem criar novo model no schema).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = contactSchema.parse(body);

    // Salvar como audit log (evita mexer no schema)
    await prisma.globalAudit.create({
      data: {
        actorType: "WEBSITE_VISITOR",
        action: "CONTACT_FORM_SUBMITTED",
        metadata: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          companyName: data.companyName || null,
          message: data.message,
          ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
          userAgent: request.headers.get("user-agent") || null,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ message: "Mensagem enviada com sucesso!" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[CONTACT-FORM] Erro:", error);
    return NextResponse.json({ error: "Erro ao enviar mensagem" }, { status: 500 });
  }
}
