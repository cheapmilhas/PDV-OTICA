/**
 * Validação PURA das faixas de grau — fonte única, alinhada ao Zod backend
 * (`prescription.schema.ts`). Usada pelo `PrescriptionGradeForm` (front) para
 * feedback visual, garantindo que o front aceite exatamente o que o backend.
 *
 * Aceita vírgula decimal ("-1,75"). Todos os campos são opcionais.
 */

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

// Faixas idênticas ao Zod backend (prescription.schema.ts).
const RANGES: Record<string, [number, number, string]> = {
  esf: [-30, 30, "Esférico deve estar entre -30 e +30"],
  cil: [-10, 10, "Cilíndrico deve estar entre -10 e +10"],
  eixo: [0, 180, "Eixo deve estar entre 0 e 180"],
  add: [0.5, 4, "Adição deve estar entre +0,50 e +4,00"],
  dnp: [20, 80, "DNP deve estar entre 20 e 80"],
  altura: [10, 40, "Altura deve estar entre 10 e 40"],
};

function checkEye(eye: EyeGrade | null | undefined, lado: string, errors: string[]) {
  if (!eye) return;
  for (const field of Object.keys(RANGES)) {
    const raw = eye[field as keyof EyeGrade];
    const n = toNum(raw);
    if (n === undefined) continue; // vazio = ok
    const [min, max, msg] = RANGES[field];
    if (Number.isNaN(n) || n < min || n > max) {
      errors.push(`${lado}: ${msg}`);
    }
  }
}

export function validateGrade(input: GradeInput): GradeValidationResult {
  const errors: string[] = [];
  checkEye(input.od, "OD", errors);
  checkEye(input.oe, "OE", errors);
  const adicao = toNum(input.adicao);
  if (adicao !== undefined && (Number.isNaN(adicao) || adicao < 0.5 || adicao > 4)) {
    errors.push("Adição deve estar entre +0,50 e +4,00");
  }
  return { ok: errors.length === 0, errors };
}
