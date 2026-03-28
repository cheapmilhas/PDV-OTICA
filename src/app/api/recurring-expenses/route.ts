import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";

const createSchema = z.object({
  description: z.string().min(3),
  category: z.string(),
  amount: z.number().positive(),
  frequency: z.enum(["MONTHLY", "BIMONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  dayOfMonth: z.number().int().min(1).max(28),
  branchId: z.string().optional(),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
});

function calculateNextDueDate(dayOfMonth: number, frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "BIMONTHLY":
      return new Date(now.getFullYear(), now.getMonth() + 2, dayOfMonth);
    case "QUARTERLY":
      return new Date(now.getFullYear(), now.getMonth() + 3, dayOfMonth);
    case "YEARLY":
      return new Date(now.getFullYear() + 1, now.getMonth(), dayOfMonth);
    default: // MONTHLY
      if (now.getDate() >= dayOfMonth) {
        return new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth);
      }
      return new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  }
}

export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "active";

    const where: Record<string, unknown> = { companyId };
    if (status === "active") where.active = true;
    else if (status === "inactive") where.active = false;

    const items = await prisma.recurringExpense.findMany({
      where,
      orderBy: { dayOfMonth: "asc" },
      include: { supplier: { select: { id: true, name: true } } },
    });

    const data = items.map((i) => ({
      ...i,
      amount: Number(i.amount),
    }));

    const totalMonthly = data
      .filter((i) => i.active && i.frequency === "MONTHLY")
      .reduce((sum, i) => sum + i.amount, 0);

    return NextResponse.json({ data, totalMonthly });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await request.json();
    const data = createSchema.parse(body);

    const nextDueDate = calculateNextDueDate(data.dayOfMonth, data.frequency);

    const item = await prisma.recurringExpense.create({
      data: {
        companyId,
        description: data.description,
        category: data.category as Parameters<typeof prisma.recurringExpense.create>[0]["data"]["category"],
        amount: data.amount,
        frequency: data.frequency,
        dayOfMonth: data.dayOfMonth,
        branchId: data.branchId || null,
        supplierId: data.supplierId || null,
        notes: data.notes || null,
        nextDueDate,
      },
    });

    return NextResponse.json({ data: { ...item, amount: Number(item.amount) } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
