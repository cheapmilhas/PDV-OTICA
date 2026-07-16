# Vis Medical — O médico autônomo: ciclo completo (design)

> **Status: AGUARDANDO REVISÃO DO DONO.**
> Origem: brainstorming 2026-07-16. Persona travada pelo dono: **profissional autônomo que usa o app para gerir seus próprios pacientes** — faz tudo sozinho, sem atendente.
> Base factual: código do worktree `feat/vis-medical-clinico-f1` + inventários do Domus em `~/SISTEMACLINICADOMUS/docs/` (CLINICO, UI, PDF-SPECS, PLANO-ADAPTACAO).
> Sucede o plano `2026-07-16-vis-medical-fluxo-atendimento.md` (Fase A já entregue: 3 commits).

---

## 0. O fluxo que o dono descreveu (fonte da verdade deste doc)

`agendamento → atende (gera receita e/ou atestado) → prontuário salvo → cobrança → CRM de pós-venda`

Com procedimentos cadastrados que **registram no caixa E no prontuário**, e histórico do paciente com **consultas, exames solicitados, procedimentos feitos, atestados**.

**O que o dono corrigiu de mim durante o brainstorming (registro honesto):**
1. Propus "recebe ao finalizar o atendimento". **Errado.** Dor real do dono: *"às vezes recebe o pagamento mas pelo volume não quer lançar na hora, já passa para o próximo atendimento… ou manda o pix depois"*. Forçar recebimento no ato cria a fricção que faz ele não lançar. **Pagamento é desacoplado do atendimento.**
2. Propus "Finalizar e assinar" com diálogo sobre irreversibilidade. Dono: *"esse negócio de assinar acho muito sem graça"*. **Aceito na fachada, recusado no comportamento** — ver §3.
3. Perguntei 2× sobre dar `customers.create` ao médico. **Pergunta errada**: o autônomo nasce ADMIN ao provisionar (`api/admin/clientes/create/route.ts:238`) e já tem todas as permissões. O papel `OFTALMOLOGISTA` (catálogo) é para médico *contratado*, fora desta persona.

---

## 1. Fatos verificados que sustentam o design

**Do Vis (nosso código):**
- Conta Vis Medical **já enxerga** Clientes, Caixa, Contas Pagar/Receber, Relatórios, Receitas, Agenda (`nav-catalog.ts`, `products: [VIS_APP, VIS_MEDICAL]`).
- `CashMovement` tem `originType`/`originId` **genéricos** e `salePaymentId` **nullable** → caixa **não exige venda**.
- `AccountReceivable` já tem `customerId`, `amount`, `dueDate`, `receivedDate`, `receivedAmount`, `status` (PENDING/RECEIVED) → é "cobrança que pode ser paga depois". Hoje vinculada a `saleId`.
- `FinanceEntry` tem `sourceType`/`sourceId` + unique `(companyId, sourceType, sourceId, type, side)` → ledger aceita origem não-venda.
- `CustomerReminder` = motor de CRM/recall **completo** (status, `assignedToId`, `scheduledFor`) + 3 telas — mas **invisível** no Vis Medical (`/dashboard/lembretes` não declara `VIS_MEDICAL` em `products`).
- `ClinicalAppointmentStatus` já tem `AGUARDANDO`, `EM_ATENDIMENTO`, `ATENDIDO`, `FALTOU`. `checkedInAt` existe.
- Existe **uma só** tabela `Prescription` (`saleId @unique`, `refractionExamId @unique`).

**Do Domus (inventários):**
- Procedimento: `procedure_catalog` com `defaultPriceInCents`; preço **congelado** na linha do atendimento; **não gera cobrança nova** (a cobrança nasce no agendamento e o procedimento só recalcula o total).
- Timeline mostra **5 tipos** (appointment, medical_record, prescription, certificate, attachment) e **NÃO mostra procedimentos nem exames** — isso vive noutra tela (`getPatientContext`). O histórico do Domus é **partido em dois**.
- `finalize-medical-record` grava `finalizedAt` + `status: "finalized"` e **barra re-finalização** — é o nosso `signedAt` com outro nome.
- Receita óptica do Domus sai assinada como **"Dr(a). … CRM …" independentemente do profissional** (`optical-prescription-pdf.ts:356-360` não recebe `professionalType`) — o próprio inventário chama de "afirmação falsa em documento".
- CRM do Domus **não escuta o médico**: a tela de follow-ups não lê `medicalRecordsTable`; `complete-follow-up`/`create-medical-reminder` **não têm chamador** (código morto). O "volte em 3 meses" digitado no prontuário **nunca vira trabalho**.

**Correção registrada:** eu havia afirmado que "ExamOrder com máquina de status foi morto no painel". Isso **não consta** nos inventários do Domus — veio do roadmap antigo do Vis. O Domus tem a máquina de status funcional (`requested → collected → completed → cancelled`).

---

## 2. Cobrança — desacoplada, sempre vinculada

**Decisão do dono:** *"vínculo sempre com o atendimento… para ter relatórios"* e *"não tem essa de receber depois"* → mas **lançar** depois, sim.

- O atendimento gera uma **cobrança vinculada** (consulta + procedimentos), que nasce **em aberto**.
- O recebimento é **ato separado**, em qualquer momento: no agendamento (antecipado), ao fim, ou dias depois (pix atrasado). É o recebimento — não a cobrança — que entra no **caixa**.
- Isso entrega os dois pedidos: **relatório** (tudo tem vínculo) e a **lista "atendi e não recebi"** — o pagamento não lançado não some.
- **"Recebido" == "lançado".** Se o dinheiro entrou no bolso e não foi lançado, o sistema mostra em aberto. É isso que faz a lista funcionar.

**Reuso (sem tabela nova):** `AccountReceivable` (ganha vínculo com atendimento, hoje só `saleId`), `CashMovement` (`originType: "clinical_encounter"`), `FinanceEntry` (`sourceType` próprio).

**Cortado do Domus, conscientemente:** preço por convênio, preço por médico (`doctor_procedure_prices`), comissão, cobrança nascendo no agendamento com invoice pendente. Autônomo não tem convênio, não tem sócio, não fatura.

---

## 3. Finalizar atendimento — fachada nova, comportamento intacto

- Botão passa a ser **"Finalizar atendimento"** (não "Finalizar e assinar"), confirmação **enxuta**, sem discurso sobre irreversibilidade/retificação.
- **Por baixo continua gravando `signedAt` e congelando o prontuário.** Recusa fundamentada, não preciosismo:
  1. **O Domus faz idêntico** — `finalizedAt` + bloqueio de re-finalização. O dono usa todo dia e nunca reclamou; o que era "sem graça" é a palavra, não o comportamento.
  2. `refraction.service.ts:380` **já** barra edição de refração com encounter SIGNED — remover quebra o que existe.
  3. Timeline (§5) e "duplicar consulta" leem **só assinados**. Sem congelamento, nascem vazias.
  4. É o princípio nº 3 do roadmap (imutabilidade clínica) e o que faz receita/atestado valerem: o papel entregue ao paciente tem de corresponder a um prontuário que não muda.
- **Finalizar não cobra.** Só fecha o prontuário.

---

## 4. Procedimentos

- Catálogo simples: **nome + preço**. Cadastra uma vez ("Consulta R$ 250", "Campimetria R$ 120").
- No atendimento, escolhe da lista. Cada procedimento é **uma linha só, em dois lugares**: registro clínico no atendimento **e** item da cobrança. Não se lança duas vezes.
- **Preço congelado no uso** (padrão Domus, correto): reajustar o catálogo não reescreve o histórico.
- **Cortado:** preço por convênio/médico, comissão, bundles (entra quando o dono sentir falta), **auto-criação de laudo** — o Domus cria laudo para *todo* procedimento sem filtrar `requiresReport` (defeito documentado; não copiar).

---

## 5. Histórico do paciente — melhor que o Domus, de propósito

Uma tela, ordem cronológica: consultas, receitas, atestados, **procedimentos feitos**, **exames solicitados**. O Domus deixa procedimentos e exames **fora** da timeline (ficam no contexto do atendimento) — o pedido do dono exige os dois juntos.

Gate `clinical.encounter.view`; `CustomerAccessLog` na abertura (padrão existente).

---

## 6. Atendimento em aberto (barra flutuante)

Barra fixa listando `EM_ATENDIMENTO`; sai da tela, ela persiste; clica, volta de onde parou. Status já existe — é tela, não modelo.

---

## 7. CRM — ligar o que existe + a ponte que o Domus nunca fez

- **Tornar `/dashboard/lembretes` visível no Vis Medical** (declarar `VIS_MEDICAL` em `products`). É configuração de nav — o motor já existe e roda em prod.
- **A ponte:** o retorno marcado no atendimento ("volta em 30 dias") **vira uma linha no motor de lembretes**. É exatamente o que o Domus **não** faz — lá o campo é write-mostly e a tela de follow-ups nem lê o prontuário.
- Recall de receita vencendo: janela sobre `Prescription.expiresAt` (índice já existe).
- **Bloqueio LGPD mantido:** disparo automático de WhatsApp só depois de verificar o opt-out (pendência conhecida do projeto). Até lá, o segmento funciona como lista de trabalho manual. Mensagens neutras, sem CID/diagnóstico.

---

## 8. Receita — fechar os furos antes de expandir

Dois defeitos **reais**, confirmados no código, que precedem qualquer feature nova:

1. **`PATCH /api/prescriptions/[id]/grau`** (rota do varejo) chama `saveGradeToBook` direto pelo id, **sem filtrar receita clínica** → o grau de uma receita clínica assinada pode ser alterado **pulando** consentimento, lock e imutabilidade. Hoje só ADMIN alcança (`prescriptions.edit` não está em VENDEDOR/ATENDENTE/GERENTE) → furo **latente**, não porta aberta.
2. **A receita não congela o emissor.** `refraction.service.ts` resolve o emissor e o devolve **só na resposta HTTP** — nunca persiste (`MedicalCertificate.issuerSnapshot` existe; `Prescription` não tem). Reimprimir hoje montaria a 2ª via com **dado vivo**: mudou CRM/endereço → a via sai **diferente do papel entregue**. É o defeito do Domus, que já sabemos evitar.

Só depois: **reimprimir** (molde: `api/clinical/certificates/[id]` + `reimprimir-atestado-button.tsx`; `buildReceitaPdf` já existe) e **receita avulsa** (`upsertPrescription` já cria com `companyId`+`customerId`; busca de paciente já existe em `/api/clinical/customers/search`).

**Avulsa não é transcrição:** o dono prescreve ele mesmo → é ato clínico dele, assinado como qualquer outro. Sem marcação de "grau não examinado". A diferença é só não ter refração vinculada.

---

## 9. Fatiamento (a spec é grande demais para uma entrega)

| Fatia | Conteúdo | Por que nesta ordem |
|---|---|---|
| **1** | Receita: fechar os 2 furos → reimprimir → avulsa | Tem **defeito real**; o dono já sentiu a falta; fundação toda paga |
| **2** | Procedimentos + cobrança vinculada + recebimento no caixa | O elo genuinamente ausente do fluxo |
| **3** | Finalizar (fachada) + barra flutuante + histórico + CRM visível + ponte do retorno | Depende de 1 e 2 existirem para ter o que mostrar |

---

## 10. Fora de escopo (consciente)

Convênio · comissão · pacotes/bundles · painel de TV (token estático do Domus reprovado) · agendamento online público · receita de medicamento/colírio (exige decisão regulatória — §6.1 do plano do Domus) · `Doctor.userId`.

**`Doctor.userId` — pendência real:** não existe vínculo `Doctor`↔`User`, então o guard de escrita autoriza só `performedByUserId` (quem criou) ou admin. Para o autônomo (ADMIN) é inócuo; para clínica com recepção, **o médico não-admin fica travado**. Decisão de schema do dono.

---

## 11. Verificação

`tsc` 0 + suíte completa verde (hoje 2648) · review adversarial do Codex (máx. 2 rodadas) · **testes verificados por mutação** (reintroduzir o bug TEM que fazer o teste falhar — lição da Fase A, onde um teste passou com o bug reintroduzido e foi removido) · dogfood do dono · **nada em produção sem OK explícito**; migration manual aprovada (dev aponta para prod).
