# Reset de senha self-service por e-mail — Design

**Data:** 2026-07-11
**Origem:** forja (painel adversarial, Codex=segurança) → brainstorming
**Segurança:** CRÍTICA (reset de senha é vetor de account takeover)

## Contexto

Hoje o "Esqueci minha senha" no login dos lojistas só abre WhatsApp para um número placeholder. Queremos self-service: lojista pede reset → recebe e-mail com link → redefine sozinho.

**Fato central verificado (`auth.ts:64-115`):** no Vis, um **e-mail NÃO identifica uma conta**. E-mail é único por empresa (não global); o mesmo e-mail existe em N empresas com N `passwordHash`. O login faz `findMany` por e-mail e testa a senha contra cada candidato. **A única identidade de uma conta é o `userId` (cuid).** Todo o design grava isso.

## Modelo de token (padrão selector/verifier)

Escolhido no painel sobre o token-hash simples: separa a **chave de busca pública** do **segredo verificável**, então o segredo nunca toca o índice do banco.

```prisma
model PasswordResetToken {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  selector     String    @unique   // público, vai no link, indexável
  verifierHash String              // sha256(verifier) hex — NUNCA o verifier em claro
  expiresAt    DateTime            // now + 1h
  usedAt       DateTime?           // uso único
  createdAt    DateTime  @default(now())
  @@index([userId])
  @@index([expiresAt])
}
```
+ `User`: `passwordResetTokens PasswordResetToken[]` e novo campo **`passwordChangedAt DateTime?`** (para revogação de sessão — ver abaixo).
- **Índice parcial** via migração SQL manual: `CREATE UNIQUE INDEX ... ON "PasswordResetToken"("userId") WHERE "usedAt" IS NULL` — garante ≤1 token vivo por conta (invariante sob concorrência do Neon, que `$transaction` sozinho não garante em READ COMMITTED).
- **SEM** `requestIp`/`requestUa` (PII/LGPD — minimização).
- Migração **aditiva** (tabela nova + coluna nullable + índices) — zero lock em `User`, reversível.

**Token:** `selector = randomBytes(16).base64url` (público), `verifier = randomBytes(32).base64url` (256 bits, secreto). `verifierHash = sha256(verifier)`. Link: `/redefinir-senha?t=<selector>.<verifier>`. Node `crypto` nativo — zero dep nova. **SHA-256, não bcrypt** (entropia 256 bits é inquebrável por brute-force; bcrypt só adicionaria latência e cap de 72 bytes).

## Endpoint 1 — `POST /api/auth/esqueci-senha` `{ email }`

1. **Rate-limit** por `clientIp` E por `email` normalizado (reusa `rate-limit.ts`).
2. `findMany` de `User` com aquele e-mail (case-insensitive), **filtrando contas com e-mail entregável** (exclui `@login`/`@funcionario.interno` — sintéticos, não-entregáveis).
3. Para cada conta: gera par selector/verifier, `deleteMany({ userId, usedAt: null })` + `create` do token (na mesma transação por conta), coleta o link rotulado por `user.company.name`.
4. **1 `sendEmail` INLINE** (chamada direta, fora do cron das 7h — reset não espera até amanhã) com N links, um por loja.
5. **Resposta SEMPRE genérica e idêntica** (existindo ou não a conta): `200 { message: "Se houver uma conta com esse e-mail, enviamos um link de recuperação." }`.
6. **Tempo uniforme** (anti-enumeração por tempo) — estratégia CRAVADA (não "detalhar depois"): responder após um **piso de latência fixo** via `await Promise.all([<trabalho real>, sleep(FIXED_MS)])`, com `FIXED_MS` calibrado ACIMA do p99 do pior caminho (existe com N contas + N create + sendEmail sob Resend lento) — medir na implementação, ~800-1200ms típico; começar com 1200ms e ajustar. O `sendEmail` é **awaited antes de responder** (NÃO fire-and-forget — no serverless da Vercel o trabalho pós-resposta pode ser morto quando a função encerra, e o e-mail nunca sairia). O caminho de código deve ser **simétrico**: mesmo quando não há conta (ou só contas `@login`), executar o análogo do `DUMMY_HASH` do login (`auth.ts:113`) — trabalho descartado — para não criar assimetria de branch observável no tempo.

## Endpoint 2 — `POST /api/auth/redefinir-senha` `{ token, senha }`

0. **Rate limit** por `clientIp` (reusa `rateLimitResponse` de `rate-limit.ts`, ex.: 30/5min como os endpoints sensíveis) — sem isso, o endpoint vira amplificador de `bcrypt.hash` (custo caro). **Invariante declarado:** o `bcrypt.hash` só ocorre no passo 4, DEPOIS de selector+verifier validados (nunca gasta bcrypt antes de achar o token).
1. Valida **força da senha** server-side, regra BINÁRIA (aceita/rejeita): **8 a 72 caracteres** (o teto de 72 é o limite real do bcrypt — bytes além de 72 são truncados silenciosamente; deve casar com o mínimo 8 do `loginSchema` em `auth.ts:19`). O medidor de força é UX client-side; a regra de aceitação server-side é comprimento. (Exigir classes de caractere é decisão futura — v1 = só comprimento.)
2. Split `token` em `selector.verifier`. `findUnique({ selector })`. Se ausente → resposta genérica "link inválido ou expirado".
3. `timingSafeEqual(sha256(verifier), row.verifierHash)` — comparação em tempo constante. Valida `usedAt == null && expiresAt > now`.
4. **Consumo ATÔMICO** dentro de `$transaction`:
   - `UPDATE ... SET usedAt=now() WHERE selector=X AND usedAt IS NULL` retornando contagem → se **0 linhas**, token já consumido (race de duplo-clique) → aborta com "link inválido ou expirado".
   - `bcrypt.hash(senha, 12)` → `user.update({ passwordHash, passwordChangedAt: now })`.
   - `deleteMany` dos demais tokens do `userId` (invalida todos os resets pendentes).
   - `GlobalAudit` (`action: "USER_PASSWORD_RESET_SELF"`), sem segredo no log. ⚠️ **`GlobalAudit.actorId` tem FK para `AdminUser`** (schema `prisma/schema.prisma:2665`) — NÃO pôr o `userId` do lojista ali (violaria a FK e abortaria a transação). Gravar `actorId: null`, `actorType: "USER"` (se o campo existir) e o `userId`/`companyId` reais dentro de `metadata: { userId, companyId, via: "self-service-email" }`.
5. Após sucesso: dispara **e-mail "sua senha foi alterada"** (defesa em profundidade — o titular percebe takeover). Redireciona para `/login` com faixa verde.

## Revogação de sessão (dono pediu — fecha o FATAL do Codex)

Sessão é **JWT** (`strategy: "jwt"`). ⚠️ **NÃO criar um segundo fetch de User.** Já existe o bloco **M12** no `jwt()` callback (`auth.ts:200-254`) que faz `prisma.user.findUnique` a cada **5 min** e aplica claims revalidadas (`applyRevalidatedClaims`). A revogação por senha se encaixa DENTRO desse bloco:
- No login (`jwt` com `user`, ~linha 167), grava `token.passwordChangedAt = user.passwordChangedAt`.
- **Adicionar `passwordChangedAt: true` ao `select` do fetch M12** (`auth.ts:210-223`) — senão a comparação lê `undefined` e a revogação NUNCA dispara (o FATAL fica aberto).
- Dentro do bloco M12 (reusa o mesmo fetch, TTL de 5 min): se `fresh.passwordChangedAt` for mais recente que `token.passwordChangedAt` → `return null` (sessão revogada, cai no login).
- Falha transitória de DB **não desloga** (espelha o cuidado do M12/impersonação).
- **Janela de revogação: até 5 min** (o TTL do M12). Aceitável para reset (não é sessão de impersonação, que usa 60s). Documentar essa janela.

## Páginas (UI)

- **`/esqueci-senha`**: 1 campo ("Seu e-mail"), botão "Enviar link". Após enviar: mensagem genérica acolhedora ("Se houver uma conta com esse e-mail, enviamos um link em alguns minutos — confira também o spam/lixo eletrônico"). Copy NÃO promete tempo exato ("1 minuto" viraria contrato que o piso anti-enumeração pode furar). Becos → "Solicitar novo link" (auto-serviço, sem WhatsApp na v1).
- **`/redefinir-senha?t=`**: **troca o token da URL por estado efêmero ASAP** (lê o `t`, guarda em memória, limpa a URL via `history.replaceState`) + headers `Referrer-Policy: no-referrer` e `Cache-Control: no-store` (Codex: token em query string vaza em histórico/logs/referrer). Campos: nova senha + confirmar, **toggle mostrar/ocultar** (padrão do login redesenhado), **medidor de força client-side**. Mostra pra qual loja/usuário é. Becos: link expirado/usado → "Solicitar novo link".
- **Atualizar `/login`**: o link "Esqueci minha senha" (hoje → WhatsApp placeholder) passa a apontar para `/esqueci-senha`.

## Templates de e-mail

Novos `case` em `src/lib/emails/templates.ts` (molde: `renderInviteEmail` — botão + link copiável):
- `"password-reset"`: assunto "Recuperar acesso ao Vis", botão "Criar nova senha", "vale por 1 hora", rodapé "não pediu? ignore". Se N contas, lista um botão por loja.
- `"password-changed"`: "sua senha foi alterada", horário, "não foi você? fale com o suporte".

## Erros / casos-limite
- E-mail sem conta / só contas `@login` → resposta genérica (não vaza). Copy da página menciona que contas com nome de usuário não recebem reset por e-mail.
- Link expirado / já usado → "link inválido ou expirado" + "solicitar novo link".
- Race de duplo-clique → consumo atômico (0 linhas afetadas = já usado).
- 2 pedidos simultâneos → índice parcial + deleteMany na transação (1 token vivo/conta).
- Falha de e-mail (Resend fora) → o token foi criado; a resposta genérica não revela; usuário pode pedir de novo.

## Testes (vitest)
- Geração: N contas homônimas → N tokens; filtra `@login`; verifierHash é sha256, nunca o verifier em claro.
- Verificação: selector válido + verifier certo → ok; verifier errado → falha (timingSafeEqual); expirado → falha; usado → falha.
- Consumo atômico: 2 consumos concorrentes → só 1 sucede (mock da race).
- Revogação: token JWT com `passwordChangedAt` < `User.passwordChangedAt` → `jwt()` retorna null.
- Anti-enumeração: resposta idêntica p/ e-mail existente e inexistente.
- Reset invalida os demais tokens do userId.

## Decisões conscientes de segurança (registradas, não implícitas)
- **Disclosure multi-tenant no e-mail com N lojas:** listar "Ótica A, Ótica B" com um botão por loja revela, a quem controla o inbox, em quais empresas aquele e-mail tem conta. No Vis o mesmo e-mail pode existir em empresas de donos diferentes (funcionário que passou por 2 óticas-cliente). **Trade-off aceito conscientemente:** o dono legítimo com múltiplas lojas PRECISA distinguir qual redefinir, e quem controla o inbox já é o titular daquele e-mail. Rótulo neutro ("uma loja onde você tem acesso") quebraria a UX. Aceito para v1; reavaliar se surgir caso de abuso.

## Dívida aceita (registrada, não varrida)
- **Rate limit in-memory** reseta no cold start → best-effort. Protege contra burst, não contra atacante distribuído. Vetor de *spam*, não de sequestro (token 256 bits, uso único, 1h). Cobre AMBOS os endpoints. Endurecer com store persistente (Redis/tabela) = próximo passo.
- **Token na query string aparece em logs de acesso** (Vercel/edge registram a query ANTES do JS rodar `replaceState`). O `Referrer-Policy: no-referrer` + `Cache-Control: no-store` + `replaceState` mitigam propagação (histórico/referrer), NÃO o log inicial de servidor. Risco baixo dado uso-único + TTL 1h + consumo atômico. Mover o verifier para corpo de POST fecharia o vetor (v2).
- **Sem cron dedicado de limpeza**: `expiresAt` filtra na leitura (tokens expirados nunca funcionam); um `DELETE WHERE expiresAt < now OR usedAt IS NOT NULL` pode ir no cron de reconcile existente se a tabela incomodar.

## Fora de escopo
- WhatsApp como fallback dos becos (v2, se dados de suporte mostrarem necessidade).
- Bloqueio de senhas comprometidas (haveibeenpwned) — v2.
- Rate limit distribuído (Redis) — dívida acima.
- Reset para contas `@login` (username puro) — não têm e-mail entregável; ficam com o super admin.
