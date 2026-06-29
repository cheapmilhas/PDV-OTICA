/**
 * Chave canônica de telefone BR para CASAR contato do WhatsApp com Customer.
 *
 * Diferente de `normalizePhoneBR` (que produz o formato da Evolution "55DDD…"
 * para ENVIAR), aqui o objetivo é COMPARAR: reduzir qualquer grafia (máscara,
 * DDI, com/sem 9º dígito) a uma chave estável = DDD (2) + 8 dígitos do miolo.
 *
 * Por que descartar o 9º dígito do celular: o acervo legado tem o mesmo número
 * gravado às vezes com 9, às vezes sem; o miolo de 8 dígitos é o que não muda.
 * Por que EXIGIR DDD: comparar só os 8 dígitos casaria clientes de cidades
 * diferentes (cross-DDD) — falso-positivo perigoso. A chave SEMPRE inclui o DDD.
 *
 * Helper PURO (sem I/O). Fail-safe: entrada inválida → null (nunca lança).
 */

/**
 * Reduz um telefone BR à chave canônica "DDDmmmmmmmm" (10 chars) ou null.
 * - tira tudo que não é dígito
 * - remove o DDI 55 quando presente (12-13 dígitos)
 * - aceita 10 díg (DDD + 8 = fixo OU celular sem o 9) e 11 díg (DDD + 9 + 8 = celular)
 * - no caso de 11 díg, descarta o 9º dígito (o primeiro após o DDD) se for "9"
 */
export function phoneMatchKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  // Remove DDI 55 (Brasil) quando o tamanho indica que ele está presente.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Agora deve ser 10 (DDD+8) ou 11 (DDD+9+8). Qualquer outro tamanho = inválido.
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2); // 9 dígitos
    // Celular: o 1º dígito do miolo é o 9 extra → descarta para o miolo de 8.
    const core = rest.startsWith("9") ? rest.slice(1) : rest.slice(-8);
    return ddd + core;
  }
  if (digits.length === 10) {
    return digits; // DDD + 8 (fixo ou celular sem o 9) — já é a chave
  }
  return null;
}

/** True se os dois telefones reduzem à MESMA chave canônica (ambos válidos). */
export function phoneMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  return ka !== null && ka === kb;
}
