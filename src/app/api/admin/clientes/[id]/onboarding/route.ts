import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { completeOnboardingStep } from "@/services/onboarding-checklist.service";

// GET /api/admin/clientes/[id]/onboarding — retorna checklist da empresa
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { companyId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  if (!checklist) return NextResponse.json({ checklist: null });

  const totalRequired = checklist.steps.filter((s) => s.isRequired).length;
  const completedRequired = checklist.steps.filter((s) => s.isRequired && s.isCompleted).length;
  const progressPercent = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  return NextResponse.json({ checklist, progressPercent });
}

// PATCH /api/admin/clientes/[id]/onboarding — marca step como concluído manualmente
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const { stepKey } = await request.json();

  if (!stepKey) return NextResponse.json({ error: "stepKey é obrigatório" }, { status: 400 });

  await completeOnboardingStep(companyId, stepKey, admin.id);

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { companyId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ success: true, checklist });
}
