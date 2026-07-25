# Spec — Entrega 3: Acesso de suporte por código de autorização

**Data:** 2026-07-24
**Status:** spec pós-forja, aguardando aprovação do dono para fatiar/executar
**Origem:** forja (3 criativos + 3 críticos + Codex) — o protocolo original foi reprovado em 5 pontos; esta é a abordagem reforjada.
**Risco:** ALTO — cross-system (Vis ↔ Domus, bancos separados) + toca PHI (116 pacientes reais) + LGPD/CFM. Cada fatia passa por revisão Codex.

## Objetivo

Substituir a impersonação cega por **acesso consentido, temporário, escopado e auditado**: o admin da clínica gera um código no Domus, o operador Vis o resgata no super admin, e ganha uma sessão de suporte no Domus com identidade própria, escopo mínimo e trilha imutável. Sem código do cliente, o operador NÃO acessa o PHI.

## Decisões do dono (2026-07-24)

1. **Identidade do operador = sombra por grant.** Cada sessão de suporte cria um principal efêmero no Domus com `visOperatorRef` opaco (não vaza o ID do operador Vis, não é FK). Sem usuário de suporte persistente no banco clínico.
2. **Escopo v1 = SÓ LEITURA.** O operador vê as telas para diagnosticar; não escreve nada. **Pendência v2:** escrita limitada (allow-list de escrita) fica para uma v2.
3. **Auditoria fail-closed.** Se o Domus não conseguir gravar o evento de auditoria, o acesso é NEGADO. Sem trilha = sem PHI.

## O que a forja MATOU (invariantes de segurança — não violar)

1. **Nunca gerar a sessão com o `userId` do admin da clínica.** Impersonaria o admin, herdaria as permissões dele e a auditoria atribuiria as ações à pessoa errada. → identidade sombra.
2. **Escopo não vem de `usersToClinicsTable`.** `customSession` (auth.ts:41) deriva `clinic` da membership; o operador não tem essa linha. Inserir uma linha fake poluiria o RBAC e escalaria o operador a membro. → escopo **congelado no grant** (`scopeSnapshot`).
3. **Escopo NÃO pode ser deny-list nem viver no middleware.** O `middleware.ts` do Domus roda no Edge e só lê o cookie — não faz query, não vê `isSupportSession`. Deny-list é fail-open para PHI. → **allow-list default-deny** na camada de action/data.
4. **Redeem não é idempotente (≠ F2).** Sem nonce store, um replay dentro dos 5min da janela HMAC gera nova magic URL. → o endpoint M2M cria um **grant atômico** (`UPDATE...WHERE status=ISSUED RETURNING`); a sessão nasce só no consumo do ticket; **persistir o nonce**.
5. **`cookieCache` de 5min do better-auth (auth.ts:98) faz o kill-switch e a expiração mentirem.** O operador seguiria lendo PHI por até 5min após a revogação. → consultar o estado do grant **fora do cache** em toda request de suporte.

## Arquitetura reforjada

### Canal (Vis → Domus)
- Reusar a **primitiva HMAC path-bound** do F2 (`vis-provision-hmac.ts`: assina `version.method.path.nonce.ts.body`, janela 5min, constant-time). NÃO usar o canal de entitlement (`vis-domus-hmac.ts`, só `ts.body`, sem path → replayável cross-endpoint).
- **Segredo próprio** rotacionável (`VIS_DOMUS_SUPPORT_SECRET`), escopado a `support:redeem` — não reusar o segredo do F2 (limita o raio de um vazamento).
- **Nonce store**: persistir `(keyId, path, nonce)` por > 5min para rejeitar replay. Fecha o furo #4 sem inventar 2º esquema de assinatura.

### Lifecycle do código (Domus)
- Reusar o primitivo **`clinic_invites`** (`clinic-invite-token.ts`): raw token de alta entropia, `tokenHash` SHA-256 (lookup único), `expiresAt`, `consumedAt` (single-use), constant-time compare — já em prod, ~80% pronto.
- Código: 10-char Crockford base32 (exibido `XXXXX-XXXXX`), TTL 15min, **um ativo por clínica** via partial unique index.
- Redeem atômico: `UPDATE ... SET consumed_at=now() WHERE consumed_at IS NULL RETURNING` (READ COMMITTED basta — row lock + re-check sob lock; SERIALIZABLE é overkill).
- **Reaper**: expirar códigos não-consumidos (cron ou lazy no generate), senão o partial unique index trava a clínica para sempre.
- Rate limit: 5 tentativas por clínica / 15min.

### Grant + sessão de suporte (Domus)
- Tabela `support_grants` própria (não reusar/alterar a `sessionsTable` do better-auth para a lógica — o better-auth ignoraria a expiração custom): `supportGrantId` (UUID v7, correlação cross-DB), `clinicId`, `visOperatorRef` (opaco, NÃO FK), `authSessionId` (link solto para a sessão better-auth aberta), `scopeSnapshot` (jsonb congelado no open — allow-list de rotas/telas de leitura), `openedAt`, `absoluteExpiresAt` (open+60min, sem renovação), `revokedAt`, `revokedReason`.
- A sessão better-auth é aberta para a identidade sombra (magic URL uso único 60s, ligada ao `supportGrantId`, consumida atomicamente).
- **Enforcement**: guard support-aware server-side (paralelo aos action clients existentes) que, em toda request de suporte, (a) relê o grant do banco **fora do cookieCache**, (b) checa `absoluteExpiresAt` e `revokedAt`, (c) aplica a **allow-list** do `scopeSnapshot`. Default-deny: rota não listada = 403.
- `customSession` estendido para, quando a sessão for de suporte, injetar `clinic` a partir do grant (não da membership) + `isSupportSession` + o escopo.

### Auditoria (Domus, fail-closed)
- Tabela `support_audit` append-only: `REVOKE UPDATE, DELETE` do role da app; INSERT-only.
- Eventos: código gerado, resgatado, expirado, revogado; sessão aberta/fechada; cada request de suporte negada pela allow-list.
- **Fail-closed**: o acesso só prossegue se o evento de auditoria for gravado com sucesso (o `audit.ts` atual engole falhas — o caminho de suporte não pode).
- Authoritative no **Domus** (onde está o PHI). `supportGrantId` correlaciona com o `globalAudit` do Vis por **join ad-hoc** quando um humano investiga (sem job de reconciliação permanente).
- O cliente vê a trilha na própria tela de "Acessos de suporte".

### UX (enxertos de B que sobreviveram)
- Domus: card "Autorizar suporte Vis" (gera código, mostra uma vez, countdown, revogar); banner persistente "Suporte Vis conectado — [ref] — Encerrar acesso" com kill-switch; tela "Acessos de suporte" (histórico) com **recibo pós-sessão** em linguagem simples (o artefato de consentimento LGPD).
- Vis super admin: tela de resgate (colar código → status: aguardando/conectado/expirado) + "Encerrar minha sessão".

## Fatiamento em partes testáveis (ordem)

Cada fatia é um passo atômico, testado e revisado pelo Codex antes de commit. Fatias no Domus tocam PHI → alto risco.

- **F3.1 — Canal + nonce store (Domus + Vis).** Primitiva HMAC path-bound reaproveitada com segredo próprio; nonce store persistido; endpoint `/api/internal/vis/support/redeem` (esqueleto que valida HMAC + nonce, ainda sem lógica de código). Teste: replay rejeitado, assinatura inválida rejeitada, path errado rejeitado.
- **F3.2 — Lifecycle do código (Domus).** Migração `support_codes` (ou reuso de `clinic_invites` com `purpose='support'`), generate (admin da clínica), redeem atômico, reaper. Teste: single-use sob concorrência (não dá 2 grants), 1 ativo por clínica, expiração, rate limit. **NOTA da F3.1 (Codex):** o consumo do nonce hoje autocommita separado; na F3.2 o consumo do nonce + o redeem do código + a criação do grant devem ficar na MESMA transação — senão uma falha após consumir o nonce deixa o request permanentemente queimado (semântica at-most-once irrecuperável). Mover `consumeNonce` para dentro da tx do grant.
- **F3.3 — Grant + sessão sombra + enforcement allow-list (Domus).** `support_grants`, identidade sombra, magic URL 60s single-use, guard support-aware (allow-list read-only, fora do cookieCache), `customSession` estendido. Teste: operador só acessa rotas da allow-list (403 no resto), sessão expira absoluta em 60min, revogação corta na hora (sem lag do cache).
- **F3.4 — Auditoria fail-closed (Domus).** `support_audit` append-only (REVOKE), eventos, fail-closed no caminho de acesso. Teste: sem gravação de auditoria → acesso negado; UPDATE/DELETE na tabela rejeitado.
- **F3.5 — UX Domus.** Card autorizar + banner + kill-switch + tela "Acessos de suporte" + recibo. Teste: fluxo visual ponta a ponta.
- **F3.6 — UX Vis.** Tela de resgate no super admin + encerrar sessão. Teste: colar código → abre sessão; código inválido/expirado → erro claro.
- **F3.7 — E2E sombra + revisão final.** Fluxo completo num par de bancos de teste: gerar → resgatar → acessar (só leitura) → revogar → conferir trilha. Codex challenge final adversarial.

## Verificação ponta a ponta
Cliente gera código no Domus → operador insere no Vis → acesso concedido (só leitura), escopado e auditado; sem código, negado; revogação corta imediatamente; toda ação do operador aparece na trilha imutável que o cliente vê.

## Pendências registradas (v2 / follow-up)
- **v2: escrita limitada** — allow-list de escrita para o operador corrigir configs/dados não-clínicos (decisão do dono: v1 é só leitura).
- Guards de backend do B4 (impersonate/resync ainda acessíveis por chamada direta para medical) — follow-up separado da Entrega 2.
- Ligar `MEDICAL_INVITE_EMAIL_ENABLED` (A3) — ação de infra do dono.

## Riscos aceitos com mitigação
- Allow-list pode esquecer uma tela que o suporte legitimamente precisa → começa mínima, amplia sob demanda (fail-closed é o lado certo de errar).
- Auditoria no Domus separada do Vis → `supportGrantId` reconcilia quando um humano precisar, sem job permanente.
- Reaper é ponto único de "destravar a clínica" → cobrir com teste e também expirar lazily no generate (não depender só do cron).
