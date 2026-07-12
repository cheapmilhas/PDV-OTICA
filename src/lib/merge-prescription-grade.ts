/**
 * Merge anti-perda-de-campo para unificar a grade de grau da OS no form
 * compartilhado (`PrescriptionGradeForm`).
 *
 * O form compartilhado emite APENAS o patch `{ od, oe, adicao }`. O estado da OS
 * (nova/editar) é MUITO mais largo: além de od/oe/adicao carrega olhoDominante,
 * pantoscopicAngle, vertexDistance, frameCurvature, tipoLente, material e o bloco
 * de ceratometria. Se o save da OS aplicasse o patch com um spread ingênuo do
 * lado errado (`{ ...patch, ...current }`) ou substituísse o objeto inteiro pelo
 * patch, esses campos clínicos SUMIRIAM silenciosamente — perda de dado de receita.
 *
 * Esta função é o único ponto de merge: sobrepõe SÓ od/oe/adicao vindos do patch
 * e preserva TODAS as demais chaves de `current`. É imutável — retorna um objeto
 * novo, nunca muta `current`. O teste-guarda (`.test.ts`) trava o comportamento
 * antes do refactor da Task 8.
 */
export function mergePrescriptionGrade<T extends { od: unknown; oe: unknown; adicao?: unknown }>(
  current: T,
  patch: { od: unknown; oe: unknown; adicao?: unknown },
): T {
  return {
    ...current,
    od: patch.od,
    oe: patch.oe,
    adicao: patch.adicao,
  };
}
