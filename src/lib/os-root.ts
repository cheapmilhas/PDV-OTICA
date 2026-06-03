/**
 * Resolve o ID da OS-RAIZ de uma família de derivações.
 *
 * Garantia/retrabalho/erro médico compartilham o número-base da OS original
 * (ex.: #000015, #000015-RT, #000015-G). Para isso, toda derivação deve apontar
 * `originalOrderId` à RAIZ — não ao pai imediato. Sem isso, criar uma garantia
 * a partir de um retrabalho herdava o número do retrabalho (#000018-G em vez de
 * #000015-G): o número-base "pulava".
 *
 * Se a OS de origem já é uma derivação (tem originalOrderId), a raiz é esse
 * originalOrderId; senão a própria OS é a raiz.
 */
export function resolveRootOrderId(origin: {
  id: string;
  originalOrderId?: string | null;
}): string {
  return origin.originalOrderId ?? origin.id;
}
