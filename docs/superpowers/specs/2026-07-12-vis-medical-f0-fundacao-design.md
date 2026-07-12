# Vis Medical — F0: Fundação (produto, vínculo por titularidade, super admin)

**Data:** 2026-07-12
**Status:** Design aprovado pelo dono (seções 1–6). Aguardando revisão do spec + aprovação final antes de writing-plans.
**Rodada:** Plano no papel — **sem código**.

---

## Contexto e origem

O dono quer criar o **Vis Medical**: um sistema para **oftalmologistas e optometristas**, espelhando o app irmão "Domus" (`~/SISTEMACLINICADOMUS`, clínica médica) em design e funcionalidades. O Vis App atual é um PDV de óticas (Next.js 16, Prisma+Postgres/Neon, multi-tenant por `companyId`, super admin multi-empresa em prod).

Esta decisão passou por um painel adversarial (skill `forja`): 3 abordagens criativas ⚔ 3 críticos (segurança/tenancy, custo/complexidade, modelo de dados), todos lendo o schema real. Registro em memória: `vis-medical-forja-painel.md`. O escopo total (Vis Medical inteiro) é grande demais para um spec único, então foi **decomposto em sub-projetos**; **este spec cobre apenas a F0 (fundação)**.

### Decisões do dono que moldam a F0

- **Empresas separadas, vinculadas** (não módulo dentro da mesma Company). Motivo de negócio: o profissional pode ter só consultório, só ótica, ou os dois — são negócios que coexistem no mesmo dono mas nem sempre juntos. Dado clínico e comercial ficam isolados por tenant.
- **Vis Medical é um produto próprio** que o super admin gerencia e alterna (Vis App ⇄ Vis Medical).
- **Na F0, quem alterna é só o super admin/plataforma.** O dono-cliente transitar entre as próprias contas sem relogar é sub-projeto posterior.
- **Ambição geral:** espelhar o Domus ao pé da letra, faseado por valor (painel de TV, agendamento público, exames instrumentais com viewer ficam para fases finais — alto custo, baixo uso inicial para um híbrido).
- Abordagem de arquitetura escolhida: **A — discriminador de produto tipado + vínculo por titularidade** (não a B, que marcaria produto via PlanFeature).

---

## Fronteira da F0

**A F0 é a fundação onde o Vis Medical vai morar — não o produto clínico em si.**

Entrega verificável: o super admin cria uma conta Vis Medical, ela aparece marcada como produto distinto, pode ser vinculada à ótica do mesmo dono, e o super admin alterna a visão entre os dois produtos — sem quebrar nada do Vis App em produção.

### Dentro da F0
- Discriminador de produto (`ProductType`) na Company.
- Vínculo por titularidade entre duas Companies (`CompanyOwnerGroup`), sem compartilhar dado.
- Extensão do provisionador do super admin para criar conta Vis Medical.
- Switcher de produto no super admin (reusando impersonation/escopo existentes).
- Papéis clínicos (oftalmologista/optometrista) no enum `UserRole` + esqueleto de permissões clínicas.
- Métricas do super admin segmentáveis por produto.
- Estrutura LGPD para dado clínico (escopo de consentimento próprio; regras cravadas para as fases clínicas consumirem).

### Fora da F0 (sub-projetos seguintes)
- Agenda clínica, prontuário SOAP, exames, receita clínica.
- Ponte receita→venda entre Vis Medical e Vis App (cruza tenant + LGPD — sub-projeto delicado próprio).
- Dono-cliente transitar entre as próprias contas sem relogar.
- Qualquer UI clínica de atendimento.

### Critério de sucesso
Um super admin loga, provisiona uma conta "Vis Medical" para um dono que já tem ótica, vincula as duas, alterna a visão Vis App ⇄ Vis Medical, e o dashboard mostra números separados por produto — sem regressão no Vis App.

---

## Seção 2 — Discriminador de produto

**Gap que corrige:** hoje nada distingue de qual produto uma Company é. Todo o super admin (métricas, listagem, provisionamento) opera sobre um universo único de óticas.

**Desenho:**
- Novo `enum ProductType { VIS_APP, VIS_MEDICAL }`.
- `Company.productType ProductType @default(VIS_APP)`, indexado.
- Backfill implícito pelo default: todas as Companies existentes tornam-se `VIS_APP`.

**Por que enum tipado e não feature de plano:** "que produto a conta **é**" é identidade estrutural, distinta de "que features a conta **compra**" (`PlanFeature`). Enum indexado mantém métricas por produto corretas/baratas e impede queries que misturem ótica com clínica.

**Consequência assumida:** as queries do dashboard (`src/app/admin/(painel)/page.tsx`) e a matemática de métricas (`src/lib/admin-metrics.ts`), além da listagem de clientes, passam a filtrar/agrupar por `productType`. Sem isso, o switcher mostraria números misturados. É a parte "chata mas necessária" da F0.

---

## Seção 3 — Vínculo por titularidade

**Armadilha evitada:** já existe `model Network` (schema L2896), mas ele **compartilha dados** entre empresas (`sharedCatalog`/`sharedCustomers`/`sharedSuppliers`/`sharedPricing`) — semântica de franquia. Reusá-lo vazaria dado de saúde para o comercial. Errado para este caso.

**Desenho (deliberadamente magro):**
- `model CompanyOwnerGroup` (id, name, timestamps).
- `Company.ownerGroupId String?` + relação + `@@index([ownerGroupId])`.
- Duas Companies com o mesmo `ownerGroupId` = "do mesmo dono". Sem nenhuma flag de compartilhamento.

**Por que grupo e não self-relation `Company.linkedCompanyId`:** o grupo escala para três+ negócios do mesmo dono (ótica + duas clínicas) sem a dor de uma relação par-a-par.

**Propriedades:**
- Criado/gerido **pelo super admin** na F0.
- Puramente organizacional: registra titularidade, **não concede acesso** a nada.
- É o trilho por onde a ponte receita→venda e o "dono transita entre contas" passarão depois — mas nenhum dos dois está na F0.
- Qualquer travessia de dado entre as duas empresas será feature explícita e consentida (LGPD), construída depois sobre este trilho.

**Risco assumido:** o vínculo "não faz nada visível" sozinho além de aparecer no super admin. É intencional — fundação, não feature de valor por si.

---

## Seção 4 — Super admin: switcher e provisionamento

Reusa quase tudo que já existe (o super admin já é um sistema separado e completo: auth próprio `AdminUser`/cookie `admin.session-token`, escopo por empresa `scopedCompanyIds`/`canAccessCompany`, provisionador transacional, impersonation).

**Switcher de produto:**
- Seletor Vis App ⇄ Vis Medical no shell do painel (header/topo da sidebar, `src/app/admin/(painel)/admin-nav.tsx`).
- Não troca de sistema nem de auth. Define um **filtro de contexto** (estado/preferência do super admin, ex.: cookie) que injeta `productType` nas queries de dashboard, listagem e métricas.
- Para **entrar** numa conta específica, usa a **impersonation existente** (`ImpersonationSession`) — não reinventada.

**Provisionamento:**
- Estende o handler atual `src/app/api/admin/clientes/create/route.ts` (transação que cria Company + Branch + User admin + Subscription + CompanySettings + finance setup) para aceitar `productType`.
- Quando `VIS_MEDICAL`: cria Company marcada como clínica, opcionalmente já com `ownerGroupId` (se amarrando a uma ótica existente), User admin com papel adequado, e **ramifica condicionalmente** as partes que não se aplicam à clínica (ex.: finance setup específico de ótica fica atrás do condicional de produto).
- Formulário `src/app/admin/(painel)/clientes/novo/new-client-form.tsx` ganha escolha de produto e, se Vis Medical, campo de vínculo a grupo de titularidade.

**Métricas por produto:**
- `page.tsx` do dashboard e `admin-metrics.ts` segmentam por `productType`, respeitando o switcher (MRR, contagem de empresas, trials).

**Cuidado explícito:** o provisionador da ótica é uma transação grande em produção. Estendê-lo é "adicionar ramo condicional testado", **não** reescrever. O que da ótica não se aplica à clínica fica atrás do condicional de produto.

---

## Seção 5 — Papéis e permissões clínicas

**Papéis clínicos (decisão do dono):** oftalmologista e optometrista como **valores de primeira classe no enum `UserRole`** (como ADMIN/GERENTE/VENDEDOR/CAIXA/ATENDENTE).

**Cuidado de migração (imposto pelos críticos):**
- `ALTER TYPE ... ADD VALUE` no Postgres em **migração própria, separada** da que usa os valores (regra do Postgres: não usar valor de enum novo na mesma transação que o adiciona).
- Auditar todo `switch`/`requireRole`/seed que hoje assume os 5 papéis da ótica, para nenhum papel clínico cair em `else` genérico (ex.: assumir VENDEDOR).

**Autorização — regra inegociável:** todo acesso a dado clínico é sempre por **permissão granular** (`requirePermission`), **nunca** `requireRole`. Motivo: `requireRole` não distingue um GERENTE-vendedor de um GERENTE-médico e fura escopo.

**Escopo da F0:** cria o **esqueleto** das permissões clínicas no catálogo (`src/lib/plan-feature-catalog.ts` / sistema de permissões) — chaves e estrutura, prontas para os sub-projetos clínicos consumirem. A F0 não implementa telas clínicas.

**LGPD (definido na F0, enforcement nas fases clínicas):**
- `ConsentRecord.scope` ganha valor clínico próprio (ex.: `clinical_health_data`) distinto de marketing/comercial.
- Fica cravado no spec que todo acesso a dado clínico gravará `CustomerAccessLog`, e que **nenhum endpoint genérico de cliente pode dar `include` em dado clínico**.

**Nota:** `branchType=HYBRID` não separa acesso sozinho — authz clínica é sempre por permissão de papel, nunca por tipo de filial.

---

## Seção 6 — Dados/schema, erros, testes

### Mudanças de schema (todas aditivas)
Aplicadas via `.sql` hand-written + `migrate deploy` (não há Neon dev isolado; `migrate dev` rodaria contra prod).

- `enum ProductType { VIS_APP, VIS_MEDICAL }`.
- `Company.productType ProductType @default(VIS_APP)` + índice (backfill implícito pelo default).
- `model CompanyOwnerGroup` (id, name, timestamps) + `Company.ownerGroupId String?` + relação + `@@index([ownerGroupId])`.
- Dois valores novos em `enum UserRole` (oftalmologista, optometrista) — **migração própria, separada** da que os usa.
- Esqueleto de permissões clínicas no catálogo + valor `clinical_health_data` em `ConsentRecord.scope`.

### Requisitos cravados pelo painel (enforcement pode vir em fases seguintes, mas o spec registra)
- **Cancelamento de venda deve zerar `saleId` na receita** — `onDelete: SetNull` só cobre delete físico da Sale, não cancelamento lógico. Bug pré-existente; correção pertence à fase da ponte receita→venda, registrada aqui para não se perder.
- **`Appointment` clínico será tabela nova desacoplada do funil** (`ExamAppointment` exige `leadId` obrigatório + cascade — não serve para agenda clínica). Fase clínica, não F0.
- Todo índice novo lidera por `companyId` (ou por `productType`/`ownerGroupId` quando é discriminador global do super admin).
- Decisão pendente para a fase de receita clínica: imutabilidade de `PrescriptionValues` após `saleId` setado (versionar via nova linha vs aceitar risco). Registrada, não resolvida na F0.

### Erros
- Provisionar Vis Medical falha atomicamente (transação — tudo ou nada, como o provisionador atual).
- Vincular a `ownerGroupId` inexistente é rejeitado.
- Switcher com produto inválido cai no default `VIS_APP`.
- Nenhuma query do super admin retorna contas de produto trocado (garantido por teste).

### Testes
- Matemática das métricas por produto (segmentação de MRR/contagem por `productType`) — testável pura, sem banco (como `admin-metrics.ts` já é).
- Provisionador cria conta Vis Medical válida e vinculada.
- **Não-regressão do Vis App:** contas existentes viram `VIS_APP`; métricas antigas batem; provisionador de ótica intacto.
- Switcher filtra corretamente e nunca vaza produto cruzado.

### Regressão (requisito de aceitação, não detalhe)
A F0 não pode quebrar o Vis App em produção. Provisionador ganha ramo condicional testado; queries de métrica ganham filtro de produto que, sem switcher ativo, se comporta como hoje.

---

## Arquivos-âncora (código real, para o plano)
- Schema: `prisma/schema.prisma` — `Company` (L89–228), `CompanySegment` enum=porte (L4332), `Network` (L2896), `UserRole`, `Subscription`/`Plan`/`PlanFeature` (L2454+), `ConsentRecord`/`CustomerAccessLog`, `Prescription` (L882)/`PrescriptionValues` (L939), `ExamAppointment` (L1347).
- Super admin: `src/app/admin/(painel)/` (layout, `admin-nav.tsx`, `configuracoes/sections.ts`), `src/app/api/admin/clientes/create/route.ts` (provisionador), `clientes/[id]/` (gestão), `page.tsx` + `src/lib/admin-metrics.ts` (métricas).
- Auth admin: `src/auth-admin.ts`, `src/lib/admin-session.ts`, `src/lib/admin-scope.ts`, `src/proxy.ts`, `AdminUser`/`ImpersonationSession`.
- Features/plano: `src/lib/plan-features.ts`, `src/lib/subscription.ts`, `src/lib/plan-feature-catalog.ts`.

## Sub-projetos seguintes (ordem sugerida, fora deste spec)
1. **F0 (este spec)** — fundação.
2. Núcleo clínico — agenda + prontuário SOAP + receita clínica.
3. Ponte receita→venda entre Vis Medical e Vis App (cruza tenant + LGPD).
4. CRM clínico, pós-venda, receitas a vencer, relatórios, IA.
5. Fases de alto custo/baixo uso inicial: painel de TV, agendamento público, exames instrumentais com viewer.
6. Dono-cliente transita entre as próprias contas sem relogar.
