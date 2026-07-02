/**
 * Detecção APROXIMADA de tráfego pago (Sprint 3, #9).
 *
 * ⚠️ NÃO É ROI. A Evolution (WhatsApp não-oficial) não entrega o referral/CTWA do
 * Meta, então não dá pra saber com certeza que um lead veio de um anúncio. O
 * máximo honesto é a MENSAGEM-ISCA: a ótica cadastra as frases que o anúncio pede
 * o cliente a mandar ("quero a oferta", "vi o anúncio"...) e, se a 1ª mensagem do
 * cliente casa alguma, marcamos o lead como "veio de anúncio (aproximado)". O
 * placar SEMPRE mostra a taxa de captura ao lado — nunca vender como decisão de
 * verba. Puro (sem I/O), testável, usado no nascimento do lead pela IA do funil.
 */

/** Normaliza p/ casar isca de forma tolerante: minúsculas, sem acento, sem espaço extra. */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decide se o texto de uma mensagem casa alguma frase-isca do anúncio.
 *
 * - `baitPhrases` vazio/ausente → sempre false (a ótica não ligou a detecção).
 * - Frases em branco são ignoradas (não casam tudo por engano).
 * - Casamento por SUBSTRING normalizada (tolera acento/caixa/espaço). Isca muito
 *   curta (< 3 chars após normalizar) é ignorada — evitaria falso-positivo grosseiro
 *   (ex.: isca "oi" marcaria quase todo mundo como anúncio).
 */
export function isPaidTrafficMessage(
  text: string | null | undefined,
  baitPhrases: ReadonlyArray<string> | null | undefined,
): boolean {
  if (!text || !baitPhrases || baitPhrases.length === 0) return false;
  const haystack = normalize(text);
  if (!haystack) return false;
  for (const raw of baitPhrases) {
    const needle = normalize(raw ?? "");
    if (needle.length < 3) continue; // isca curta demais → ignorada (anti falso-positivo)
    if (haystack.includes(needle)) return true;
  }
  return false;
}
