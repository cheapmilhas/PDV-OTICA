import { prisma } from "@/lib/prisma";

// Steps padrão criados para toda nova empresa
const DEFAULT_STEPS = [
  { stepKey: "COMPANY_DATA",       title: "Dados da empresa preenchidos",      order: 1, isRequired: true },
  { stepKey: "FIRST_BRANCH",       title: "Primeira filial criada",             order: 2, isRequired: true },
  { stepKey: "FIRST_USER",         title: "Primeiro usuário criado",            order: 3, isRequired: true },
  { stepKey: "PLAN_SELECTED",      title: "Plano selecionado e ativo",          order: 4, isRequired: true },
  { stepKey: "PRODUCTS_IMPORTED",  title: "Produtos cadastrados",               order: 5, isRequired: false },
  { stepKey: "FIRST_SALE",         title: "Primeira venda realizada",           order: 6, isRequired: false },
  { stepKey: "PAYMENT_CONFIGURED", title: "Método de pagamento configurado",    order: 7, isRequired: false },
];

/**
 * Cria checklist de onboarding com os steps padrão para uma empresa.
 * Deve ser chamado logo após a criação da empresa.
 * Falha silenciosa — não quebra o fluxo principal.
 */
export async function createOnboardingChecklist(companyId: string): Promise<void> {
  try {
    await prisma.onboardingChecklist.create({
      data: {
        companyId,
        steps: {
          create: DEFAULT_STEPS.map((step) => ({
            stepKey: step.stepKey,
            title: step.title,
            order: step.order,
            isRequired: step.isRequired,
          })),
        },
      },
    });
  } catch (error) {
    console.error("[OnboardingChecklist] Falha ao criar checklist:", error);
  }
}

/**
 * Marca um step do checklist como concluído.
 * Se todos os steps obrigatórios estiverem concluídos, marca o checklist como completo
 * e atualiza o onboardingStatus da empresa.
 */
export async function completeOnboardingStep(
  companyId: string,
  stepKey: string,
  completedBy: string = "SYSTEM"
): Promise<void> {
  try {
    const checklist = await prisma.onboardingChecklist.findUnique({
      where: { companyId },
      include: { steps: true },
    });
    if (!checklist) return;

    const step = checklist.steps.find((s) => s.stepKey === stepKey);
    if (!step || step.isCompleted) return;

    await prisma.onboardingStep.update({
      where: { id: step.id },
      data: { isCompleted: true, completedAt: new Date(), completedBy },
    });

    // Verifica se todos os steps obrigatórios estão concluídos
    const updatedSteps = checklist.steps.map((s) =>
      s.stepKey === stepKey ? { ...s, isCompleted: true } : s
    );
    const allRequiredDone = updatedSteps
      .filter((s) => s.isRequired)
      .every((s) => s.isCompleted);

    if (allRequiredDone) {
      await prisma.$transaction([
        prisma.onboardingChecklist.update({
          where: { companyId },
          data: { completedAt: new Date() },
        }),
        prisma.company.update({
          where: { id: companyId },
          data: { onboardingStatus: "COMPLETED", onboardingCompletedAt: new Date() },
        }),
      ]);
    } else {
      // Garante que o status está como IN_PROGRESS
      await prisma.company.updateMany({
        where: { id: companyId, onboardingStatus: { notIn: ["IN_PROGRESS", "COMPLETED"] } },
        data: { onboardingStatus: "IN_PROGRESS" },
      });
    }
  } catch (error) {
    console.error("[OnboardingChecklist] Falha ao atualizar step:", error);
  }
}
