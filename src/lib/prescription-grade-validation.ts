/**
 * Validação PURA das faixas de grau — fonte única, alinhada ao Zod backend
 * (`prescription.schema.ts`). Usada pelo `PrescriptionGradeForm` (front) para
 * feedback visual, garantindo que o front aceite exatamente o que o backend.
 *
 * Aceita vírgula decimal ("-1,75"). Todos os campos são opcionais.
 */

import { GRADE_RANGES, type GradeRangeField } from "./prescription-grade-ranges";

export interface EyeGrade {
  esf?: string | null;
  cil?: string | null;
  eixo?: string | null;
  dnp?: string | null;
  altura?: string | null;
  add?: string | null;
  prisma?: string | null;
  base?: string | null;
}

export interface GradeInput {
  od?: EyeGrade | null;
  oe?: EyeGrade | null;
  adicao?: string | null;
}

export interface GradeValidationResult {
  ok: boolean;
  errors: string[];
}

function toNum(v: string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Mensagens por campo. As FAIXAS numéricas vêm de GRADE_RANGES (fonte única,
// compartilhada com o backend) — aqui só mora o texto do erro, nunca os limites.
const MESSAGES: Record<GradeRangeField, string> = {
  esf: "Esférico deve estar entre -30 e +30",
  cil: "Cilíndrico deve estar entre -10 e +10",
  eixo: "Eixo deve estar entre 0 e 180",
  add: "Adição deve estar entre +0,50 e +4,00",
  dnp: "DNP deve estar entre 20 e 80",
  altura: "Altura deve estar entre 10 e 40",
};

function checkEye(eye: EyeGrade | null | undefined, lado: string, errors: string[]) {
  if (!eye) return;
  for (const field of Object.keys(MESSAGES) as GradeRangeField[]) {
    const raw = eye[field as keyof EyeGrade];
    const n = toNum(raw);
    if (n === undefined) continue; // vazio = ok
    const [min, max] = GRADE_RANGES[field];
    if (Number.isNaN(n) || n < min || n > max) {
      errors.push(`${lado}: ${MESSAGES[field]}`);
    }
  }
}

export function validateGrade(input: GradeInput): GradeValidationResult {
  const errors: string[] = [];
  checkEye(input.od, "OD", errors);
  checkEye(input.oe, "OE", errors);
  const adicao = toNum(input.adicao);
  const [addMin, addMax] = GRADE_RANGES.add;
  if (adicao !== undefined && (Number.isNaN(adicao) || adicao < addMin || adicao > addMax)) {
    errors.push(MESSAGES.add);
  }
  return { ok: errors.length === 0, errors };
}
