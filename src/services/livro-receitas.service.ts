import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";

/**
 * Livro de Receitas — camada de dados PURA (Fase 1).
 *
 * Esta função NÃO está ligada a nenhuma rota nem tela. Ela só cria/atualiza
 * o espelho relacional da receita (`Prescription` + `PrescriptionValues`),
 * que o futuro Livro de Receitas vai LER. Sem efeitos colaterais fora do banco.
 *
 * Mapa de campos (JSON da OS  →  colunas relacionais de PrescriptionValues):
 *   od.esf    → odSph      | oe.esf    → oeSph
 *   od.cil    → odCyl      | oe.cil    → oeCyl
 *   od.eixo   → odAxis     | oe.eixo   → oeAxis
 *   od.add    → odAdd      | oe.add    → oeAdd     (top-level `adicao` = fallback)
 *   od.prisma → odPrism    | oe.prisma → oePrism
 *   od.base   → odBase     | oe.base   → oeBase
 *   od.dnp    → pdFar (OD) | oe.dnp    → pdNear (OE)  *ver nota abaixo
 *   od.altura → fittingHeightOd | oe.altura → fittingHeightOe
 *
 * Nota DNP: o JSON da OS guarda DNP por olho (od.dnp / oe.dnp), mas o model
 * relacional só tem pdFar/pdNear (DP longe/perto), não DP por olho. Mapeamos
 * od.dnp→pdFar e oe.dnp→pdNear como melhor-esforço para não perder o dado.
 * Refinar esse mapeamento (talvez colunas pdOd/pdOe) fica pra fase de UI.
 */

/** Um olho da receita, no formato do JSON da OS. */
export interface EyeValuesInput {
  esf?: number | string | null;
  cil?: number | string | null;
  eixo?: number | string | null;
  dnp?: number | string | null;
  altura?: number | string | null;
  add?: number | string | null;
  prisma?: number | string | null;
  base?: string | null;
}

export interface UpsertPrescriptionInput {
  /** Multi-tenant (obrigatório). */
  companyId: string;
  branchId?: string | null;
  /** Cliente/titular da receita (quem paga). Obrigatório. */
  customerId: string;
  /** Usuário que registrou (opcional). */
  createdByUserId?: string | null;
  doctorId?: string | null;

  /** Datas: data da receita (default: agora). Expira em +12 meses se ausente. */
  issuedAt?: Date | string | null;
  expiresAt?: Date | string | null;

  /** Paciente/dependente: quem USA a receita, se != titular. */
  isDependente?: boolean;
  patientName?: string | null;
  patientBirthDate?: Date | string | null;

  /** Foto arquivada (só o caminho/URL; storage não é desta fase). */
  prescriptionImageUrl?: string | null;
  notes?: string | null;
  prescriptionType?: string | null;

  /**
   * Vínculos de ORIGEM (nullable). A origem é inferida por qual está preenchido:
   * OS (serviceOrderId) | venda direta (saleId) | avulsa (ambos null).
   */
  serviceOrderId?: string | null;
  saleId?: string | null;

  /** Grau por olho, no formato do JSON da OS. */
  od?: EyeValuesInput | null;
  oe?: EyeValuesInput | null;
  /** Adição global (fallback quando od.add/oe.add ausentes). */
  adicao?: number | string | null;

  /**
   * Chave de upsert: se passado, atualiza a receita existente; senão cria nova.
   * (A Fase 1 não infere upsert por vínculo — a rota futura decide o id.)
   */
  id?: string | null;
}

/** Converte "" / null / undefined → undefined; número/numérico → number. */
function num(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Converte "" / null / undefined → undefined; string → trimmed string. */
function str(v: string | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function toDate(v: Date | string | null | undefined): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Monta o objeto de valores relacionais a partir do JSON da OS. */
function buildValues(input: UpsertPrescriptionInput) {
  const od = input.od ?? {};
  const oe = input.oe ?? {};
  const adicao = num(input.adicao);

  return {
    odSph: num(od.esf),
    odCyl: num(od.cil),
    odAxis: num(od.eixo),
    odAdd: num(od.add) ?? adicao,
    odPrism: num(od.prisma),
    odBase: str(od.base),
    oeSph: num(oe.esf),
    oeCyl: num(oe.cil),
    oeAxis: num(oe.eixo),
    oeAdd: num(oe.add) ?? adicao,
    oePrism: num(oe.prisma),
    oeBase: str(oe.base),
    pdFar: num(od.dnp),
    pdNear: num(oe.dnp),
    fittingHeightOd: num(od.altura),
    fittingHeightOe: num(oe.altura),
  };
}

/**
 * Status derivado: COMPLETA se há QUALQUER valor de grau; senão AGUARDANDO_GRAU.
 * Mantém a regra simples e explícita — a UI futura pode endurecer (ex.: exigir
 * esférico de ambos os olhos) sem mudar a camada de dados.
 */
function deriveStatus(values: Record<string, unknown>): "AGUARDANDO_GRAU" | "COMPLETA" {
  const hasAnyGrade = Object.values(values).some((v) => v !== undefined && v !== null);
  return hasAnyGrade ? "COMPLETA" : "AGUARDANDO_GRAU";
}

/**
 * Cria ou atualiza uma receita no Livro de Receitas (espelho relacional).
 * PURA: só toca no banco. Não dispara e-mail, log de IA, OS, nada.
 */
export async function upsertPrescription(input: UpsertPrescriptionInput) {
  if (!input.companyId) throw new Error("companyId é obrigatório");
  if (!input.customerId) throw new Error("customerId é obrigatório");

  const issuedAt = toDate(input.issuedAt) ?? new Date();
  const expiresAt = toDate(input.expiresAt) ?? addMonths(issuedAt, 12);
  const values = buildValues(input);
  const status = deriveStatus(values);

  const base = {
    branchId: input.branchId ?? undefined,
    doctorId: input.doctorId ?? undefined,
    issuedAt,
    expiresAt,
    prescriptionType: str(input.prescriptionType),
    notes: str(input.notes),
    status,
    prescriptionImageUrl: str(input.prescriptionImageUrl),
    isDependente: input.isDependente ?? false,
    patientName: str(input.patientName),
    patientBirthDate: toDate(input.patientBirthDate),
    serviceOrderId: input.serviceOrderId ?? undefined,
    saleId: input.saleId ?? undefined,
  };

  const doUpdate = (id: string) =>
    prisma.prescription.update({
      where: { id },
      data: {
        ...base,
        values: { upsert: { create: values, update: values } },
      },
      include: { values: true },
    });

  const doCreate = () =>
    prisma.prescription.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        createdByUserId: input.createdByUserId ?? undefined,
        ...base,
        values: { create: values },
      },
      include: { values: true },
    });

  // 1) id explícito → UPDATE direto.
  if (input.id) return doUpdate(input.id);

  // 2) Upsert por saleId: 1 venda → 1 receita. Procura antes de criar para não
  //    duplicar (reedição, lente+exame, disparos concorrentes pós-commit).
  if (input.saleId) {
    const found = await prisma.prescription.findUnique({
      where: { saleId: input.saleId },
      select: { id: true },
    });
    if (found) return doUpdate(found.id);

    try {
      return await doCreate();
    } catch (e) {
      // Corrida: outro disparo criou a receita desta venda entre o find e o create.
      // P2002 no unique de saleId → tratar como idempotente e atualizar a existente.
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        const racer = await prisma.prescription.findUnique({
          where: { saleId: input.saleId },
          select: { id: true },
        });
        if (racer) return doUpdate(racer.id);
      }
      throw e;
    }
  }

  // 3) Sem id e sem saleId (receita avulsa) → CREATE simples.
  return doCreate();
}
