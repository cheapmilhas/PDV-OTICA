# Vis Medical — Plano de Execução: Melhorias mineradas do Domus (oftalmo/optometria)

> **Status: AGUARDANDO APROVAÇÃO DO DONO.**
> Origem: forja adversarial 2026-07-16 (3 criativos ⚔ 3 críticos) sobre o inventário completo do Domus Saúde.
> Base vencedora: **C reforjada** — modelo de dados tipado/comparável (Data-first) com a cadência de fatias semanais dogfoodáveis (MVP-first) e a ponte receita→venda (User-first, redesenhada).
> Regra do jogo: o Domus é **mina de requisitos**, nunca port de código. Tudo nasce nativo no Vis.

---

## 0. Princípios inegociáveis (valem para todas as fases)

1. **Multi-tenant:** `companyId` em todo filtro Prisma, sem exceção.
2. **Migrations:** sempre aditivas, SQL escrito à mão, aplicadas manualmente com OK explícito do dono (dev = endpoint de prod). Antes de qualquer `ADD COLUMN`, conferir o schema REAL — lição do painel: o plano original propunha `checkInAt` quando `checkedInAt` já existe.
3. **Imutabilidade clínica:** `Encounter.signedAt` continua sendo a lei. Velocidade vem de rascunho efêmero/duplicação ANTES da assinatura, nunca de afrouxar o guard.
4. **LGPD por construção:** dado de saúde nunca atravessa para o lado comercial; recalls carregam tipo+data, nunca conteúdo clínico; mensagens WhatsApp neutras; `CustomerAccessLog` em acesso a prontuário (padrão já existente: `resourceType: clinical_history`).
5. **Lição nº 1 do Domus (não repetir):** dado clínico em texto livre/jsonb = nunca ter comparativo. Dado canônico é tipado, por olho. Lição nº 2: **uma fonte única por medida** (o Domus manteve duas tabelas de receita concorrentes para sempre).
6. **Cadência:** cada fase é dogfoodável pelo dono em dias. Pipeline por fase: spec → plano detalhado → implementação subagent-driven → tsc + suíte completa → **review Codex (máx. 2 rodadas)** → validação visual do dono → só então a próxima fase.
7. **Reuso antes de criação:** `CustomerReminder` (recall), motor WhatsApp com anti-bloqueio, helpers de PDF clínico, resolvedor de emissor, signed URLs (padrão foto de OS) — nada disso é reconstruído.

---

## Pré-requisito (antes da F0)

**Validar e mergear o worktree `feat/vis-medical-clinico-f1`** (4 commits: atestado v2 `b7964b91`, polimento dogfood `7bf52d4a`, receita layout `c4252f6b`, cancelar atestado `27bff9e3`).
- Dono valida em `localhost:3100`: fluxo completo agendar→atender→refração→receita→atestado (+cancelamento).
- Merge na main + `prisma migrate deploy` (migração `20260715120000` já aplicada) + deploy manual.
- Limpar seed `vismed-dev-*` do banco após o dogfood.
- Decisões pendentes que podem entrar junto: CRM obrigatório na emissão de atestado? Importar CID-10 DATASUS completo (~14k)?

> Este roadmap constrói SOBRE o F1. Começar fases novas com o F1 não validado empilha risco.

---

## F0 — Fundação de segurança (pré-condição, ~1 fatia)

**Por quê primeiro:** condição já travada na forja de estratégia-base e ainda pendente. O crítico de segurança confirmou no código: `prisma-tenant-guard.ts` está **warn-only** e o set de ações escopadas não cobre `findUnique/update/delete/upsert` — um IDOR em `update` por PK escreveria dado clínico cross-tenant sem nada bloquear. Nenhuma feature que agrega dado de saúde (timeline) sai antes disso.

**Escopo:**
- Endurecer o tenant-guard: cobrir `findUnique/update/delete/upsert`; modo **throw** (não warn) para os modelos clínicos (ClinicalAppointment, Encounter, RefractionExam, Prescription clínica, MedicalCertificate, CustomerAccessLog e os que vierem).
- Auditoria dos gates `clinical.*`: toda rota/API clínica atrás de `requireClinicalContext` com o código certo; conferir seed do catálogo de permissões.
- Testes: casos de tentativa cross-tenant por PK (update/findUnique) devem falhar com erro, não warn.

**Migrations:** nenhuma. **Risco:** endurecer pode quebrar caminhos legítimos que hoje passam sem companyId — a suíte de ~2600 testes é a rede.

---

## F1 — Ver: Timeline do paciente + Comparativo de refração (~1-2 fatias)

**Valor:** o maior valor percebido do inventário Domus pelo menor custo do roadmap. O médico abre o paciente e vê tudo; a evolução do grau — que o Domus nunca conseguiu — sai aqui.

**Escopo:**
- **Serviço `patient-timeline` (read-model, sem tabela nova):** união virtual de ClinicalAppointment, Encounter (assinados), Prescription, MedicalCertificate, e vendas ópticas do Customer, ordenada por data, paginada por cursor com merge no aplicativo.
  - Gate: `clinical.encounter.view` (vendedor NÃO vê a timeline clínica — segregação de finalidade).
  - `CustomerAccessLog`: 1 linha `clinical_history/view` por abertura da timeline (padrão F1 existente); documento individual aberto (PDF de atestado/receita) continua logando o próprio recurso.
- **Comparativo de refração** (painel na tela de refração + card na timeline):
  - Fórmula: **equivalente esférico** (esf + cil/2) por olho — não esférico bruto.
  - Só `RefractionExam` de encounters **assinados**; normalização de sinal do cilindro antes de comparar.
  - Badge de progressão: Δ equivalente esférico ≥ 0,50D em ≤12 meses (limiar configurável em constante).
- UI: rota da timeline dentro do prontuário do paciente já existente (`/dashboard/clinica/pacientes/[customerId]`), estendendo a página atual.

**Migrations:** apenas índices aditivos se a medição pedir (ex.: `(companyId, customerId, createdAt)` em Prescription/MedicalCertificate), via `CREATE INDEX CONCURRENTLY`.

---

## F2 — Digitar rápido: rascunho efêmero + duplicar + snippets (~2 fatias)

**Valor:** o médico toca o produto 20-40×/dia; cada fricção multiplica. Auto-save e duplicação sem jamais tocar na imutabilidade.

**Escopo:**
- **`EncounterDraft`** (tabela nova): `id, companyId, encounterId, userId, data Json, updatedAt`, unique `(encounterId, userId)`.
  - **Efêmero por definição**: rascunho por USUÁRIO (resolve o clobber de dois dispositivos/dois profissionais — last-write-wins seria incidente médico-legal).
  - Auto-save a cada ~30s via upsert; toda escrita condicionada a `Encounter.signedAt IS NULL` (guard no service, mesma transação).
  - **Assinatura**: `$transaction` — seta `signedAt` E deleta os drafts do encounter atomicamente; autosave em voo que chegar depois falha no guard (não recria zumbi).
  - Retenção: job/limpeza de drafts de atendimentos abandonados (>30d) — pode ficar para fatia posterior, documentado.
- **Duplicar última consulta:** botão no atendimento novo que pré-preenche o draft a partir do último Encounter **assinado** do paciente (server-side, escopado por companyId).
- **`TextSnippet`** (tabela nova): `companyId, userId (opcional = da empresa), shortcut, body`; expansão `#atalho` nos textareas clínicos; CRUD simples em configurações.

**Migrations:** 2 tabelas novas (aditivas). **Fora desta fase:** template de 7 seções estruturado — o Encounter já tem ~10 colunas de texto; a estruturação tipada é a F3.

---

## F3 — Estruturar o exame: `OphthalmicExam` enxuto (~2-3 fatias)

**Condição de entrada:** 2-3 semanas de dogfood de F1/F2 confirmando quais campos o dono realmente preenche. O crítico de custo foi explícito: tipar antes do uso real, em ambiente de migration manual contra prod, maximiza o custo por iteração. A tabela nasce MÍNIMA.

**Escopo:**
- **`OphthalmicExam`** 1:1 com Encounter (`encounterId @unique`), companyId, campos iniciais:
  - Acuidade visual: `avOdSc, avOeSc, avOdCc, avOeCc` (string curta padronizada, ex.: "20/40").
  - Tonometria: `pioOd, pioOe` `Decimal(4,1)` mmHg — **fonte única de PIO no sistema** (decisão do painel: ExamResult/anexos NUNCA duplicam medida de consulta).
  - Fundoscopia: `escavacaoOd, escavacaoOe` `Decimal(3,2)` (ratio 0.00–1.00).
  - Narrativas: `biomicroscopia, fundoscopia, motilidade, gonioscopia` (Text).
- **Congelamento:** não existe "congela sozinho" — helper compartilhado `assertEncounterNotSigned(tx, encounterId)` obrigatório em todo write de OphthalmicExam, e a assinatura do Encounter roda em `$transaction` cobrindo as duas tabelas (condicional `WHERE signedAt IS NULL`).
- Comparativo do F1 estende para PIO e AV (curva de pressão entre consultas).
- UI: seções colapsáveis na tela de atendimento, botão "normal" de 1 toque por seção narrativa.

**Migrations:** 1 tabela nova. Campos futuros (ceratometria, PPC, vergências etc.) = colunas aditivas quando o dogfood pedir — custo aceito conscientemente em troca de comparabilidade.

---

## F4 — Anexos de exames de imagem (~1-2 fatias)

**Valor:** OCT, topografia, campimetria, retinografia anexados ao paciente/consulta. **Sem** módulo de pedidos (ExamOrder com máquina de status foi morto no painel: quem pede é quem executa na sala ao lado).

**Escopo:**
- **`ClinicalExamType`** (tabela seed, NÃO enum — evitar migration por tipo novo): ~15 exames oftalmo seedados (OCT, campimetria, topografia, tonometria, retinografia, paquimetria, biometria, gonioscopia, Schirmer, mapeamento de retina…), toggle por company.
- **`ClinicalAttachment`**: `companyId, customerId, encounterId (opcional — aceita exame trazido de fora), examTypeId, eye (OD/OE/AO), storageKey, fileName, mime, sizeBytes, createdByUserId, createdAt`.
- Upload/consulta via signed URL curta (padrão foto de OS, ~5min); URL nunca persistida nem enviada por WhatsApp; download grava `CustomerAccessLog`.
- Aparece na timeline do F1 automaticamente.

**Migrations:** 2 tabelas novas + seed.

---

## F5 — Trazer de volta: recall clínico via `CustomerReminder` (~1-2 fatias)

**Regra de ouro do painel: ZERO tabela nova de recall.** O `CustomerReminder` já é motor completo em prod (segmentos, prioridade, agendamento, atribuição, telas). Reconstruí-lo (como o plano B propunha em 3 semanas) foi morto.

**Escopo:**
- Novos segmentos no motor existente:
  - **Receita vencendo**: janela sobre `Prescription.expiresAt` (índice `[customerId, expiresAt]` já existe) — recall anual de renovação, o coração do nicho.
  - **Retorno clínico**: a partir de data de retorno registrada no atendimento.
  - **Reativação 6/12/24m**: última consulta assinada há N meses.
- Mensagens: templates **neutros** ("Olá {nome}, sua receita está próxima de vencer — que tal agendar uma revisão?") — sem CID, sem diagnóstico, sem especialidade sensível. O card visível ao operador carrega tipo+data, nunca conteúdo clínico.
- **Bloqueio LGPD:** ligar o disparo SÓ depois de verificar o opt-out do WhatsApp (pendência conhecida do projeto, nunca verificada). Enquanto isso, o segmento funciona como lista de trabalho manual.

**Migrations:** nenhuma esperada (segmentos/config); talvez colunas aditivas de config.

---

## F6 — Receita vira venda: ponte clínico→PDV (~2 fatias)

**Valor:** o diferencial que só o Vis tem — a clínica É a ótica; hoje o vendedor redigita o grau no balcão.

**Escopo (com os redesigns exigidos pelo painel):**
- Botão **"Enviar ao balcão"** na Prescription **assinada** → cria orçamento/venda rascunho no PDV.
- **Contrato de campos mínimos** (minimização LGPD): esf/cil/eixo/DNP/adição por olho + validade + nome do paciente. **Nada** de Encounter, CID, diagnóstico ou traversal para o prontuário a partir da venda.
- **Vínculo por coluna NOVA**: `Sale.sourcePrescriptionId` (nullable, aditiva). **Não tocar** na semântica existente de `Prescription.saleId` (@unique, direção venda→receita do Livro de Receitas) — o painel pegou que reusar esse campo quebraria o upsert existente e criaria "dois vínculos concorrentes".
- Vendedor vê o orçamento com o grau; o gate `clinical.*` continua barrando qualquer tela clínica.

**Migrations:** 1 coluna aditiva em Sale.

---

## Backlog consciente ("depois", não "não")

| Item | Condição para entrar |
|---|---|
| Fila de espera + painel TV | `checkedInAt` + enum `AGUARDANDO` **já existem** — check-in de 1 toque é quase grátis quando quisermos. TV pública exige redesign de token (curta duração, rotação, revogação por Branch) — o token estático do Domus foi reprovado no painel |
| Agendamento online público | Exige anti-enumeração (resposta uniforme, rate-limit, tabela `AppointmentRequest` em quarentena — nunca escreve direto na agenda) |
| Templates de atestado com placeholders | O atestado v2 resolve o hoje; entra quando o dono sentir repetição |
| Favoritos de colírio / receita de medicamento | Modelo separado da Prescription óptica (domínios distintos), reusando helpers de emissor/PDF — só se o dono prescrever fármaco com frequência |
| Laudos de procedimento com template | Quando houver exames laudáveis no fluxo real |
| NPS pós-consulta | Sem sentido com um cliente-dogfooder; reavaliar com base de clientes |

**Descartados em definitivo:** módulo de estética, ponto eletrônico, receituário amarelo/SNGPC, módulo de pedidos de exame com workflow de status, tabela nova de recall.

---

## Decisões que só o dono pode tomar (antes de cada fase)

1. **Pré-req:** aprovar merge+deploy do worktree F1 atual (após validação visual).
2. **F0:** confirmar que endurecer o guard para `throw` pode, em tese, revelar chamadas legadas quebradas — aceita o custo de corrigi-las?
3. **F3:** confirmar a lista mínima de campos tipados (AV, PIO, escavação + 4 narrativas) após o dogfood de F1/F2.
4. **F5:** autorizar verificação/implementação do opt-out LGPD do WhatsApp ANTES de ligar disparos automáticos.
5. **F6:** confirmar o contrato de campos mínimos que atravessa para o balcão.
6. **Ordem:** F4↔F5 podem trocar de posição sem custo se o recall for mais urgente que anexos.

## Verificação (padrão de toda fase)

- `tsc` zero erros + suíte completa verde (hoje ~2621 testes; cada fase adiciona os seus).
- Review adversarial do Codex (máx. 2 rodadas automáticas); achados reais corrigidos, falso-positivos rejeitados com justificativa.
- Dogfood do dono no iPhone/desktop antes de considerar a fase fechada.
- Nada em produção sem OK explícito; toda migration aplicada manualmente com aprovação.
