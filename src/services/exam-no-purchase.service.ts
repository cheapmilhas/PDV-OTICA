import { prisma } from "@/lib/prisma";
import { firstName, humanWait } from "@/lib/today-queue";

/**
 * "Fez exame e não comprou" (Sprint 3, #10) — a lista de clientes que fizeram o
 * exame de vista AQUI (pagaram por ele) mas NÃO voltaram pra comprar os óculos.
 * É "dinheiro que escapou": o cliente confiou o exame à ótica e comprou a armação
 * fora. Recuperação MANUAL, reusa o botão "Reofertar" da aba Recuperar (#7).
 *
 * Sinal do exame = FATO, não palpite: existe venda COMPLETED com item marcado
 * `product.isEyeExam = true`. (Intenção capturada da conversa pela IA é sinal
 * mais fraco e fica de fora — mistura "pagou" com "talvez nem veio".)
 *
 * Regra (por cliente com customerId):
 *  - fez exame na JANELA recente (`windowDays`, p/ ser acionável — exame de 2 anos
 *    atrás não é resgate), E
 *  - NÃO tem venda COMPLETED de armação/lente com data >= a do exame (não comprou
 *    os óculos depois do exame).
 *
 * Multi-tenant: companyId em todo filtro. Sem migração (cruza dados existentes).
 */

/** Tipos de produto que caracterizam "os óculos" (armação/lente/óculos de sol). */
const EYEWEAR_TYPES = [
  "FRAME",
  "OPHTHALMIC_LENS",
  "CONTACT_LENS",
  "SUNGLASSES",
  "LENS_SERVICE",
];

/** Janela padrão: exames dos últimos 120 dias ainda valem um empurrão. */
export const EXAM_WINDOW_DAYS = 120;

export interface ExamNoPurchaseRow {
  customerId: string;
  name: string;
  phone: string | null;
  /** "há X dias" desde o exame — pra priorizar o resgate mais fresco. */
  examAgo: string;
  /** Horas desde o exame (ordenação: mais recente primeiro = maior chance). */
  hoursSinceExam: number;
  draftText: string;
}

/** Rascunho de reoferta específico do exame — caloroso, sem pressão. */
export function examReofferDraft(name: string): string {
  return `Oi ${firstName(name)}! 😊 Vi que você fez seu exame com a gente. Que tal já garantir seus óculos aqui? Temos uma condição especial pra fechar com você!`;
}

export async function listExamNoPurchase(
  companyId: string,
  branchId: string | null,
  now: Date = new Date(),
  windowDays: number = EXAM_WINDOW_DAYS,
): Promise<ExamNoPurchaseRow[]> {
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // 1) Vendas de EXAME na janela (COMPLETED, com item isEyeExam, cliente vinculado).
  // Guarda a data do exame MAIS RECENTE por cliente (o gatilho mais fresco).
  const examSales = await prisma.sale.findMany({
    where: {
      companyId,
      ...(branchId ? { branchId } : {}),
      status: "COMPLETED",
      deletedAt: null,
      customerId: { not: null },
      createdAt: { gte: windowStart },
      items: { some: { product: { isEyeExam: true } } },
    },
    select: { customerId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // customerId → data do exame mais recente (o findMany já vem desc; ficamos com a 1ª).
  const examAtByCustomer = new Map<string, Date>();
  for (const s of examSales) {
    if (!s.customerId) continue;
    if (!examAtByCustomer.has(s.customerId)) examAtByCustomer.set(s.customerId, s.createdAt);
  }
  if (examAtByCustomer.size === 0) return [];

  const examCustomerIds = [...examAtByCustomer.keys()];

  // 2) Desses clientes, quais JÁ compraram óculos (armação/lente) DEPOIS do exame?
  // Uma query só: vendas COMPLETED de óculos desses clientes, a partir do windowStart.
  // (Filtramos "depois do exame" em memória, por cliente, com a data do exame dele.)
  //
  // ⚠️ DECISÃO DE ESCOPO (deliberada): a lista de EXAMES é filtrada por filial (o
  // gerente escolhe qual filial trabalhar), mas a checagem "comprou óculos" é
  // COMPANY-WIDE de propósito — sem branchId. Se o cliente fez o exame na filial A
  // e comprou os óculos na filial B (mesma empresa), a empresa NÃO perdeu a venda:
  // não faz sentido reofertar. Company-wide evita incomodar quem já é cliente.
  const eyewearSales = await prisma.sale.findMany({
    where: {
      companyId,
      status: "COMPLETED",
      deletedAt: null,
      customerId: { in: examCustomerIds },
      createdAt: { gte: windowStart },
      items: { some: { product: { type: { in: EYEWEAR_TYPES as never } } } },
    },
    select: { customerId: true, createdAt: true },
  });

  // Cliente comprou óculos se tem venda de óculos com data >= a do seu exame. O
  // `>=` (não `>`) trata o caso comum "exame + óculos na MESMA venda": a venda
  // única casa as duas queries com createdAt idêntico → conta como comprou.
  // (Neste sistema exame+óculos ficam sempre no MESMO registro Sale — há um único
  // sale.create por checkout, com vários SaleItems; a OS é side-effect, não 2ª venda.)
  const boughtEyewear = new Set<string>();
  for (const s of eyewearSales) {
    if (!s.customerId) continue;
    const examAt = examAtByCustomer.get(s.customerId);
    if (examAt && s.createdAt >= examAt) boughtEyewear.add(s.customerId);
  }

  // 3) Sobrou: fez exame, NÃO comprou óculos depois. Busca nome/telefone.
  const targetIds = examCustomerIds.filter((id) => !boughtEyewear.has(id));
  if (targetIds.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { id: { in: targetIds }, companyId },
    select: { id: true, name: true, phone: true },
  });

  const hoursSince = (d: Date): number => (now.getTime() - d.getTime()) / 3600_000;

  return customers
    .map((c) => {
      const examAt = examAtByCustomer.get(c.id)!;
      const h = hoursSince(examAt);
      const name = c.name?.trim() || "Cliente";
      return {
        customerId: c.id,
        name,
        phone: c.phone || null,
        examAgo: humanWait(h),
        hoursSinceExam: h,
        draftText: examReofferDraft(name),
      };
    })
    // Mais recente primeiro: quem fez o exame há pouco tem mais chance de fechar.
    .sort((a, b) => a.hoursSinceExam - b.hoursSinceExam);
}
