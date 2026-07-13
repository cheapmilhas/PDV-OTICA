# Vis Medical — Núcleo Clínico, Fatia 1 (fluxo vertical fino) — Design

**Data:** 2026-07-12
**Status:** Design aprovado pelo dono (6 seções). Aguardando revisão do spec + aprovação final.
**Rodada:** Plano no papel — **sem código**.
**Sucede:** F0 (fundação Vis Medical) — EM PRODUÇÃO. Ver `2026-07-12-vis-medical-f0-fundacao-design.md`.

---

## Contexto

Segundo sub-projeto do Vis Medical (produto para oftalmologistas/optometristas, empresas SEPARADAS por `Company.platformProduct=VIS_MEDICAL`, dentro do Vis App: Next.js 16, Prisma+Postgres/Neon, multi-tenant `companyId`). A F0 já entregou o produto, o discriminador, os papéis clínicos e o esqueleto RBAC.

Passou por painel adversarial (forja): 3 abordagens ⚔ 3 críticos lendo o schema real. Registro: `vis-medical-nucleo-clinico-forja.md`. Achados do Domus (app irmão de referência): `domus-inventario-clinico-achados.md` + `~/SISTEMACLINICADOMUS/docs/DOMUS-INVENTARIO-CLINICO.md`.

**Base vencedora:** C (data-first) reforjada e ENXUTA. B (user-first) morta por cross-tenant FATAL (painel de contexto puxando dado da ótica = join cross-tenant + mudança de finalidade LGPD). A (mvp-first) FATAL por colar refração na PrescriptionValues (serve grau não-revisado como receita + ETL clínico futuro contra prod sem sandbox).

**Decisões do dono no brainstorming:**
- Fatia 1 = fluxo vertical FINO ponta-a-ponta: **agendar → check-in → atender → registrar refração → gerar receita**.
- Plano no papel primeiro (sem código nesta rodada).
- Walk-in existe (`Encounter.appointmentId` opcional).
- Refração→receita = botão explícito "gerar receita" com revisão (não automático).
- Agenda = fila com check-in + retorno vinculado.
- SOAP fatia 1 = campos-texto (modelo brasileiro, ver Seção 2). **form_templates dinâmicos = FASE 2 dedicada** (dono queria já; painel unânime: grande demais p/ fatia 1 → faseado).
- Logins fatia 1 = médico/optometrista + recepção. Médico faz TUDO sozinho + aba de Usuários pra criar recepção opcional.
- Braço SEPARADO: receita cai no Livro do PRÓPRIO Vis Medical, NÃO cruza pra ótica (ligação ótica↔clínica = fase futura com consentimento dedicado).

---

## Seção 1 — Fronteira e fases

**Dentro da fatia 1:** `ClinicalAppointment` (agenda + fila/check-in + retorno), `Encounter` (prontuário BR em campos-texto + `signedAt`), `RefractionExam` (refração medida), vínculo `Prescription.refractionExamId`, botão "gerar receita" com promoção transacional, aba de Usuários (médico cria recepção), e telas: agenda/recepção, workspace de atendimento, reuso da tela/PDF de receita.

**Fora (fases seguintes, catálogo Domus debatido feature-a-feature):** form_templates dinâmicos (Fase 2), exames satélite (`ClinicalExam`: acuidade/tonometria/mapeamento), `EncounterAmendment` append-only, atestado/declaração, laudos, painel TV, agendamento público, financeiro/caixa clínico, reconciliação Doctor↔User, ponte receita→venda cross-produto.

**Critério de sucesso:** numa conta Vis Medical, recepção agenda + check-in; médico abre atendimento, preenche prontuário, registra refração, clica "gerar receita", revisa e emite; receita aparece no Livro do Vis Medical — com consentimento clínico checado e acesso logado. Sem regressão no Vis App.

---

## Seção 2 — Schema

Três tabelas novas + um campo. Tudo aditivo (`.sql` hand-written + `migrate deploy`; sem `migrate dev`). `companyId` líder em todo índice.

### `ClinicalAppointment`
`id, companyId, branchId?, customerId, doctorId?, scheduledStart, scheduledEnd?, status (enum ClinicalAppointmentStatus), appointmentType?, originalAppointmentId? (self-ref, onDelete SetNull), isFollowUp Boolean, notes?, canceledReason?, checkedInAt?, startedAt?, completedAt?, canceledAt?, createdByUserId, timestamps`.

- Enum `ClinicalAppointmentStatus`: `AGENDADO, CONFIRMADO, AGUARDANDO, EM_ATENDIMENTO, ATENDIDO, CANCELADO, FALTOU`.
- `ALLOWED_TRANSITIONS` validado no service (padrão Domus): AGENDADO→{CONFIRMADO,AGUARDANDO,CANCELADO,FALTOU}; CONFIRMADO→{AGUARDANDO,CANCELADO,FALTOU}; AGUARDANDO→{EM_ATENDIMENTO,CANCELADO,FALTOU}; EM_ATENDIMENTO→{ATENDIDO,CANCELADO}; ATENDIDO=terminal; CANCELADO/FALTOU→AGENDADO (reabrir).
- Timestamp por transição (checkedInAt em AGUARDANDO, startedAt em EM_ATENDIMENTO, completedAt em ATENDIDO, canceledAt em CANCELADO).
- Índices: `@@index([companyId, scheduledStart])`, `@@index([companyId, customerId, scheduledStart])`, `@@index([companyId, doctorId, scheduledStart])`.
- Anti-double-booking: índice único parcial `.sql` `(companyId, doctorId, scheduledStart) WHERE status NOT IN (CANCELADO, FALTOU)`.
- Comentário inline documentando: `ClinicalAppointment` = agenda clínica; distinto de `ExamAppointment` (funil de vendas, exige `leadId`).

### `Encounter`
`id, companyId, branchId?, customerId, appointmentId? @unique (nullable p/ walk-in), doctorId?, performedByUserId (sempre — quem conduziu), status (enum EncounterStatus: OPEN, SIGNED), signedAt?, signedByUserId?, createdByUserId, timestamps` + prontuário BR (todos `String?` / Text):
`chiefComplaint, historyPresentIllness, pastHistory, familyHistory, medications, physicalExam, vitalSigns (Json?), diagnosis, treatmentPlan, observations`.

- Imutabilidade pós-SIGNED = **guard de aplicação** no service (`if status===SIGNED throw`), NÃO trigger (sem Neon dev p/ testar trigger com segurança).
- `appointmentId @unique` nullable → Postgres já trata como parcial (múltiplos NULL não colidem), sem `.sql` extra.
- Índice: `@@index([companyId, customerId, createdAt])`.

### `RefractionExam`
`id, companyId, encounterId @unique, method? (AUTOREFRATOR/SUBJETIVA/RETINOSCOPIA), odEsf, odCil, odEixo, odDnp, oeEsf, oeCil, oeEixo, oeDnp, addNear, timestamps`.

- Shape confirmado pelo inventário Domus (`optical_prescriptions` = a estrutura VIVA): 1 grau por olho + adição única. SEM longe/perto separado, SEM prisma (isso era a tabela ANTIGA `ophthalmology_rx`, possível código morto).
- Tipos alinhados ao Domus/PrescriptionValues: eixo = int 0-180; esf/cil/dnp/addNear = string (preserva sinal/precisão "-2.00").
- É a medida bruta do prontuário — NUNCA lida pelo comercial.

### Vínculo em `Prescription` (campo novo aditivo)
`refractionExamId String? @unique` com `onDelete: SetNull` — Prescription aponta pra trás pra refração de origem (padrão do `saleId` existente). Direção corrigida pelo crítico de dados: resolve cancelamento (cancelar/recriar receita não trava a refração).

---

## Seção 3 — Fluxo refração→receita

O médico mede a refração (`RefractionExam`), revisa/ajusta, e clica **"gerar receita"** (botão explícito — Prescription NÃO nasce automático). A transação:
1. Valida `ConsentRecord` clínico vigente (scope canônico, ver Seção 5) — falha bloqueia.
2. Cria `Prescription` (companyId, customerId, `doctorId` NOT NULL, status, expiresAt/validUntil, isEyeExam) + `PrescriptionValues` **copiando** os valores medidos (snapshot congelado).
3. Seta `Prescription.refractionExamId`, com guard `WHERE refractionExamId IS NULL` (fecha duplo-clique).
4. Grava `CustomerAccessLog`.

Medida bruta (`RefractionExam`) ≠ grau emitido (`PrescriptionValues`). Receita emitida é imutável (correção = nova Prescription). PDF segue molde jsPDF do Domus (A4 retrato, cabeçalho logo+clínica, rodapé assinatura, sem acento por limitação de fonte). A receita aparece no Livro do PRÓPRIO Vis Medical.

---

## Seção 4 — Agenda, recepção e aba de Usuários

- **Recepção** (papel `ATENDENTE` + `clinical.appointment.manage`, SEM `clinical.encounter.*`): agenda, faz check-in (status→AGUARDANDO, grava checkedInAt). Fila = lista de AGUARDANDO ordenada por checkedInAt. NUNCA vê prontuário.
- **Médico** (`OFTALMOLOGISTA`/`OPTOMETRISTA`): tudo da recepção + permissões clínicas. Sozinho agenda, atende, emite. Reusa o padrão de gestão de usuários por empresa do Vis: **aba de Usuários** onde cria/desativa o login de recepção.
- Espelha o Domus: `secretary` barrada por ROLE no action client (não só permissão) — comportamento que o RBAC do Vis já tem.
- Admin da clínica = fase seguinte.

---

## Seção 5 — Segurança / LGPD clínico (inegociáveis do painel)

1. **Consentimento clínico** — `ConsentRecord.scope` ganha uma **string canônica CONSTANTE** (ex. `clinical_health_data`), definida em constante compartilhada e validada (não string livre aceita sem checagem). Checado (vigente, `revokedAt IS NULL`) ANTES de qualquer escrita clínica (Encounter, RefractionExam, emissão).
2. **`CustomerAccessLog`** gravado em toda LEITURA e ESCRITA de dado clínico, com `resourceType` específico (distingue prontuário de dado cadastral).
3. **Leitura de `Encounter` não-SIGNED** restrita a `performedByUserId`/`doctorId` (+ admin), não a qualquer portador da permissão RBAC.
4. **DTO de agenda** (usado pela recepção) explícito, SEM os campos de prontuário — com teste de integração que FALHA se algum campo clínico aparecer no payload. Nunca um `include` genérico que traga Encounter.
5. **`doctorId` NOT NULL** no momento da emissão (mesmo que a captação por técnico permita null antes).
6. Nada cruza pra ótica (empresa separada; ligação = fase futura com consentimento dedicado).
7. `companyId` obrigatório em toda query nova; índices liderados por companyId.

---

## Seção 6 — Erros e testes

**Erros:** emissão falha atomicamente (transação — os três + vínculo, ou nada); duplo-clique em "gerar receita" barrado pelo guard `WHERE refractionExamId IS NULL`; editar `Encounter` SIGNED rejeitado no service; consentimento ausente bloqueia escrita clínica com mensagem clara; transição de status inválida rejeitada.

**Testes:**
- Promoção transacional (cria Prescription+Values+vínculo, copia valores, doctorId obrigatório).
- Guard de duplo-clique na emissão.
- Guard de imutabilidade pós-SIGNED.
- Gate de consentimento (escrita clínica sem consentimento vigente falha).
- **DTO de agenda sem campos SOAP** — teste que falha se vazar campo clínico.
- Transições de status válidas/inválidas da `ClinicalAppointment`.
- Não-regressão do Vis App (tabelas existentes inalteradas em comportamento).

**Migração:** aditiva. Enums novos (`ClinicalAppointmentStatus`, `EncounterStatus`, e o de método de refração se enum) via `DO $$ IF NOT EXISTS pg_type`. Tabelas novas. `Prescription.refractionExamId` nullable, sem backfill. Índice parcial anti-double-booking via `.sql`. `migrate deploy`, nunca `migrate dev`.

---

## Arquivos-âncora (código real)
- Schema: `prisma/schema.prisma` — `Prescription` (~L887)/`PrescriptionValues` (~L944), `Doctor` (~L572), `Customer`/`ConsentRecord`/`CustomerAccessLog` (~L447-593), `ExamAppointment` (~L1352, NÃO reusar), `enum UserRole` (papéis clínicos da F0), `Company.platformProduct` (F0).
- RBAC: `src/lib/permissions.ts` (permissões `clinical.*` da F0) + `src/app/api/permissions/seed/catalog.ts`.
- Padrão de vínculo: `Prescription.saleId` (@unique + SetNull) como modelo p/ `refractionExamId`.
- Referência de artefatos: `~/SISTEMACLINICADOMUS/docs/DOMUS-INVENTARIO-CLINICO.md`.

## Fases seguintes (fora deste spec)
Fase 2 = form_templates dinâmicos (portar UM modelo limpo, não os 3 do Domus). Depois: atestado/declaração, exames (catalog/orders/results), laudos, painel TV, agendamento público, financeiro/caixa clínico, ponte receita→venda.
