/**
 * Deep link para o WhatsApp (wa.me) a partir de um telefone do cliente.
 *
 * Puro (sem I/O). Reusa a normalização oficial `normalizePhoneBR` — que valida o
 * comprimento pós-DDI e rejeita lixo — para NUNCA abrir conversa com número
 * errado. O sistema apenas ABRE o WhatsApp; quem envia é a atendente pelo celular.
 */
import { normalizePhoneBR } from "@/lib/whatsapp-phone";

/**
 * Monta `https://wa.me/55DDDNUMERO` a partir de um telefone BR.
 * Retorna null se o telefone for inválido/ausente (o chamador esconde o botão).
 */
export function buildWaMeUrl(phone?: string | null): string | null {
  if (!phone) return null;
  const normalized = normalizePhoneBR(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}
