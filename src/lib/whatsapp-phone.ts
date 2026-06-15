/**
 * Normalização de telefone BR para o formato da Evolution API.
 *
 * Helper puro (sem I/O). Extraído do antigo src/lib/whatsapp.ts ao migrar o
 * envio para o motor por-ótica da Fase B2.
 */

/**
 * Normaliza número BR para o formato Evolution (55 + DDD + número).
 * Aceita: "85999999999", "(85) 99999-9999", "+55 85 99999-9999".
 * Retorna null se o número for inválido.
 */
export function normalizePhoneBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const withoutDdi =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (withoutDdi.length < 10 || withoutDdi.length > 11) return null;

  return `55${withoutDdi}`;
}
