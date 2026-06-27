# Livro de Receitas — Design das Fases 2a e 2b

**Data:** 2026-06-27
**Branch:** `feat/livro-receitas-fase1` (continuação)
**Fase 1 (pré-requisito):** APLICADA EM PROD (commit `1aed98d`) — esquema relacional `Prescription` + writer `upsertPrescription`. Ver `livro-receitas-fase1` na memória.

---

## 1. Princípio central

> **A receita pertence à VENDA (e ao cliente titular), não à Ordem de Serviço.**
> Uma venda que contém **lente** OU **exame de vista** cria/atualiza **UMA** receita no Livro, ligada à venda. A OS, quando existe, é apenas uma das origens/portas de digitação — nunca a dona da receita.

Esse princípio corrige o design inicial (que ancorava a receita na OS e deixava de fora o caso "só exame", além de arriscar duplicidade no caso "lente + exame").

### 1.1 Invariante de unicidade (decisão-chave após revisão adversarial)

> **`saleId` é a chave de unicidade de verdade — imposta no banco, não só prometida em código.**

A Fase 1 deixou `Prescription.saleId` como coluna comum (índice não-único). Isso **não basta** para garantir "1 receita por venda": dois disparos concorrentes (pós-commit fora de transação) criariam duas receitas. Decisão:

1. **Migração nova (Fase 2a):** adicionar `@unique` em `Prescription.saleId` (continua nullable — `NULL` não colide em Postgres, então receitas avulsas sem venda convivem). Isto contradiz o "sem migração nova" do design inicial — assumido explicitamente aqui. Migração ADITIVA, aplicada com snapshot + dry-run, padrão do projeto.
2. **`upsertPrescription` passa a fazer upsert por `saleId`:** antes de criar, busca `findUnique({ where: { saleId } })`; se existe, atualiza; senão cria. Trata `P2002` (corrida) como idempotente — mesmo padrão que `createFromSale` já usa com o `unique` de `Sale.serviceOrderId`.

Com isso, **todos os caminhos de criação/digitação convergem na MESMA receita por construção** — duplicidade fica impossível no nível do banco, não só por convenção.

## 2. Cenários de venda (regra única, sem duplicidade)

| Cenário | Cria OS hoje? | Receitas no Livro | Onde o grau é digitado |
|---|---|---|---|
| **1. Só lente** (c/ ou s/ armação) | Sim (automático, gatilho `LENS_PRODUCT_TYPES`) | **1**, ligada à venda; OS aponta pra ela | Formulário de grau da OS (já existe) → espelha |
| **2. Lente + Exame** (mesma venda) | Sim (a lente gera) | **1 só** (a venda é uma só; exame e lente compartilham) | Formulário da OS → espelha |
| **3. Só Exame de Vista** (sem lente) | **Não** (SERVICE não gera OS) | **1**, nasce vazia (`AGUARDANDO_GRAU`), ligada à venda | **Tela do Livro** (Fase 2b) |

**Chave de unicidade = a VENDA** (`saleId`), não a OS nem o item. Logo: 1 venda → no máximo 1 receita. No cenário 2, lente e exame apontam para a mesma receita da venda.

## 3. Paciente vs. titular

- A **venda** é sempre cadastrada no **cliente titular** (quem paga).
- A **receita** registra o **paciente**, que pode ser:
  - o próprio titular, ou
  - um **dependente** (`isDependente=true`, `patientName`, `patientBirthDate`).
- Na **ficha do cliente**, aparecem **todas as receitas dele + as dos dependentes** que ele comprou.

A fundação da Fase 1 já suporta: `customerId` (titular), `isDependente`, `patientName`, `patientBirthDate`. **Não há migração nova nas Fases 2a/2b.**

## 4. Detecção do "Exame de Vista" (DECIDIDO — era bloqueante do cenário 3)

- O lojista **cadastra um produto-serviço** `Exame de Vista` (tipo `SERVICE`, `stockControlled=false`, com preço).
- **Mecanismo de detecção (decisão):** uma **marcação dedicada no produto resistente a rename** — `Product.isEyeExam Boolean @default(false)` (migração aditiva da Fase 2a, junto da trava de `saleId`). NÃO se baseia no nome do produto.
- Qualquer item da venda cujo produto tenha `isEyeExam=true` dispara a criação da receita, mesmo sem lente.
- Gatilho de receita = `LENS_PRODUCT_TYPES` (lente) **OU** `product.isEyeExam` (exame). O gatilho de **OS** continua só `LENS_PRODUCT_TYPES` (exame puro NÃO cria OS).

## 5. Fase 2a — backend (primeiro)

**Ordem canônica (resolve a ambiguidade OS↔receita):** a **receita da venda nasce/é garantida PRIMEIRO** (por `saleId`); só depois a OS (quando existe) lê essa receita e aponta pra ela. Nunca o contrário.

Pontos de integração mapeados (todos já existem no código):

0. **Migração aditiva** (junto): `Prescription.saleId @unique` + `Product.isEyeExam Boolean @default(false)`. Snapshot + dry-run, aplicada pelo dono.
1. **Criação no fechamento da venda** (`sale.service.ts`, onde hoje chama `createFromSale` pós-commit): se a venda tem lente OU item com `isEyeExam` → `upsertPrescription({ saleId, customerId, ... })`. Ponto **único** de criação, **upsert por `saleId`** (idempotente). À prova de falha (não quebra a venda — padrão side-effect já usado). **Venda sem `customerId` → NÃO cria receita (skip silencioso, `warn`)**, alinhado ao que `createFromSale` já faz.
2. **OS aponta pra receita da venda**: dentro/após `createFromSale`, ler a receita da venda (por `saleId`) e gravar `ServiceOrder.prescriptionId` (relação `"SOPrescription"`). No cenário lente, a origem da receita é a VENDA → `Prescription.serviceOrderId` (relação `"PrescriptionOriginSO"`) fica **`null`**; `serviceOrderId` só é usado por receita cuja origem real é uma OS sem venda (backfill caso c).
3. **Espelhar grau digitado na OS** (`service-order.service.ts` `update()`/`create()`): ao salvar `prescriptionData`, resolver a receita **por `saleId`** (nunca assumir um `id` pré-carregado) e atualizar → converge na mesma receita do passo 1. Se a OS não tem venda, resolve por `serviceOrderId`.
4. **Rota de leitura**: (a) receitas por cliente, incluindo dependentes; (b) listagem geral com filtro (cliente, status, validade).
5. **Backfill** das OSs antigas — ver seção 5.1.
6. **Testes** RED→GREEN (incl. teste de não-duplicação por `saleId` e de skip sem cliente). Tudo **dormente** até a Fase 2b (sem tela).

### 5.1 Backfill — 3 casos de OS antiga (chave idempotente explícita)

Lê `prescriptionData` (JSON) e foto (`prescriptionImageUrl` da OS; fallback `imageUrl` legado se vazio) das OSs existentes:

| Caso | Situação da OS antiga | Chave idempotente | Vínculo gravado |
|---|---|---|---|
| **a** | Tem venda, venda já tem receita | `saleId` (já existe) | nada a fazer (skip) |
| **b** | Tem venda, sem receita ainda | `saleId` | receita com `saleId`; OS ganha `prescriptionId` |
| **c** | **Sem venda** | `serviceOrderId` | receita com `serviceOrderId` (origem = OS), `saleId=null` |

Script com **dry-run primeiro** + **snapshot Neon**, executado pelo dono. Idempotente por construção (re-rodar não duplica).

## 6. Fase 2b — telas (depois)

1. **Aba "Receitas" na ficha do cliente** — próprias + dependentes; grau, paciente, data, validade.
2. **Tela "Livro de Receitas" geral** — lista de todos os clientes; busca/filtro por cliente, status (`AGUARDANDO_GRAU`/`COMPLETA`), validade.
3. **Formulário de digitar grau sem OS** — para o cenário 3 (exame puro); grava na receita da venda.

## 6.1 Ciclo de vida da venda (casos de borda)

- **Venda devolvida / cancelada / estornada:** a receita **PERSISTE** no Livro (decisão do dono). É dado clínico do paciente, continua válido mesmo sem a venda. (Futuro opcional: marca discreta "venda estornada" em relatório — não nesta fase.)
- **Venda sem `customerId` (avulsa):** **não** cria receita — skip silencioso (`warn`), nunca lança erro. `upsertPrescription` exige `customerId`, então o gatilho checa antes de chamar.
- **Edição de venda** (troca/remove a lente depois): o upsert por `saleId` **reconcilia** a mesma receita; não cria nova.

## 7. Não-objetivos (YAGNI por enquanto)

- Múltiplas receitas por venda (ex.: óculos de longe + de perto separados) — decidido **1 por venda**; revisitar só se aparecer demanda real.
- Trocar OCR→"arquivar foto" — dívida já anotada, fica para fase de UI dedicada.
- Validação clínica avançada do grau além das faixas já existentes no formulário da OS.

## 8. Riscos / pontos de atenção

- **Dívida latente (Fase 1):** upload de foto da OS salva signed URL de 5 min em vez do `fileName` durável → resolver ao mexer na UI de foto. No backfill, ler `prescriptionImageUrl` da OS com fallback ao `imageUrl` legado.
- **Migração de unicidade (Fase 2a):** antes de aplicar `saleId @unique`, garantir que o backfill não tenha gerado 2 receitas pra mesma venda (rodar backfill idempotente, depois aplicar o unique). Ordem: migração `isEyeExam` + writer upsert → backfill dry-run → backfill real → só então `saleId @unique`.
- **Convergência:** todos os caminhos (venda, OS, tela do Livro) DEVEM resolver a receita por `saleId` (ou `serviceOrderId` quando sem venda) — nunca criar às cegas.

## 9. Resolução dos achados da revisão adversarial (2026-06-27)

| # | Sev | Achado | Resolução no spec |
|---|---|---|---|
| 1 | CRÍTICO | `saleId` sem unique + writer não faz upsert | §1.1: migração `@unique` + upsert por `saleId` |
| 2 | CRÍTICO | Caminhos venda×OS podem divergir | §5.1/§5 item 3: todos resolvem por `saleId` |
| 3 | CRÍTICO | Ordem OS↔receita + ambiguidade de relação | §5: receita primeiro; `prescriptionId`=SOPrescription, `serviceOrderId`=origem (null no cenário lente) |
| 4 | CRÍTICO | Backfill sem cobrir OS sem venda / chave | §5.1: tabela dos 3 casos (a/b/c) com chave |
| 5 | MÉDIO | Detecção do exame indefinida | §4: `Product.isEyeExam` (decidido) |
| 6 | MÉDIO | Refund/cancelamento/avulsa não cobertos | §6.1: ciclo de vida |
| 7 | MENOR | `imageUrl` legado vs oficial no backfill | §8: fallback no backfill |
