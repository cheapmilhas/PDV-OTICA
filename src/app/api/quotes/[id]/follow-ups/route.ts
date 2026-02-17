import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";

const createFollowUpSchema = z.object({
  type: z.enum(["WHATSAPP", "CALL", "EMAIL", "VISIT", "NOTE"]),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  notes: z.string().optional(),
  outcome: z.enum([
    "INTERESTED",
    "ASKED_DISCOUNT",
    "WILL_THINK",
    "NO_ANSWER",
    "NOT_INTERESTED",
    "SCHEDULED_RETURN",
    "CONVERTED",
  ]).optional(),
  nextFollowUpAt: z.string().datetime().optional(),
});

/**
 * GET /api/quotes/[id]/follow-ups
 * Lista o histórico de follow-ups (contatos) do orçamento
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id: quoteId } = await params;

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      select: { id: true },
    });

    if (!quote) {
      return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
    }

    // Buscar follow-ups dos campos da tabela Quote (sem tabela separada)
    const quoteData = await prisma.quote.findFirst({
      where: { id: quoteId },
      select: {
        followUpDate: true,
        followUpNotes: true,
        contactCount: true,
        lastContactAt: true,
        sentAt: true,
        sentVia: true,
        followUpCount: true,
        lastFollowUpAt: true,
      },
    });

    // Buscar logs de auditoria relacionados ao orçamento (contatos registrados)
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "Quote",
        entityId: quoteId,
        action: { in: ["FOLLOW_UP", "WHATSAPP_SENT", "CALLED", "EMAILED", "VISITED"] },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []); // Gracefully handle if AuditLog doesn't have these action types

    return NextResponse.json({
      data: auditLogs,
      summary: quoteData,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/quotes/[id]/follow-ups
 * Registra um novo contato/follow-up no orçamento
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    const { id: quoteId } = await params;

    const body = await req.json();
    const data = createFollowUpSchema.parse(body);

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
    });

    if (!quote) {
      return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
    }

    // Atualizar campos de follow-up no orçamento
    const updateData: any = {
      contactCount: { increment: 1 },
      lastContactAt: new Date(),
      followUpCount: { increment: 1 },
      lastFollowUpAt: new Date(),
    };

    if (data.nextFollowUpAt) {
      updateData.followUpDate = new Date(data.nextFollowUpAt);
    }

    if (data.notes) {
      updateData.followUpNotes = data.notes;
    }

    // Atualizar sentVia se for WhatsApp ou Email
    if (data.type === "WHATSAPP" && !quote.sentAt) {
      updateData.sentVia = "whatsapp";
      updateData.sentAt = new Date();
    } else if (data.type === "EMAIL" && !quote.sentAt) {
      updateData.sentVia = "email";
      updateData.sentAt = new Date();
    }

    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: updateData,
    });

    // Gravar no AuditLog para histórico persistente
    const actionMap: Record<string, string> = {
      WHATSAPP: "WHATSAPP_SENT",
      CALL: "CALLED",
      EMAIL: "EMAILED",
      VISIT: "VISITED",
      NOTE: "FOLLOW_UP",
    };

    const logEntry = await prisma.auditLog.create({
      data: {
        companyId,
        userId: session.user.id,
        entityType: "Quote",
        entityId: quoteId,
        action: actionMap[data.type] || "FOLLOW_UP",
        newData: {
          type: data.type,
          direction: data.direction,
          notes: data.notes,
          outcome: data.outcome,
          nextFollowUpAt: data.nextFollowUpAt,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    }).catch((err: any) => {
      // AuditLog pode não ter o action correto, mas não bloquear o fluxo
      console.warn("Não foi possível gravar no AuditLog:", err?.message);
      return null;
    });

    return NextResponse.json(
      {
        data: {
          id: logEntry?.id || `temp-${Date.now()}`,
          type: data.type,
          direction: data.direction,
          notes: data.notes,
          outcome: data.outcome,
          nextFollowUpAt: data.nextFollowUpAt,
          createdAt: new Date().toISOString(),
          user: { id: session.user.id, name: session.user.name || "Usuário" },
        },
        quote: {
          contactCount: (quote.contactCount || 0) + 1,
          lastContactAt: new Date().toISOString(),
          followUpDate: data.nextFollowUpAt || updated.followUpDate?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
