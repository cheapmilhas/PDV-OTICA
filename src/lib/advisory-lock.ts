/**
 * Chave de advisory lock por empresa.
 *
 * 🔑 Vive num módulo compartilhado DE PROPÓSITO: quem serializa operações de
 * cobrança da mesma empresa precisa usar EXATAMENTE a mesma chave. Duas cópias
 * do hash (uma no checkout, outra na conversão de trial) travariam em chaves
 * diferentes e o lock não protegeria nada — as duas transações passariam juntas
 * achando que estavam serializadas.
 *
 * `hashtext` do Postgres devolve int4; aqui derivamos o mesmo tamanho em JS.
 * Use SEMPRE com `pg_advisory_xact_lock` (escopo de transação): advisory lock de
 * SESSÃO sobrevive à tx e, no pooler do Neon em transaction-mode, a conexão
 * pode ser reatribuída deixando o lock preso.
 */
export function advisoryKeyForCompany(companyId: string): number {
  // hash simples e determinístico → int32 (faixa segura para advisory lock).
  let h = 0;
  for (let i = 0; i < companyId.length; i++) {
    h = (Math.imul(31, h) + companyId.charCodeAt(i)) | 0;
  }
  return h;
}
