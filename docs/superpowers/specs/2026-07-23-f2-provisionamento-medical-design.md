# F2+ — Provisionamento e onboarding de clínicas Medical (paridade com ótica)

**Data:** 2026-07-23 · **Fase:** F2 da unificação VIS+Medical, expandida para absorver F3 (domínio) e F4 (auto-cadastro), a pedido do dono.
**Plano-mãe:** `2026-07-22-unificacao-operadora-arquitetura.md` · **Antecede:** F1 (`2026-07-22-f1-superadmin-product-aware.md`, EM PROD).
**Processo:** passou por painel adversarial (forja): 3 críticos (segurança/tenancy, custo/YAGNI, modelo de dados) + Codex como 4ª voz independente. Abordagem vencedora = "C corrigida" (durável + fast-path + convite).

---

## 1. Objetivo (o que "pronto" significa)

Um cliente Vis Medical passa a ser criado das MESMAS duas formas que a ótica — **auto-cadastro no site (com trial)** e **criação pelo super admin** — e o cliente opera pela URL **`medical.vis.app.br`** (o sistema clínico, Domus). Hoje só o super admin cria a Company, e a clínica no Domus é feita por **script manual** (`link-domus-clinic.cjs` + `sombra-e2e-3-domus-insert.ts`). A F2+ automatiza o provisionamento cross-sistema, com onboarding do admin da clínica por convite (senha nunca transita entre os dois bancos).

**Entrega em 3 marcos sobre um motor comum**, cada um validável isoladamente. O destino é o pedido do dono; o faseamento evita um big-bang que toca PHI + 2 sistemas + funil público de uma vez.

### Não-objetivos (explícitos)
- **Não tocar a clínica Domus existente** ("Domus Saude", clinicId `7110db1b-528b-4451-a2c4-3581f370b9df`, 116 pacientes reais/PHI). A F2+ vale só para clínicas NOVAS. A idempotência protege caso alguém dispare provision nela por engano (nada é sobrescrito).
- **Não construir clinic switcher** no Domus (login fixa `clinics[0]`). Mitigado garantindo que o admin provisionado seja usuário NOVO com um único vínculo. Switcher é fase futura.
- **Não mexer no health score** (fica "indisponível" para medical, decisão da F1). Feed real = F6.
- **Não indexar** `medical.vis.app.br` nesta fase (noindex; indexação vem com marketing do funil).

---

## 2. Estado atual verificado (base factual — não re-explorar)

### 2.1 Dois sistemas, dois bancos, dois repositórios
- **Vis** (`/Users/matheusreboucas/PDV OTICA`): Next.js 16 + Prisma + Postgres. Control plane (Company, Subscription, Plan, billing, admin). A F1 deixou o admin product-aware.
- **Domus** (`/Users/matheusreboucas/SISTEMACLINICADOMUS`): Next.js 16 + **Drizzle** + Postgres Neon + **better-auth**. Data plane clínico (PHI/CFM). Multi-tenant por `clinicId` num banco ÚNICO (isolamento lógico, não físico).

### 2.2 Como a ótica cria hoje (o que espelhar) — verificado
- **Auto-cadastro público:** `/registro` (wizard 3 passos) → `POST /api/public/register` → 1 tx Prisma cria Company+Branch+User(admin, bcrypt 10)+UserBranch+Subscription(**sempre TRIAL**, `trialEndsAt = now + plan.trialDays`)+finance setup+CompanySettings+audit. Cliente **define senha no cadastro**, vai pro `/login`. CNPJ **opcional**. Plano hardcoded `platformProduct: VIS_APP` (`register/route.ts:105,110`).
- **Super admin cria:** `POST /api/admin/clientes/create` → já product-aware (pula finance ótico p/ medical, health null, valida plano×produto, aceita `ownerGroupId`). CNPJ obrigatório 14 dígitos. Admin ganha acesso por senha-na-hora OU convite (`Invite` + `EmailQueue` + `/activate?token=`). Subscription TRIAL se `trialDays>0` senão ACTIVE.
- **Duplicação:** os dois handlers repetem a sequência inline. Compartilhado só: `setupCompanyFinance`, `containsHtml`, `resolveProvisionProduct` (`provision-product.ts`). **Não há serviço único de criação de empresa.**
- **Domínio/tenant:** ótica NÃO usa subdomínio. Login único `/login`; empresa vem de `user.companyId`. `TenantDomain` existe no schema mas é código MORTO (só import inerte em `get-tenant.ts`). Proxy = `src/proxy.ts` (não `middleware.ts`).

### 2.3 O que o Domus tem hoje (o que a F2+ estende) — verificado
- **Tenancy (b):** banco único, tabela `clinics` (PK uuid), todo PHI pendura por FK `clinicId` (`patients.clinicId`, `doctors.clinicId`, etc.). Vínculo user↔clínica: `users_to_clinics` (PK composta userId+clinicId, role `admin|doctor|secretary`).
- **Criar clínica hoje = script `sombra-e2e-3-domus-insert.ts`:** 1 tx Drizzle em 5 tabelas — `clinics`, `users`, `accounts`(credencial, scrypt via better-auth `hashPassword`), `users_to_clinics`(admin), `clinic_entitlements`(espelho: PK=clinicId, unique(visCompanyId), writeAllowed, planTier). Idempotência = **recusa** (checa existência e aborta), inadequada para retry.
- **Canal Vis→Domus existente:** `POST /api/internal/vis/entitlements` — **update-only**, retorna **422 clinic_not_found** se a clínica não existe. HMAC `verifyVisDomus` (assina `${ts}.${body}`, janela 5min anti-replay, fail-closed), secret `VIS_DOMUS_WEBHOOK_SECRET`. Núcleo idempotente reutilizável: `applyEntitlementSnapshot` (dedupe por eventId, upsert condicional ordenado por sourceRevision).
- **Auth:** better-auth `emailAndPassword`; `customSession` carrega todos os vínculos e fixa **`clinics[0]`** sem `ORDER BY` — SEM switcher. Admin da clínica = linha `users_to_clinics(role=admin)`.
- **Ambientes:** `.env` (dev/prod) aponta para `ep-odd-credit-...neon.tech` (PROD, 116 pacientes). **`.env.test` aponta para `ep-dawn-haze-...neon.tech` (banco Neon ISOLADO, diferente).** Testes de integração carregam `.env.test` com `NODE_ENV=test`; suíte `tests/vis-entitlements` já testa o canal contra o isolado. **VERIFICADO em primeira mão (hosts distintos).**

### 2.4 Lado Vis do canal (o que a F2+ espelha) — verificado
- `vis-domus-publisher.ts`: publisher HMAC fire-and-forget, best-effort, reparado por pull diário. Pressupõe `Company.domusClinicId` já preenchido (`if (!domusClinicId) return null`) — a criação desse vínculo é o gap da F2.
- `EntitlementRevision`: relógio monotônico por company, **controlado por TRIGGERS** (INSERT Company/Subscription bumpa + enfileira outbox). Migração `20260719140000_entitlement_revision`. Contrato: **a aplicação NÃO escreve essa tabela** (schema.prisma:241).

---

## 3. Abordagem (síntese do painel adversarial)

**Vencedora: "C corrigida"** — provisionamento **durável** via outbox PRÓPRIO no Vis (não reusar o do cadeado de entitlement — acoplamento arriscado) + **fast-path síncrono** (admin vê "provisionado" na hora no caminho feliz) + **convite** (senha nunca transita).

Rejeitadas: **A pura** (síncrono sem durabilidade) — matada pelo crítico de dados + Codex como distribuidamente incorreta (timeout com sucesso remoto → estado ambíguo irreconciliável; idempotência do script é "recusa"). **B pura** (state machine + badges como núcleo) — matada por custo/YAGNI + corrida do último-callback-vence sem `attemptId`.

Enxertos que sobreviveram: de A — zero senha no canal, guard-rail de ambiente (endurecido para host allowlist), fast-path síncrono; de B — badge de status no admin + estados de convite com `attemptId`, SEM tela de status dedicada.

---

## 4. Arquitetura — 3 marcos sobre um motor comum

### Motor comum (fundação): serviço único `createTenantCompany`
Extrai a sequência hoje duplicada (Company→Branch→User→UserBranch→Subscription→CompanySettings→Audit) num serviço parametrizado por `ProvisionProductDecision`. Ambos os endpoints (`/api/public/register` e `/api/admin/clientes/create`) passam a chamá-lo. Para VIS_MEDICAL, além do estado local, o serviço **aloca `domusClinicId` (uuid) e enfileira `ProvisioningOutbox` na MESMA tx**. Não faz rede. Mata a duplicação; a paridade ótica↔medical / público↔admin vira estrutural.

### Marco 1 — Super admin cria e provisiona (motor + lado Domus)

**Máquina de estados** (`Company.provisioningState`, só relevante p/ VIS_MEDICAL):
`NOT_REQUIRED` (ótica) · para medical: `PROVISIONING → PROVISIONED`, ou permanece `PROVISIONING` reintentando · ramo `SUSPENDED` (offboarding). Transição para `PROVISIONED` protegida por **`attemptId`** (tentativa lenta não sobrescreve resultado de rápida — corrida do Codex).

**Fluxo:**
1. **Vis, 1 tx local:** `createTenantCompany` grava Company(VIS_MEDICAL, `domusClinicId`=uuid alocado, `provisioningState=PROVISIONING`) + Subscription + `ProvisioningOutbox`. **NÃO toca `EntitlementRevision`** (triggers cuidam — REQ-1). Commit → cliente completo no lado Vis.
2. **Fast-path síncrono:** POST imediato ao Domus. Sucesso → `PROVISIONED`, admin vê "provisionado ✓".
3. **Worker** drena o outbox e retenta se o fast-path falhou. **Relê do banco a cada tentativa** (nunca assina body do browser — REQ-6).

**Endpoint `POST /api/internal/vis/provision`** (Domus, irmão do `/entitlements`): 1 tx Drizzle atômica cria `clinics` + `users`(admin, SEM senha) + `users_to_clinics`(admin) + `clinic_entitlements`(espelho, mesma tx → mata fail-open) + registra evento `provision:{clinicId}` **na mesma tx**. `accounts` **não** nasce aqui (só no aceite do convite). Idempotente por clinicId/evento. Responde revisão aplicada.

### Marco 2 — Domínio `medical.vis.app.br`
- Configurar `medical.vis.app.br` no projeto Vercel do Domus (domínio + DNS) — mesma app, config não proxy (ADR do plano-mãe).
- **better-auth aceitando as 2 origens** (`app.domussaude.com.br` existente + `medical.vis.app.br` novo).
- **noindex** nesta fase.
- Convite aponta para `medical.vis.app.br/aceitar-convite?token=...` → tela "defina senha" → aceite cria `accounts` via **better-auth nativo** (scrypt correto — mata mismatch, REQ-3) → `/dashboard` na clínica DO TOKEN.
- **Trava:** aceite resolve a clínica pelo `clinicId` do TOKEN, **nunca** `session.clinic[0]`.

### Marco 3 — Auto-cadastro público com trial (paridade)
- `/registro` Medical (ou o `/registro` existente parametrizado por produto — decidir na implementação por menor duplicação) usando o motor comum.
- Cria Company VIS_MEDICAL + Subscription **TRIAL** (`trialEndsAt = now + plan.trialDays`) → dispara o mesmo provisionamento do Marco 1.
- **Plano:** só planos medical self-service (`medical-profissional` R$89,90, `medical-clinica` R$189,90, `selfServiceSelectable=true`). Guard do P0 mantido: funil de ótica nunca serve plano medical e vice-versa. **NUNCA filtrar por selfServiceSelectable no funil de ótica** (planos de ótica são todos `false` em prod).
- **CPF ou CNPJ** aceito (medical); ótica continua só CNPJ.
- Fim do cadastro → fluxo de convite → `medical.vis.app.br` (não o `/login` do Vis).
- **Branding por produto** no funil e e-mails (hoje checkout/e-mails dizem "PDV Ótica" — genérico).

---

## 5. Requisitos duros (achados pelo painel, confirmados no código)

**REQ-1 — Nunca gravar `EntitlementRevision` manualmente.** Já é controlada por triggers (INSERT Company/Subscription bumpa). Gravar `=1` colidiria na PK ou regrediria o relógio (contrato schema.prisma:241). O worker LÊ a revisão que os triggers produziram e a envia no payload.

**REQ-2 — Colisão de email = 409 identity_conflict.** Se o email do admin já existe no Domus com vínculo a OUTRA clínica, o provision/convite **recusa** — nunca reusa user automaticamente. Mata o sequestro cross-tenant via `clinics[0]`. (Convergência crítico-segurança + Codex.)

**REQ-3 — Convite: token amarra `(clinicId, email, role, purpose, nonce, exp 72h)`,** armazenado como HASH. O aceite usa `clinicId` do TOKEN, nunca `session.clinic[0]`. Reenvio invalida o token antigo **atomicamente**. Senha nunca transita Vis→Domus; `accounts` nasce via better-auth nativo no aceite (scrypt correto).

**REQ-4 — Evento `provision:{clinicId}` na MESMA tx das 5 tabelas no Domus.** Um entitlement update que chega antes do provision (422) é **retryable**, NUNCA "consumido" como idempotente — senão o evento fica envenenado e nunca aplica. (O receptor atual grava `applied=false` e depois considera qualquer evento existente idempotente — precisa checar `applied`.)

**REQ-5 — `clinic_entitlements` nasce na mesma tx da clínica.** Clínica sem espelho → guard de escrita LIBERA tudo (fail-open, `assert-write-allowed.ts`). Atomicidade fecha a janela.

**REQ-6 — Autorização do ator, não só HMAC.** Payload carrega `requestedByAdminId` + `requestId`. A rota admin já exige SUPER_ADMIN/ADMIN antes de enfileirar; o worker relê do banco e nunca assina body do browser. **Secret de provisioning separado** do de entitlement. Assinatura cobre versão/método/path/nonce (não só `${ts}.${body}`).

**REQ-7 — Constraints + guard-rail (migração no Domus).** `unique(lower(email))` em users; unique credential por user (`accounts`); consumo de convite com **compare-and-set** (evita duas aceitações concorrentes). **Guard-rail de host allowlist** no `/provision`: recusa (fail-closed) se `DATABASE_URL` fora da allowlist do ambiente — protege PHI mesmo com env errada (mais robusto que checar NODE_ENV, que é furável).

---

## 6. Modelo de dados / migrações

**Vis (Prisma):**
- `Company.provisioningState` enum (`NOT_REQUIRED | PROVISIONING | PROVISIONED | SUSPENDED`), default `NOT_REQUIRED`.
- `Company.provisioningAttemptId` (string, nullable) — guarda de corrida.
- Tabela `ProvisioningOutbox` (id, companyId, clinicId, payload, attempts, nextAttemptAt, status) + índice para o worker.
- `Company.domusClinicId` já existe (uuid @unique @db.Uuid) — passa a ser SETADO na criação (hoje é null até o script).
- **Gotcha de tipo:** `domusClinicId` (uuid) vs `Company.id` (text) — qualquer função/trigger que cruze exige cast `::text` (teste unitário não pega, só tipo real via MCP).

**Domus (Drizzle):**
- Tabela de convite (`clinic_invites`: tokenHash, clinicId, email, role, purpose, nonce, expiresAt, consumedAt).
- `visEntitlementEvents` reusado para dedupe do provision (`provision:{clinicId}`).
- Constraints REQ-7: `unique(lower(email))`, unique credential por user, compare-and-set no consumo do convite.

**Invariante:** o provision NUNCA re-executa a tx num reenvio (evento já registrado ⇒ no-op) → nunca toca pacientes/PHI. Reprovision de clínica existente é no-op idempotente.

---

## 7. Tratamento de erro / falha

- **Domus fora no fast-path:** Company nasce `PROVISIONING` (não órfã); worker reconcilia. Admin vê "Provisionando…" no detalhe.
- **Timeout com sucesso remoto (resposta perdida):** retry idempotente por clinicId/evento — não duplica user/account (evento já registrado ⇒ no-op).
- **Colisão de email:** 409 identity_conflict, provisionamento não completa, admin vê erro claro (não cria acesso à clínica errada).
- **Convite expirado:** estado próprio; super admin reenvia (invalida antigo).
- **Corrida provision-vs-entitlement:** 422 retryable, evento não envenenado (REQ-4).
- **Offboarding (CFM 20 anos):** `SUSPENDED` + `writeAllowed=false` no Domus; leitura de prontuário preservada; NUNCA delete físico. PII do admin (não-paciente) pode ser anonimizada sob pedido LGPD — distinta do PHI de paciente (retido).

---

## 8. Testes

**Ambiente:** contra o banco ISOLADO do Domus (`ep-dawn-haze`, `TEST_DATABASE_URL`, `NODE_ENV=test`), estendendo a suíte `tests/vis-entitlements`. PHI real (`ep-odd-credit`) NUNCA tocado.

**Domus (`/provision`):** feliz; idempotência (2º POST não duplica user/account/vínculo); colisão de email → 409; fail-open fechado (clínica sempre com entitlement); guard-rail de host; corrida provision-vs-entitlement (422 retryable, evento não envenenado); reprovision = no-op (não toca PHI).

**Vis:** `createTenantCompany` criando ótica E medical pelo caminho único; máquina de estados com `attemptId` (tentativa lenta não sobrescreve rápida); NÃO gravar EntitlementRevision (triggers intactos); outbox + worker (retry, reconciliação); convite (token hash, TTL, reenvio invalida antigo).

**Marco 2/3:** aceite do convite resolve clínica pelo token (não clinics[0]); better-auth login na origem `medical.vis.app.br`; auto-cadastro público cria VIS_MEDICAL TRIAL + dispara provisionamento; guard do P0 (funil ótica não serve plano medical).

---

## 9. Riscos aceitos
| Risco | Mitigação |
|---|---|
| Consistência eventual (janela PROVISIONING) | fast-path síncrono cobre o caminho feliz; worker + reconciliação fecham o resto |
| `clinics[0]` sem switcher | admin provisionado é user NOVO (1 vínculo); aceite resolve pelo token |
| Funil público amplia superfície de abuso | rate-limit por IP (como a ótica já faz); noindex nesta fase |
| Secret HMAC compartilhado / vazado | secret de provisioning separado + ator (requestedByAdminId) no payload + assinatura cobre método/path/nonce |
| Testar contra PHI real | banco isolado ep-dawn-haze + guard-rail de host allowlist (fail-closed) |
| Reprovision sobrescrever dados clínicos | evento já registrado ⇒ tx não re-executa (no-op); nunca toca pacientes |

---

## 10. Ordem de execução (marcos, cada um validável)
1. **Marco 1:** motor comum (`createTenantCompany`) + `/provision` no Domus + máquina de estados + outbox/worker + convite (gerar link + e-mail). Validação: super admin cria cliente Medical → clínica nasce no Domus, sem script.
2. **Marco 2:** `medical.vis.app.br` (Vercel + better-auth 2 origens + noindex) + tela de aceite do convite. Validação: cliente do Marco 1 entra pela URL nova e opera.
3. **Marco 3:** `/registro` público Medical (trial) + branding por produto. Validação: cliente se cadastra sozinho, ganha trial, entra por medical.vis.app.br.
