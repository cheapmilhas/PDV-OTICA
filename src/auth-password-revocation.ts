/**
 * Decisão pura de revogação de sessão por troca de senha.
 *
 * Usada no callback jwt (auth.ts, bloco M12): quando o usuário troca a senha via
 * reset self-service, gravamos `User.passwordChangedAt`. Todo token emitido ANTES
 * dessa data pertence a uma sessão anterior à troca e deve cair. O baseline no
 * token (`token.passwordChangedAt`) é fixado no login e NUNCA reescrito a partir
 * do `fresh` — senão a comparação sempre daria "iguais" e nada revogaria.
 *
 * @param tokenPasswordChangedAt valor gravado no JWT no login (epoch ms | null | undefined).
 * @param freshPasswordChangedAt valor atual no banco (Date | null | undefined).
 * @returns true se a sessão deve ser revogada (senha mudou depois do login).
 */
export function shouldRevokeForPasswordChange(
  tokenPasswordChangedAt: number | null | undefined,
  freshPasswordChangedAt: Date | null | undefined
): boolean {
  // Sem troca de senha registrada no banco → nada a revogar.
  if (!freshPasswordChangedAt) return false;

  const freshMs = freshPasswordChangedAt.getTime();

  // Token sem baseline (login anterior à existência do campo, ou nunca setado):
  // se o banco tem uma troca registrada, o token é necessariamente anterior a ela
  // → revoga. (Contas que nunca trocaram a senha caem no early-return acima.)
  if (tokenPasswordChangedAt === null || tokenPasswordChangedAt === undefined) {
    return true;
  }

  // Revoga só se a troca no banco é ESTRITAMENTE mais nova que o baseline do token.
  return freshMs > tokenPasswordChangedAt;
}
