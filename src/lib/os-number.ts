/**
 * Número de exibição de uma Ordem de Serviço.
 *
 * OS normal:            #001234
 * Garantia:             #001234-G1   (número da OS ORIGINAL + letra + sequência)
 * Retrabalho:           #001234-RT1
 * Erro médico:          #001234-M1
 *
 * O `number` interno da OS continua único/sequencial (constraint do banco). Para
 * garantia/retrabalho/erro médico, a EXIBIÇÃO usa o número da OS original + letra,
 * com uma sequência (warrantySeq) por (original + tipo) para evitar ambiguidade
 * quando há mais de uma garantia da mesma OS.
 */

export interface OsNumberInput {
  id: string;
  number?: number | null;
  isWarranty?: boolean | null;
  isRework?: boolean | null;
  isMedicalError?: boolean | null;
  warrantySeq?: number | null;
  // Número da OS original (vem do include `originalOrder`). Quando ausente,
  // caímos no número próprio (ex.: listagens que não carregam a relação).
  originalOrder?: { number?: number | null } | null;
}

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

/** Letra do tipo de derivação (G/RT/M) ou null se for OS normal. */
export function osTypeLetter(os: OsNumberInput): "G" | "RT" | "M" | null {
  if (os.isMedicalError) return "M";
  if (os.isRework) return "RT";
  if (os.isWarranty) return "G";
  return null;
}

export function osDisplayNumber(os: OsNumberInput): string {
  const letter = osTypeLetter(os);

  // OS normal (ou sem dados de derivação): usa o número próprio.
  if (!letter) {
    return os.number && os.number > 0
      ? `#${pad(os.number)}`
      : `#${os.id.slice(-6).toUpperCase()}`;
  }

  // Garantia/retrabalho/erro médico: prefere o número da OS original.
  const baseNumber = os.originalOrder?.number ?? os.number ?? 0;
  const base = baseNumber > 0 ? pad(baseNumber) : os.id.slice(-6).toUpperCase();
  const seq = os.warrantySeq && os.warrantySeq > 0 ? String(os.warrantySeq) : "";
  return `#${base}-${letter}${seq}`;
}
