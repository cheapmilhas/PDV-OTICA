# Vis Medical — Plano de Execução em Sprints

> **Para retomada em sessão nova (contexto alto):** leia este arquivo inteiro + as memórias `domus-p3-medicao-plan-stripe.md` e `incidente-banco-vis-zerado.md`. A seção **Estado de execução** diz exatamente onde paramos. Ao concluir cada tarefa: marcar o checkbox, atualizar "PRÓXIMA TAREFA" e commitar este arquivo junto com a entrega.

**Objetivo:** vender o Domus app sob o nome **Vis Medical**, gerido pelo super admin do Vis — com a Clínica Domus Saúde como cliente nº 1 visível no portal — e com landing + trial self-service em `vis.app.br/medical`, no mesmo fluxo que o Vis Ótica usa hoje.

**Arquitetura (decidida na forja de 16/07 — não rediscutir):** Vis = operadora (identidade, plano, cobrança Asaas, super admin — fonte de verdade). Domus = produto clínico em `medical.vis.app.br`; o médico nunca vê o Vis. Contrato: espelho `clinic_entitlements` no Domus (PK=FK=clinics.id), alimentado por webhook HMAC + pull diário de reparação. **O Vis decide (`writeAllowed`), o Domus executa.** Fail-open: na dúvida, libera e alerta. **Vencimento bloqueia ESCRITA, nunca leitura de prontuário (CFM 1.821).**

**Stack:** Vis = Next 16 + Prisma + Neon (`ep-blue-thunder`). Domus = Next + drizzle/pg + Neon (`ep-odd-credit`). Bancos separados, sem JOIN possível.

**Environment/gotchas (aprendidos a caro preço):**
- **NUNCA** `db push` / `migrate dev` / `migrate reset` — bloqueados por `deny` nos 2 repos desde o incidente de 17/07. Migração = SQL à mão → `scripts/dry-run-migration.cjs` (existe nos 2 repos, aplica em transação e faz rollback) → `migrate deploy` (Vis) ou `scripts/apply-migration-NNNN.cjs` (Domus, padrão 0035-0040).
- Deploy Vis é MANUAL: `vercel deploy --prod --yes` (merge não deploya). Migração ANTES do deploy.
- Scripts node: rodar da RAIZ do projeto (em `/tmp` o `require` falha silencioso).
- `vercel env add` via stdin grava VAZIO → usar o painel.
- **Verificar o banco depois de TODA escrita** — ausência de erro não é sucesso (incidente 17/07).

---

## Estado de execução (ATUALIZAR ao concluir cada tarefa)

**PRÓXIMA TAREFA → Sprint 1 T1.1: dono cria "Clínica Domus Saúde" em /admin/clientes/novo (plano "Interno — Domus"), me passa o id → eu rodo promote + link. // Pendências paralelas do dono: bucket R2 (T0.5).**

| Etapa | Status |
|---|---|
| P1 segredo admin · P2 create-clinic · P3 commits 1–2 | ✅ feitos (P3 c1–c2 aplicados em prod 17/07) |
| Sprint 0 — Consolidar | ✅ T0.1/0.2/0.2b deployados · T0.4 resíduo clínico purgado · **casca escondida via filtro soft-delete (`95e3acf5`, deployado)** — hard-delete descartado (62 FKs, frágil) · T0.5 ⬜ backup R2 aguarda dono (não bloqueia Sprint 1) |
| Sprint 1 — Domus cliente nº1 | 🔄 **T1.1 ✅ + T1.2 ✅** — "Clinica Domus Saude" criada (VIS_APP), promovida a VIS_MEDICAL (`promote-company-to-medical.cjs`) e vinculada à clínica real `7110db1b` (`link-domus-clinic.cjs`). Verificado: 1 medical visível, vínculo único. ⚠️ sub=TRIAL (dono decide se vira ACTIVE — conta interna não deveria vencer). **PRÓXIMO: T1.3 projetor + T1.4/1.5 sync sombra.** |
| Sprint 1 — Domus cliente nº 1 no portal | ⬜ |
| Sprint 2 — O cadeado (bloqueio por inadimplência) | ⬜ |
| Sprint 3 — Vender em vis.app.br | ⬜ |
| Sprint 4 — Limpeza e dívidas | ⬜ |

---

## Sprint 0 — Consolidar (~½ dia)

**Meta:** tudo que já foi feito e testado entra em produção pela main; banco limpo do resíduo de teste; backup fora do Neon passa a existir.

- [ ] **T0.1 — Vis: merge `fix/admin-clientes-filtro-produto-escopo` → main.** Contém 4 commits: `541e4bf2` (filtro por produto + escopo no detalhe), `ea578d90` (deny de comandos destrutivos), `bf84c7dc` (dry-run de migração), `3606b154` (schema P3 + models órfãos reconciliados). `git fetch` + rebase sobre origin/main antes. Rodar `npx tsc --noEmit` (0 erros) e `npx vitest run` (~2493). Deploy manual — a migração já está aplicada em prod.
- [ ] **T0.2 — Vis: garantir o P1 na main.** `git branch --contains f3236287` — se a main NÃO contiver, **cherry-pick só o `f3236287`** do worktree `feat/vis-medical-clinico-f1` (o worktree tem 59 commits clínicos que NÃO devem vir). O commit toca `admin-session.ts`, `api/admin/auth/login/route.ts` e testes — Codex verificou que aplica limpo na main atual. Rodar os 14 testes de admin-auth. Sem isso, o código do fallback `AUTH_SECRET` continua em produção mesmo com a env certa.
- [ ] **T0.2b — Vis: trazer os ARQUIVOS das 5 migrações clínicas para a main.** O banco tem 5 migrações aplicadas cujos `.sql` só existem na branch clínica (`vis_medical_clinico_f1`, `atestados`, `certificate_issuer_snapshot`, `prescription_origin`, `prescription_issuer_snapshot`). `prisma migrate status` sai com código 1 (`historiesDiverge`) — não bloqueia `migrate deploy`, mas quebra CI, reconstrução de banco e disaster recovery. Copiar SÓ os diretórios de migração (`git checkout feat/vis-medical-clinico-f1 -- prisma/migrations/<dir>`), sem código clínico. Critério: `migrate status` = "up to date".
- [ ] **T0.3 — Domus: merge `fix/fecha-autoprovisionamento-clinica` → main.** 6 commits (`b8d81a1` P2 → `af77e5f` schema espelho). tsc 0 + 164 testes. Deploy. ⚠️ Consequência intencional do P2: `/clinic-form` deixa de criar clínica — até o webhook do Sprint 3, clínica nova só via provisionamento.
- [ ] **T0.4 — Vis: refazer a limpeza clínica** (o restore do incidente ressuscitou o seed): purge dos ~97 registros clínicos (ordem de FK: PrescriptionValues → Prescription → MedicalCertificate → RefractionExam → Encounter → ClinicalAppointment → CustomerAccessLog) com script da raiz + verificação pós-escrita; depois excluir "Clínica Vis (Dev)" **pela UI `/admin/clientes`** (86 FKs — a UI faz a cascata na ordem certa; não fazer na mão).
- [ ] **T0.5 — Backup fora do Neon:** script `pg_dump` dos 2 bancos → destino (**DECISÃO D4**) + agendamento diário + teste de restauração de uma amostra. O PITR salvou no dia 17; não existir segundo backup é aposta, não estratégia.

**Gate:** Vis e Domus deployados a partir da main · `SELECT count(*) FROM "Company" WHERE "platformProduct"='VIS_MEDICAL'` = 0 · backup gerado e restaurado em teste.

---

## Sprint 1 — Domus como cliente nº 1 no portal (P3 c3+c4) (~2–3 dias)

**Meta:** alternar o seletor do `/admin` para Vis Medical e **ver a Clínica Domus Saúde como cliente com assinatura**; sincronização Vis→Domus rodando em sombra (nenhum bloqueio).

**Reconhecimento feito (17/07) — reduz risco/trabalho:**
- **O projetor NÃO precisa ser reescrito.** `src/lib/subscription.ts::checkSubscription()` JÁ é a lógica canônica: trata os 6 estados, tem `LIVE_STATUSES=[TRIAL,ACTIVE,PAST_DUE]`, kill-switch `ENFORCE_SUSPENSION=false`, whitelist `SUBSCRIPTION_BYPASS_COMPANY_IDS`, e o contrato `SubscriptionCheckResult {allowed, readOnly, status, message, daysLeft...}`. **T1.3 = envelopar isso num projetor puro** `computeEntitlement(sub) → {writeAllowed, reason, status, planName}` que mapeia `allowed→writeAllowed`, `status`, `message→reason`. Não reimplementar regra (era o golpe da forja: 2 implementações divergindo).
- `Plan` (schema:2504) tem `priceMonthly/Yearly`, `maxUsers/Branches`, `trialDays`, `PlanFeature[]` key/value — **falta só `platformProduct`** (T3.1).
- `Subscription` tem os 8 campos de estado (trial/pastDue/dunning/reconciliação Asaas) — é a fonte rica que o Domus NÃO espelha; o espelho guarda só a decisão.
- O kill-switch/bypass do Domus (Sprint 2) deve ser o MESMO desenho: `ENFORCE_VIS_ENTITLEMENTS=false` + `DOMUS_BILLING_BYPASS_CLINIC_IDS` (espelha o que já existe no Vis).

- [ ] **T1.1 — Criar o cliente nº 1 limpo.** ✨ **Reconhecimento (17/07): dá para fazer pela UST `/admin/clientes/novo` sem código** — a rota `api/admin/clientes/create` já aceita `platformProduct=VIS_MEDICAL`, pula o finance de ótica (`resolveProvisionProduct`), e cria `Subscription` com trial na mesma transação (`create/route.ts:264`). Passos: (a) criar o `Plan` do Domus (**DECISÃO D1**: interno R$ 0 ou pago) — via seed ou UI de planos; (b) criar "Clínica Domus Saúde" como VIS_MEDICAL nesse plano pela UI. **Não** reaproveitar a casca de teste. Se D1 = R$ 0 interno, o plano precisa existir mas fora da landing pública.
- [ ] **T1.2 — Vincular identidade:** `Company.domusClinicId = '7110db1b-528b-4451-a2c4-3581f370b9df'` via script com verificação (o id é o da clínica com 116 pacientes; **NUNCA vincular por nome** — existem 2 clínicas homônimas vazias).
- [ ] **T1.3 — Vis: projetor canônico** `computeEntitlement(subscription) → {writeAllowed, reason}` + testes unit cobrindo **os 6 estados do enum**: TRIAL, **TRIAL_EXPIRED**, ACTIVE, PAST_DUE, **SUSPENDED**, CANCELED (Codex pegou: meu rascunho listava só 4 — TRIAL_EXPIRED e SUSPENDED são exatamente os que bloqueiam).
- [ ] **T1.4 — Vis: publisher via ponto ÚNICO de escrita** — não "publicar nos pontos conhecidos" (frágil): criar helper canônico `updateSubscriptionAndPublish()` que grava a Subscription E enfileira a publicação na MESMA transação (outbox). Migrar os call-sites que mudam status hoje: webhook Asaas, `cron/subscription-watch` (TRIAL→TRIAL_EXPIRED), `cron/dunning` (SUSPENDED), `billing/checkout`, `admin/faturas/[id]/workflow` (confirmação manual reativa), `admin/clientes/[id]/actions` (estender trial), `public/register` e `admin/clientes/create` (criação). Webhook `POST` ao Domus com HMAC sobre `timestamp+corpo`, `eventId`, anti-replay 5min. + endpoint de pull `GET /api/internal/domus/entitlements/[clinicId]` **autenticado pelo mesmo segredo de serviço** (expõe estado contratual — sem auth seria vazamento).
- [ ] **T1.5 — Domus: receptor** `POST /api/internal/vis/entitlements` (valida HMAC/janela, idempotência via `vis_entitlement_events`, descarta fora-de-ordem por `source_updated_at`) grava `clinic_entitlements` + cron diário de pull + alerta `synced_at` > 24h. Testes: replay, fora-de-ordem, HMAC inválido, primeiro snapshot.

**Gate:** mudar a assinatura no Vis reflete em `clinic_entitlements` no Domus (sombra) · Domus listado em `/admin/clientes` com o seletor em Vis Medical · nenhum bloqueio ativo.

---

## Sprint 2 — O cadeado (P3 c5+c6) (~3–5 dias)

**Meta:** inadimplência bloqueia ESCRITA clínica com ensaio antes de ligar; leitura de prontuário intocável.

- [ ] **T2.1 — Guard central** `assertClinicWriteAllowed(clinicId)` em `src/lib/billing/` (algoritmo fail-open com `deny_verified_until` + revalidação por pull antes de negar) + write action clients derivados. Leitura permanece nos clients atuais — **não** mexer em `protectedWithClinicActionClient`.
- [ ] **T2.2 — Classificar as ~206 actions** (mutação × leitura × SECURITY_WRITE) + **teste de arquitetura** que exige classificação explícita de toda action/rota de escrita nova (a classe de bug que se repete sozinha).
- [ ] **T2.3 — Cobrir os bypasses:** `add-public-appointment` (guard antes de criar), rotas token do tv-panel (separar mutação do GET), crons decidindo por item (nunca abortar o batch), seed do `clinic-settings` sai do render → provisionamento idempotente.
- [ ] **T2.4 — Modo observação:** `ENFORCE_VIS_ENTITLEMENTS=false` → loga `WOULD_BLOCK` e permite. Rodar ≥3 dias; critério = zero falso-positivo.
- [ ] **T2.5 — Ligar:** kill switch global + bypass por clínica prontos ANTES. Exercitar: ACTIVE · PAST_DUE→bloqueia · paga→libera ≤5min · Vis fora do ar→libera+alerta · snapshot ausente→libera+alerta.

**Gate:** todos os cenários exercitados e documentados · leitura de prontuário jamais bloqueada em nenhum teste.

---

## 🔐 DECISÃO — Autenticação multi-clínica do Domus (dono, 17/07) → FORJA no Sprint 3

**Problema descoberto:** o login por PIN do Domus (`api/auth/verify-pin`) recebe **só 4 dígitos** e testa contra **todos os usuários de todas as clínicas** (`route.ts:131`, findMany sem escopo de clínica). Com 1 clínica/11 users funciona; em multi-clínica, **colisão de PIN vira certeza** (só 10.000 combinações) → um usuário loga na conta de outro, possivelmente de OUTRA clínica = vazamento de prontuário (LGPD Art. 11 + sigilo). PIN de 4 dígitos como identidade PRIMÁRIA não escala.
**Descoberta boa:** o PIN já mora em `users_to_clinics.pin` (schema.ts:197) — **já é por-clínica**. A estrutura para separar existe; o login é que ignora.

**Direção escolhida pelo dono (comportamento decidido POR DOMÍNIO):**
| Entrada | Métodos | Escopo do PIN |
|---|---|---|
| `app.domussaude.com.br` (LEGADO — os 11 users atuais, hábito) | PIN + senha, como HOJE | global (inalterado) |
| `medical.vis.app.br` (genérica, marca Vis Medical) | **só e-mail+senha** | — (PIN desabilitado) |
| `medical.vis.app.br/<clinica>` (entrada da clínica) | PIN **ou** senha | **só aquela clínica** |

Racional: sem transição forçada — o legado preserva o hábito dos atuais, o modelo seguro nasce no domínio novo. Risco de colisão fica **contido no legado e não cresce** (clínica nova entra pelo domínio novo). Aceito.

**🚨 Furo bloqueante (não pode ser só cosmético):** esconder o PIN na tela genérica é VISUAL — `verify-pin` continua global e contornável por chamada direta à API. O escopo por clínica tem que viver na **API**: `verify-pin` passa a **exigir clinicId/slug** e recusar sem ele. Dado já está do lado certo → mudança de lógica, não de schema.

**Por que FORJA e não decidir agora:** mexe na PORTA DE ENTRADA de sistema de saúde em produção (trancar user real / vazar prontuário). Múltiplas sub-decisões acopladas (slug vs subdomínio p/ resolver a clínica; PIN errado; re-auth). O desenho do dono ENTRA como proposta principal; a forja endurece (verify-pin é o 1º achado). **NÃO tocar em auth antes da forja.** É trabalho no DOMUS, não no Vis. Sprint 1 não é afetado (clínica atual entra como hoje).

---

## Sprint 3 — Vender em vis.app.br (Fase 1) (~5–8 dias — Codex derrubou a estimativa de 3–5)

**Meta:** optometrista/médico se cadastra no site, ganha trial, a clínica nasce no Domus provisionada pelo Vis, e ele entra em `medical.vis.app.br` — o mesmo fluxo do Vis Ótica hoje.

- [ ] **T3.0 — FORJA: autenticação multi-clínica do Domus** (ANTES de T3.5). Rodar a skill `forja` sobre o desenho da seção "🔐 DECISÃO — Autenticação multi-clínica" acima (proposta principal = comportamento por domínio; achado nº1 = `verify-pin` global tem que exigir clinicId na API, não só esconder na tela). Saída: plano de implementação aprovado no Domus. **Bloqueia T3.5** (não dá para apontar `medical.vis.app.br` sem definir como a entrada resolve a clínica). É trabalho no repo do Domus.
- [ ] **T3.1 — `Plan.platformProduct` + Plans comerciais.** Codex pegou: `Plan` NÃO tem produto e o register cai em silêncio no "primeiro plano ativo" → cadastro medical poderia receber plano de ótica. Migração aditiva `Plan.platformProduct` (default VIS_APP), `/api/public/plans` filtra por produto, e o register passa a **rejeitar** planId de produto errado (nunca fallback cruzado). Então criar `medical-solo` e `medical-clinica` (**DECISÃO D2**: preços) com gating data-driven via `PlanFeature`.
- [ ] **T3.2 — `/api/public/register`:** aceitar `platformProduct` e pular `setupCompanyFinance` quando VIS_MEDICAL. Trial igual ao da ótica. (Branch "Matriz" e defaults ópticos de `CompanySettings` viram dado morto para medical — aceito, não quebra; anotar como dívida semântica.)
- [ ] **T3.3 — Provisionamento Vis→Domus no signup.** Dois pontos que o Codex provou e mudam o desenho: **(a)** o Domus usa better-auth com **scrypt** — o padrão existente de criação direta (`create-clinic-user`, bcrypt) gera usuário que NÃO consegue logar; criar o user via API do better-auth e **testar login real**. **(b)** retry + senha são incompatíveis: se o Domus estiver fora do ar, não dá para re-enviar senha sem guardá-la em claro → o provisionamento cria o user **sem senha** e emite **token de primeiro acesso** (convite) que o e-mail entrega. Outbox: Company + Subscription + `provisioning_job` gravados na **MESMA transação** (crash entre cadastro e job não pode deixar cliente sem clínica). Idempotente + retry. O P2 fechou a porta pública — este webhook é a ÚNICA entrada de clínica nova.
- [ ] **T3.4 — Landing `vis.app.br/medical`** (copy para optometristas/oftalmo, base `(landing)/precos`) com "Sou médico solo / Tenho clínica" → registro com produto VIS_MEDICAL.
- [ ] **T3.5 — `medical.vis.app.br`** apontando para o Domus + rebrand mínimo "Vis Medical" (**DECISÃO D3**: agora só domínio + tela de login/título; rebrand profundo fica para depois).
- [ ] **T3.6 — E-mail de boas-vindas** (Resend já existe no Vis) entregando o **token de primeiro acesso** do T3.3 — o médico define a própria senha no primeiro login em `medical.vis.app.br`.
- [ ] **T3.7 — E2E real com conta de teste:** cadastro → aparece no admin (produto Medical) → clínica criada no Domus → médico loga → trial vence → escrita bloqueada/leitura ok → paga → libera. Documentar com evidências.

**Gate:** fluxo ponta-a-ponta executado de verdade e documentado.

---

## Sprint 4 — Limpeza e dívidas (~1–2 dias)

- [ ] **T4.1 — Remover o Stripe inteiro do Domus** (action, componente, webhook, envs, dep `@stripe/stripe-js`). **ANTES:** dono confere o painel Stripe (**DECISÃO D5**: há Customer/Subscription ativo? chaves test ou live?) — os zeros no banco só provam que o Domus não registrou.
- [ ] **T4.2 — Drop `users.plan` + `stripe_customer_id` + `stripe_subscription_id`** (schema + better-auth) — só após 1 deploy completo sem leitores. `/subscription` passa a ler `clinic_entitlements`. Único passo pouco reversível do plano inteiro; por isso é o último.
- [ ] **T4.3 — Furo da rede cruzada:** validar mesmo `platformProduct` no `POST /api/admin/networks` (gatilho atingido: existe cliente medical real). Ver memória `admin-rede-cruzada-produtos`.
- [ ] **T4.4 — Runbook operacional:** mapa company↔clinic, segredos, kill switch, procedimento de restore (lições do incidente de 17/07).

**Gate:** zero referências a `plan`/stripe legado no Domus · runbook commitado.

---

## Fora de escopo (próximo ciclo — NÃO fazer agora)

Fase 2 do produto (especialidade filtra navegação, multi-clínica/`activeClinicId` — **volta a ser pré-requisito antes do Sprint 2/T2.5 se surgir o 1º usuário multi-clínica**, polimento do papel secretary) · Fase 3 RLS (gatilho escrito: 3ª clínica pagante) · unificar bancos/ORMs · SSO · mover prontuário · bloquear leitura/export de prontuário.

---

## Decisões do dono (respondê-las destrava os sprints)

| # | Sprint | Decisão |
|---|---|---|
| D1 | 1 | Plano do cliente nº 1 (Domus): interno R$ 0 ou pago? |
| D2 | 3 | Preços de `medical-solo` e `medical-clinica` |
| D3 | 3 | Profundidade do rebrand "Vis Medical" no app agora (proposta: só domínio + login) |
| D4 | 0 | Onde guardar o backup (S3/R2/Drive/disco externo)? |
| D5 | 4 (pode já) | Painel Stripe: há assinatura ativa? Chaves `sk_test` ou `sk_live`? |

---

## Protocolo de retomada (contexto alto / nova sessão)

1. Ler ESTE arquivo — "Estado de execução" diz a próxima tarefa.
2. Ler memórias: topo do `MEMORY.md`, `domus-p3-medicao-plan-stripe`, `incidente-banco-vis-zerado`.
3. `git branch --show-current` + `git log --oneline -5` nos 2 repos (conferir onde os commits pararam).
4. Continuar da tarefa marcada. Ao concluir: marcar checkbox aqui + atualizar "PRÓXIMA TAREFA" + commitar o plano junto com a entrega.
5. **Por sprint:** ao iniciar, gerar o plano detalhado de implementação das tarefas (skill writing-plans) e o Codex tenta quebrá-lo; a cada entrega, Codex revisa o diff; testes antes de marcar "feito". Máximo 2 rodadas de revisão automática.
