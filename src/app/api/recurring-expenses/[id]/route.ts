import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";
import { AccountCategory } from "@prisma/client";

const updateSchema = z.object({
  description: z.string().min(3).optional(),
  category: z.string().optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["MONTHLY", "BIMONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

function calculateNextDueDate(dayOfMonth: number, frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "BIMONTHLY": return new Date(now.getFullYear(), now.getMonth() + 2, dayOfMonth);
    case "QUARTERLY": return new Date(now.getFullYear(), now.getMonth() + 3, dayOfMonth);
    case "YEARLY":    return new Date(now.getFullYear() + 1, now.getMonth(), dayOfMonth);
    default:
      return now.getDate() >= dayOfMonth
        ? new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
        : new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const existing = await prisma.recurringExpense.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const updateData: Record<string, unknown> = { ...data };
    if (data.category) updateData.category = data.category as AccountCategory;
    if (data.dayOfMonth || data.frequency) {
      updateData.nextDueDate = calculateNextDueDate(
        data.dayOfMonth ?? existing.dayOfMonth,
        data.frequency ?? existing.frequency
      );
    }

    const updated = await prisma.recurringExpense.update({
      where: { id },
      data: updateData as Parameters<typeof prisma.recurringExpense.update>[0]["data"],
    });

    return NextResponse.json({ data: { ...updated, amount: Number(updated.amount) } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const existing = await prisma.recurringExpense.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    await prisma.recurringExpense.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
