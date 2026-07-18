# Sprint 2 — "O Cadeado": bloqueio de escrita clínica por inadimplência (Domus)

> Spec de design. Passou pela forja (painel adversarial 3⚔3 + Codex na lente de segurança). As 3 abordagens do painel foram mortas por um achado transversal confirmado no código; este design é a **reforja** sobre a base mais salvável (MVP), com as objeções fatais endereçadas. Repos: Vis em `PDV OTICA` (Prisma/Neon), Domus em `~/SISTEMACLINICADOMUS` (drizzle/pg/Neon), bancos separados.

## Problema

A Clínica Domus Saúde é cliente do Vis Medical. O Vis é a fonte da verdade da assinatura e já publica a decisão para o espelho `clinic_entitlements` no Domus (sync webhook HMAC + cron de pull diário, **em produção, modo sombra** desde o Sprint 1). Falta o Domus **executar** a decisão: bloquear ESCRITA clínica quando a clínica está inadimplente.

## Restrições inegociáveis

- **CFM 1.821 — leitura de prontuário NUNCA é bloqueada.** Só escrita. Um médico sempre lê e imprime o histórico do paciente, mesmo com a clínica bloqueada.
- **Fail-open.** Na dúvida (Vis fora do ar, snapshot ausente/velho, erro) → LIBERA e alerta. Impedir o médico de registrar por falha de infra é pior (e irreversível clinicamente) do que deixar um inadimplente escrever por algumas horas (reversível: cobra depois).
- **Vis decide, Domus executa.** A regra de assinatura (`checkSubscription`) mora só no Vis. O Domus lê o booleano `writeAllowed` do espelho; não reimplementa regra.

## Achado da forja (a razão do redesign)

Os 3 críticos, independentes, e a verificação no código convergiram: **`deny_verified_until` não tem produtor.** A coluna aparece exatamente 2× no Domus (DDL da migração `0040:47` + `schema.ts:6062`) e 0× no Vis. Ninguém a escreve; o DTO do Vis (`entitlement-projection.ts`) nem carrega o campo. Como as 3 abordagens usavam `writeAllowed=false AND denyVerifiedUntil>now()` como condição de bloqueio, e `NULL > now()` é sempre falso, todas entregariam **um cadeado que nunca tranca**. Decidir quem arma essa coluna é o verdadeiro fork do Sprint 2. Objeções fatais adicionais eliminadas: a abordagem B inventava um sinal de "grace" a partir de `sourceUpdatedAt` (que é um mtime, não janela de carência — o espelho colapsa a carência num booleano) e punha um pull síncrono de 1.5s no request path (o receptor do Domus tem cold start >5s → estouraria justamente sob carga). A abordagem C montava um registro de 208 actions hand-maintained (oráculo circular) + tabela de auditoria sem bound no caminho mais quente.

---

## Decisões (fechadas no brainstorming)

| # | Decisão | Valor |
|---|---------|-------|
| D1 | Escopo do bloqueio v1 | **Só CRIAÇÃO de estado novo** (~15-18 actions). NÃO bloqueia editar/finalizar registro que a clínica já tem — médico nunca fica preso no meio de um atendimento em curso. |
| D2 | Quem arma `denyVerifiedUntil` | O **receptor do Domus** (`upsertMirror`), ao aplicar snapshot `writeAllowed=false`: `denyVerifiedUntil = syncedAt + TTL`. `writeAllowed=true` → limpa (null). |
| D3 | TTL | **48h**. O cron é **diário** (renova a cada ~24h); 48h de TTL dá ~24h de folga contra **uma** falha isolada de cron (o run seguinte ainda renova antes de vencer). Sync travado > 48h → bloqueio vence → fail-open. ⚠️ Não reler "48h" como 48h de folga: a folga é a diferença TTL − período do cron ≈ 24h. |
| D4 | Tela de bloqueio | Erro estruturado → toast/diálogo: "Pagamento pendente. Leitura e impressão seguem normais; novos registros pausados. Regularizar →" + link ao portal de cobrança do Vis. **Sem** banner de aviso prévio na v1 (exigiria sinal de grace que o espelho não tem). |
| D5 | Rollout | **Observação → medir → enforce.** Fase 1 `ENFORCE_VIS_ENTITLEMENTS=false` (loga `WOULD_BLOCK`, sempre libera) ≥ alguns dias; critério = zero falso-positivo. Fase 2 liga enforce com kill-switch + bypass prontos ANTES. |
| D6 | Upserts clínicos (create+edit na mesma action) | `upsert-medical-record`, `upsert-aesthetic-record`, `upsert-specialty-record-data` gravam prontuário e distinguem create/edit por `input.id` (ausente = criação). Guard **inline, condicional**: bloqueia SÓ quando `input.id` é ausente (prontuário novo). Edição (id presente) SEMPRE passa — fiel a D1/CFM. |

## Lista pinada de actions guardadas (v1) — a fonte que o teste de arquitetura trava

Derivada e classificada por client + tabela de escrita (não por nome). **Duas formas de guard:**

**(a) Guard via client** (`billingGuardedClinicActionClient`) — actions puramente criadoras:
1. `add-appointment` → appointments
2. `create-appointment-procedure` → appointmentProcedures
3. `create-medical-record` → medicalRecords
4. `create-prescription` → prescriptions
5. `create-optical-prescription` → opticalPrescriptions
6. `create-certificate` → medicalCertificates
7. `create-aesthetic-consent` → aestheticConsents
8. `create-payment-transaction` → cashRegisters
9. `create-cash-movement` → cashMovements
10. `create-attachment` → attachments
11. `apply-bundle-to-appointment` → appointmentBundles
12. `create-delivered-report-attachment` → procedureReportAttachments

**(b) Guard inline condicional** (criação = `id`/`existing` ausente — D6):
13. `upsert-medical-record` (discrimina por `!parsedInput.id`)
14. `upsert-aesthetic-record` (discrimina por `!existing`)
15. `upsert-specialty-record-data` (discrimina por `!existing`)
16b. `upsert-patient` (discrimina por `!parsedInput.id`) — **adicionado após achado do Codex na revisão da Task 4**: cria paciente novo sem guard. Cadastro novo é criação de estado; edição de paciente existente sempre passa.

**(c) Guard inline sem client** (recebe clinicId no input, resposta uniforme — anti-oráculo):
16. `add-public-appointment` (é `export async function`, não usa client)

**Excluídas explicitamente** (verificadas, NÃO são criação de estado clínico faturável por ação humana):
- `create-medical-reminder`, `create-patient-call`, `register-survey-response` — lembrete/fila/pesquisa.
- `generate-atestado-tecnico` — é ponto eletrônico (timeClockLegalExports), não atestado médico (nome enganoso).
- `create-stripe-checkout`, `create-clinic`, `create-clinic-user` — cobrança/setup.
- Todos os `upsert-*` administrativos (doctor, room, insurance-plan, procedure-catalog, commission-rule, etc.) — configuração, não estado clínico faturável.
- Ponto eletrônico/RH (`register-time-clock-entry`, `generate-aej/afd`, `issue-rh-document`, etc.) — módulo separado.

---

## Arquitetura

### O guard (leitura pura, fail-open por construção)

`assertClinicWriteAllowed(clinicId)` em `src/lib/entitlement/assert-write-allowed.ts` (Domus).

- Faz **uma leitura** do espelho `clinic_entitlements` por PK (`clinic_id`). Nenhuma chamada ao Vis no request path.
- **Nega SÓ se as 3 forem verdadeiras:** linha existe `AND writeAllowed=false AND denyVerifiedUntil > now()`.
- **Libera (fail-open) em todo o resto:** linha ausente · `denyVerifiedUntil` null/vencido · `ENFORCE_VIS_ENTITLEMENTS !== "true"` (kill-switch) · clínica em `DOMUS_BILLING_BYPASS_CLINIC_IDS` (CSV) · qualquer exceção capturada (try/catch → allow).
- Ao negar, lança erro com prefixo que o `sanitizeServerError` já deixa passar (ex.: `"Não é possível concluir: assinatura pendente. …"`) → o médico vê a mensagem clara (D4), nunca "erro interno".
- Em modo observação (`ENFORCE_VIS_ENTITLEMENTS !== "true"`): computa a decisão idêntica; quando negaria, emite `WOULD_BLOCK` (log) e **libera**.

### CFM estrutural — client irmão, não rewire da base

`src/lib/next-safe-action.ts` ganha **um** client novo:

```
billingGuardedClinicActionClient = protectedWithClinicActionClient
  .use(async ({ ctx, next }) => { await assertClinicWriteAllowed(ctx.user.clinic.id); return next(); })
```

- **NÃO** toca `protectedWithClinicActionClient` (122 arquivos, base de leitura de prontuário) nem faz rewire em bloco de `doctorActionClient`/`adminActionClient`.
- Só as ~15-18 actions de criação (D1) trocam o import para o client guardado.
- Leituras escondidas em clients de escrita (ex.: `getAllowedPrescriptionTypes` usa `doctorActionClient`) **ficam onde estão** — não migram. Garantia CFM é estrutural: leitura nunca alcança o guard porque nunca usa o client guardado.

### Armando `denyVerifiedUntil` (D2) — no receptor, não no guard

`src/lib/vis-entitlement-sync.ts` (`upsertMirror`) passa a computar a coluna ao aplicar o snapshot:
- `writeAllowed === false` → `denyVerifiedUntil = new Date(syncedAt.getTime() + TTL_MS)` (TTL = 48h).
- `writeAllowed === true` → `denyVerifiedUntil = null`.

Racional: receber um snapshot fresco do Vis **é** a verificação. Sem pull síncrono no request path. A escrita mora no único ponto de escrita atômica do espelho (o upsert condicional do Sprint 1). O webhook renova o TTL na mudança de assinatura; o cron diário renova todo dia. Efeito aceito: um desbloqueio (pagamento) perdido no webhook leva até 24h para o cron corrigir — erra para **bloqueado a mais** (nunca liberado indevido).

### Cobertura dos bypasses

| Superfície | Tratamento v1 |
|---|---|
| `add-public-appointment` (clinicId no INPUT, sem sessão) | Guard inline com `input.clinicId`. **Resposta UNIFORME** ao bloqueio: mesma mensagem genérica para clínica bloqueada / adimplente / inexistente. NÃO vaza `writeAllowed`/motivo/plano (anti-oráculo de assinatura de terceiros — achado Codex). |
| `api/tv-panel/[token]/*` (4 rotas) | **Fora do escopo v1** (decisão documentada). São estados de fila de chamada, não leitura/escrita de prontuário → deixar fora NÃO viola CFM (confirmado Codex). |
| Crons (10 rotas) | Os mutantes decidem **por item**, com `clinicId` da **própria linha** processada — nunca derivado de join com paciente (`medical_reminders.clinicId` é independente de `patientId` → derivar do paciente bloquearia a clínica errada — achado Codex). Nunca aborta o batch: pula-com-log. A maioria (lembretes, espelhos de ponto) fica **fora** na v1 (system-driven, não criação faturável por usuário). |
| Seed no render (`clinic-settings/page.tsx`) | Sai do render → provisionamento idempotente fora do caminho de render. Corrige também um antipadrão pré-existente (escrita no render). |

### Teste de arquitetura (rede anti-regressão)

`src/__tests__/architecture/entitlement-guard-wiring.test.ts` — verifica a **fonte real** (qual client cada action usa), não um registro paralelo:
1. Cada action da lista explícita de criação faturável (~15-18) **usa** `billingGuardedClinicActionClient` → action de criação nova sem guard reprova o CI.
2. As leituras de prontuário conhecidas (`getMedicalRecord`, `listPatientRecords`, timeline, `getAllowedPrescriptionTypes`) **NÃO** usam o client guardado → refactor não bloqueia leitura por engano (CFM).

> ⚠️ **A enumeração da lista de criação faturável é a TAREFA 1 do plano** — é o passo de maior julgamento e o mais perigoso: uma action de criação esquecida falha-aberto em silêncio (a clínica inadimplente continua criando por aquele caminho). A lista deve ser derivada do código, revisada explicitamente (não inferida no meio da implementação), e virar a fonte que o teste de arquitetura trava.

---

## Kill-switch e envs

| Env | Onde | Efeito |
|---|---|---|
| `ENFORCE_VIS_ENTITLEMENTS` | Domus | `!== "true"` → modo observação (loga `WOULD_BLOCK`, libera). `=== "true"` → enforce. |
| `DOMUS_BILLING_BYPASS_CLINIC_IDS` | Domus | CSV de clinicIds sempre liberados (destrava 1 clínica pontual sem desligar tudo). |

Espelha o desenho que o Vis já usa (`ENFORCE_SUSPENSION` + `SUBSCRIPTION_BYPASS_COMPANY_IDS`).

---

## Testes

- **Guard (unit, fake DB):** tabela-verdade do fail-open — nega SÓ com (linha + `writeAllowed=false` + `denyVerifiedUntil>now`); libera em: linha ausente · decisão vencida · kill-switch off · clínica no bypass · exceção capturada. Modo observação: negaria → `WOULD_BLOCK` + allow.
- **Receptor (D2):** snapshot `writeAllowed=false` → `denyVerifiedUntil = syncedAt+48h`; `writeAllowed=true` → null. Snapshot fora de ordem não regride (mantém o guard do upsert condicional do Sprint 1).
- **Anti-oráculo:** `add-public-appointment` retorna resposta uniforme (mesmo status/corpo) para clínica bloqueada, adimplente e inexistente.
- **Arquitetura:** as 2 asserções de wiring acima.
- **Log:** `WOULD_BLOCK`/`BLOCKED` carrega `clinicId`+action+motivo; teste garante que NÃO carrega PII de paciente (input, telefone, conteúdo clínico).

## Gate do Sprint 2

Todos os cenários exercitados e documentados · leitura de prontuário jamais bloqueada em nenhum teste · fase de observação com zero falso-positivo antes do enforce · kill-switch + bypass exercitados (ACTIVE libera · inadimplente bloqueia criação · paga → libera ≤ próximo sync · Vis fora do ar → libera+alerta · snapshot ausente → libera+alerta).

## Fora de escopo (dívida consciente)

- Edição/finalização de registros existentes (só criação na v1 — D1).
- tv-panel, crons system-driven, actions não-criadoras.
- Banner de aviso prévio (exigiria sinal de grace = mudança no DTO do Vis).
- A dívida das 6 telas do admin com filtro de soft-delete (ver `[[admin-dashboard-soft-delete-produto]]`) é independente deste sprint.
