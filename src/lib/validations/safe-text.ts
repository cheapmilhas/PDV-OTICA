import { z } from "zod";

/**
 * Validação de TEXTO SEGURO na ENTRADA — complemento de `escape-html.ts`
 * (que protege na saída). Nomes de empresa/filial e afins são texto plano:
 * não devem conter marcação HTML. Rejeitar `<`/`>` na entrada impede que um
 * payload como `<script>…` ou um overlay `<div style="position:fixed">…`
 * (XSS/clickjacking armazenado) chegue ao banco — defesa em profundidade
 * que não depende de todo sink de saída lembrar de escapar.
 *
 * Escolha consciente: BLOQUEAR (rejeitar com 400) em vez de silenciosamente
 * stripar. Um nome de ótica legítimo nunca tem `<`/`>`; se tiver, é erro ou
 * ataque — melhor o usuário ver a mensagem do que gravarmos algo mutilado.
 */

/** Verdadeiro se o texto contém qualquer indício de marcação HTML. */
export function containsHtml(value: string): boolean {
  // `<` ou `>` já bastam para marcação; também pega entidades e protocolos perigosos.
  return /[<>]/.test(value) || /&#|javascript:|data:text\/html/i.test(value);
}

/**
 * Schema Zod para um nome/texto curto de exibição: obrigatório, aparado,
 * com limite de tamanho e sem HTML. Use em nomes de empresa, filial, rede.
 *
 * @param label Nome do campo para as mensagens de erro (ex.: "Nome da empresa").
 * @param max Tamanho máximo (default 120).
 */
export function safeName(label = "Nome", max = 120) {
  return z
    .string({ error: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`)
    .max(max, `${label} deve ter no máximo ${max} caracteres`)
    .refine((v) => !containsHtml(v), {
      message: `${label} não pode conter HTML ou caracteres < >`,
    });
}

/**
 * Versão para texto livre mais longo e opcional (notas, endereço, descrição):
 * sem HTML, com limite generoso. Vazio/ausente vira `undefined`.
 */
export function safeFreeText(label = "Texto", max = 2000) {
  return z
    .string()
    .trim()
    .max(max, `${label} deve ter no máximo ${max} caracteres`)
    .refine((v) => !containsHtml(v), {
      message: `${label} não pode conter HTML ou caracteres < >`,
    })
    .optional()
    .or(z.literal(""));
}
