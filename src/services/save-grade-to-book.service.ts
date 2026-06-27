import { prescriptionService } from "./prescription.service";
import { upsertPrescription, type EyeValuesInput } from "./livro-receitas.service";
import { notFoundError } from "@/lib/error-handler";

export interface SaveGradeInput {
  od?: EyeValuesInput | null;
  oe?: EyeValuesInput | null;
  adicao?: number | string | null;
  isDependente?: boolean;
  patientName?: string | null;
  patientBirthDate?: Date | string | null;
}

/**
 * Grava o grau (e dados de paciente/dependente) numa receita JÁ existente do
 * Livro, pelo writer único `upsertPrescription`. Usado pela tela do Livro e pela
 * ficha do cliente (cenário exame puro, sem OS).
 *
 * Busca a receita ANTES (garante tenant via companyId + 404 se não existir) —
 * `upsertPrescription` exige customerId e `doUpdate` não filtra companyId.
 */
export async function saveGradeToBook(
  prescriptionId: string,
  companyId: string,
  input: SaveGradeInput
) {
  const existing = await prescriptionService.getById(prescriptionId, companyId);
  if (!existing) {
    throw notFoundError("Receita não encontrada");
  }

  return upsertPrescription({
    id: existing.id,
    companyId,
    customerId: existing.customerId,
    od: input.od,
    oe: input.oe,
    adicao: input.adicao,
    isDependente: input.isDependente,
    patientName: input.patientName,
    patientBirthDate: input.patientBirthDate,
  });
}
