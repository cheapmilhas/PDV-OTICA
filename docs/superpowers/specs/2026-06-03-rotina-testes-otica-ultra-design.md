# Sprint Rotina de Testes — Óticas Ultra (Design / Spec)

**Data:** 2026-06-03
**Origem:** Rotina de testes manual do dono (Óticas Ultra, cliente do SaaS), ~15 problemas em 6 módulos + auditoria de PDFs.
**Método de diagnóstico:** 6 agentes paralelos leram o código de cada ponto relatado. Veredito por item: 🔴 bug real · 🟡 falta de implementação · 🟢 comportamento correto (só confuso) · 🔵 dado-fantasma.

**Regra de execução (decisão do dono):** após CADA frente concluída, **testar** antes de passar para a próxima. Só avança com teste OK.

---

## Visão geral das frentes

| Frente | Tema | Prioridade | Esforço | Risco |
|--------|------|-----------|---------|-------|
| F1 | Críticos baratos (fios soltos) | Alta | Baixo | Baixo |
| F2 | Pagar conta debita caixa | Alta | Médio | Médio |
| F3 | Cancelados visíveis por papel | Média | Médio | Baixo |
| F4 | Cadastros (Marca/Categoria) + Nº de venda | Média | Médio (migration) | Médio-Alto (migration) |
| F5 | PDFs com header único | Média | Alto (3 engines) | Baixo |

Ordem de execução: **F1 → F2 → F3 → F4 → F5**, testando entre cada uma.

---

## F1 — Críticos baratos

Todos têm o conserto já existente no código, apenas não plugado. Risco baixíssimo.

### F1.1 — Reforço de caixa não soma saldo 🔴
- **Arquivo:** `src/components/caixa/modal-reforco.tsx:28-49`
- **Causa:** `handleSubmit` é um mock (`setTimeout` → toast → fecha). Nunca chama API. Nenhum `CashMovement` é criado.
- **Correção:** substituir o mock por `POST /api/cash/movements`, e confiar no refetch que a página já faz no `onOpenChange` (page.tsx:316-318).
- **Endpoint já existe:** `src/app/api/cash/movements/route.ts:46` → `cash.service.ts createMovement`. **Zero callers hoje** — os modais serão os primeiros; não há fluxo existente para quebrar.

### F1.2 — Sangria não tira saldo 🔴
- **Arquivo:** `src/components/caixa/modal-sangria.tsx:28-49`
- **Causa:** mesmo padrão mock.
- **Correção:** `POST /api/cash/movements` (type `WITHDRAWAL`) + refetch.
- **Nota:** o "toast disse R$60 para R$50" é o valor digitado no campo (interpola `formData.valor`), não há mismatch hardcoded.

### ⚠️ Payload EXATO (revisão adversarial — evita 400 e perda de dados)
Validado contra `cash.schema.ts:28`. O body aceito é **apenas** `{ type, amount, method?, note? }` — `cashShiftId`/`direction`/`reason`/`branchId` NÃO são aceitos (o server deriva o shift do branch da sessão e a direção do `type`). Regras:
- **`amount` precisa ser `number` e `> 0`.** Os modais guardam `valor` como **string** → fazer `Number(formData.valor)` e validar `> 0` no client antes do POST (senão Zod rejeita com 400 toda vez). **(HIGH)**
- **`method`:** omitir ou `"CASH"` (ambos são só dinheiro).
- **`note`:** compor a partir do **motivo (Select) + observações** — o endpoint só tem `note`, não há coluna `reason`. Se mapear só `observacoes`, o motivo da sangria é **perdido** (ruim para auditoria). Mapear os labels do motivo (são chaves i18n) para texto legível. **(MED)**
- Manter o estado `loading`/botão desabilitado em voo (já existe) — só o bloco `setTimeout` é substituído pelo fetch + toast de erro.
- **Enum confirmado:** `SUPPLY`/`WITHDRAWAL` são corretos (`schema.prisma:3361`). Direção: `SUPPLY→IN→soma`, `WITHDRAWAL→OUT→subtrai` (`cash.service.ts:227`) — sinal já correto, sem risco de double-count. Permissão `cash_shift.view` já é satisfeita por quem abre o modal.

### F1.3 — Histórico do turno não atualiza 🔴 (efeito de F1.1/F1.2)
- **Arquivo:** renderizado em `page.tsx:645-705` a partir de `shift.movements`.
- **Causa:** a grid está correta; não mostra nada porque nada foi persistido. Corrigir F1.1+F1.2 resolve automaticamente.

### F1.4 — "Carlos Vendedor" hardcoded na abertura 🔴
- **Arquivos:** `modal-abertura-caixa.tsx:92`, `modal-sangria.tsx:71`, `modal-reforco.tsx:71` — todos com `<span>Carlos Vendedor</span>` fixo.
- **Causa:** placeholder esquecido. O operador real ("mirabou") aparece depois porque vem de `shift.openedByUser.name` (banco).
- **Correção:** trocar a string pelo nome do usuário logado (sessão / `useSession`). Nota: confirmar que "Operador" é o usuário logado (quem executa a ação), não necessariamente quem abriu o turno — podem diferir num turno multi-usuário.

### F1.5 — Grids maiores que a tela 🔴
- **Arquivos:** `src/components/estoque/modal-saida-estoque.tsx:222` e `src/components/caixa/modal-abertura-caixa.tsx:74` — `DialogContent` só tem `max-w-*`, sem cap de altura.
- **Causa:** o `DialogContent` base (`src/components/ui/dialog.tsx:41`) é centrado verticalmente e sem `max-height`/`overflow`. Conteúdo alto estoura para fora; botões de submit caem abaixo da dobra.
- **Molde correto:** `src/components/caixa/modal-fechamento-caixa.tsx:238` usa `max-h-[90vh] overflow-y-auto`.
- **Correção:** adicionar `max-h-[90vh] overflow-y-auto` aos dois modais ofensores.

### F1.6 — (Opcional/bônus) Rótulo do estorno no caixa 🟢
- **Arquivo:** `sale.service.ts:905-930`.
- **Status:** comportamento CORRETO (cancelar venda em dinheiro estorna o caixa via `REFUND`/`OUT`). Não é bug.
- **Melhoria opcional:** rótulo/nota do movimento deixar explícito que é débito de cancelamento, para não confundir.

### Teste F1
- `modal-saida-estoque`, `modal-abertura-caixa`: abrir em viewport curto e confirmar que o botão de submit é alcançável (modal rola internamente).
- Caixa aberto: reforço R$100 → saldo sobe R$100 e movimento aparece no histórico. Sangria R$50 → saldo desce R$50, aparece no histórico.
- Abertura/sangria/reforço: caixa de "operador" mostra o nome do usuário logado, nunca "Carlos Vendedor".
- `tsc` limpo + build + revisão.

---

## F2 — Pagar conta debita o caixa

### Problema confirmado 🔴
- **Arquivos:** `src/app/api/accounts-payable/route.ts:298-426` (PATCH pay), `src/services/finance-entry.service.ts:635-675` (`generateAccountPayableExpenseEntry`).
- O PATCH flipa status para PAID e cria um `FinanceEntry`, MAS esse entry tem `financeAccountId = null` e **não** decrementa `FinanceAccount.balance`. Crédito vai para contra-passivo "Contas a Pagar 2.1.01" em vez de Caixa/Banco. Por isso não aparece no extrato (`finance/accounts/[id]/statement/route.ts:27` filtra por `financeAccountId`).
- Bug secundário: `catch {}` silencioso (route.ts:392-394) engole erros do lançamento.
- UI gap: `handleMarkAsPaid` (`financeiro/page.tsx:320-341`) envia só `{id, status, paidDate}` — sem escolher a conta pagadora.

### Correção
1. UI: adicionar seletor "Conta pagadora" (Caixa/Banco/PIX) no modal de pagamento (`financeiro/page.tsx`).
2. PATCH: receber e validar `financeAccountId` (deve pertencer à empresa).
3. Registrar `financeAccountId` no entry (creditar Caixa/Banco). **MAS o `decrement` do saldo fica no call site do PATCH, NÃO dentro de `generateAccountPayableExpenseEntry`** (essa função também é chamada pelo backfill — ver risco abaixo).
4. Remover o `catch {}` silencioso (logar erro real).

### 🛑 Requisitos de segurança OBRIGATÓRIOS (revisão adversarial — sem isto, CORROMPE saldos)

**RISCO CRÍTICO 1 — Contas pagas no código antigo NUNCA debitaram saldo.** Toda conta já paga em prod tem entry com `financeAccountId = null`. Se a reversão re-creditar cegamente, **infla o saldo com dinheiro que nunca saiu** = corrupção permanente.
- Regra: na reversão (PAID→PENDING), re-creditar (`increment`) **SOMENTE se o entry gravado tiver `financeAccountId != null`** (ou seja, foi pago sob o código novo). Reescrever `deleteAccountPayableExpenseEntry` (`finance-entry.service.ts:680-693`) para **ler o entry primeiro**, dar `increment` por `entry.amount` só se `financeAccountId` setado, e então deletar. Hoje ele faz `deleteMany` cego — trocar por `findFirst` → increment condicional → delete. **NUNCA** inferir do status da conta; ler o ledger real.

**RISCO CRÍTICO 2 — Double-decrement.** O branch PAID (route.ts:378) NÃO é guardado por `existing.status`. O upsert do entry é idempotente, mas `balance.decrement` não.
- Regra: garantir transição exatamente-uma-vez com `updateMany({ where: { id, companyId, status: { in: ["PENDING","OVERDUE"] } }, data: {...PAID} })` e **só decrementar se `count === 1`**. Isso cobre PATCH repetido, double-click E concorrência (dois PATCHes simultâneos) — o upsert sozinho NÃO garante.

**RISCO CRÍTICO 3 — Backfill craterizaria saldos.** `finance/backfill-expense-entries/route.ts:60-85` chama `generateAccountPayableExpenseEntry` para contas históricas já pagas. Se o decrement estiver DENTRO dessa função, o backfill debitaria saldo de todo pagamento histórico (dinheiro que já saiu há meses). Por isso o decrement fica no PATCH, e o backfill gera entries com `financeAccountId=null` (balance-neutro, correto).

**Outras regras:**
- Validar que o `financeAccountId` informado pertence à `companyId` ANTES de decrementar (senão debita conta de outro tenant). **(MED)**
- Re-PATCH de conta já paga editando `paidAmount`: proibir ou ajustar delta no saldo (senão desincroniza). **(MED)**
- decrement + entry + flip de status na MESMA unidade atômica, sem `catch` que engula (senão fica PAID sem decrement). **(MED)**
- `balance` é campo armazenado (não derivado de entries) e já é drift-prone, sem job de reconciliação. **Entregar um script standalone "recalcular balance a partir dos entries"** como rede de segurança. **(MED)**

### Fora de escopo (decisão do dono)
- Categoria continua enum fixo de 9 valores (`AccountCategory`). Criar categoria custom = item futuro (exigiria migration + modelo `FinanceCategory`).

### Teste F2
- Pagar a conta de água R$15 (deixada de teste) escolhendo "Caixa": saldo da conta cai R$15, lançamento aparece no extrato da conta, status vira PAID.
- **Idempotência:** repetir o PATCH de pagamento NÃO debita o saldo de novo.
- **Reversão:** marcar como pago, depois reverter (PAID→PENDING) → saldo VOLTA ao valor original (re-credita).
- Erro proposital (conta inexistente) deve aparecer (não ser engolido).
- `tsc` + build + revisão.

---

## F3 — Cancelados visíveis por papel

### Decisão do dono
Admin/Gerente **vê** vendas/pedidos cancelados (controle, com badge "CANCELADO" + toggle "Mostrar cancelados" ligado por padrão para eles). Vendedor **não vê**.

### Raiz comum
Cancelar venda só seta `status: CANCELED` (`sale.service.ts:826-831`); não usa `deletedAt`. Listagens não filtram esse status. O cancelamento JÁ cascateia corretamente (estorna estoque, cancela receivables para CANCELED, cancela OS, reverte cashback/comissões). Logo os dados não estão soltos — só não são filtrados na exibição.

### 🛑 Como detectar o papel (revisão adversarial — landmine #1)
Existem **DOIS** tipos `UserRole` no código:
- `@prisma/client` (`schema.prisma:3321`): `ADMIN`, `GERENTE`, `VENDEDOR`, `CAIXA`, `ATENDENTE` — **é o que `session.user.role` carrega** (DB→JWT→session, `auth.ts:155/228`).
- `permissions.ts:93`: `ADMIN`, `MANAGER`, `SELLER`, ... — só para mapeamento de permissão, **NUNCA está na sessão.**
- **Regra:** gatear pelos valores Prisma (`"VENDEDOR"`, `"GERENTE"`, `"ADMIN"`), usando o helper existente `checkPermission(["ADMIN","GERENTE"])` / `isAdminOrManager()` (`auth-helpers.ts:197`). Se o código comparar `=== "SELLER"`, compila, passa no build, e **silenciosamente não filtra nada** em runtime (vendedor continua vendo tudo). Esse é o erro mais provável — evitá-lo explicitamente.
- **Toggle "Mostrar cancelados":** enforçar no SERVER (ignorar o param do client para vendedor). Não confiar em esconder só o botão na UI.

### Onde aplicar
1. **Laboratórios** — `laboratories/[id]/service-orders/route.ts:28-51` (a LISTA de pedidos do modal de detalhe do lab). Vendedor → exclui CANCELED; admin/gerente → tudo com badge. **Aqui é `where.status` simples.**
   - ⚠️ **NÃO mexer no `_count.serviceOrders` / `totalOrders` do lab** (`laboratories/route.ts:101-114`). Dois motivos: (a) Prisma 5.22 não suporta `where` em `_count` por relação; (b) `totalOrders` alimenta a fórmula de taxa de sucesso `(totalOrders - totalReworks)/totalOrders` (`laboratorios/page.tsx:259-260`), e `totalReworks` é coluna armazenada não-filtrada → filtrar só o count daria taxa **negativa ou >100%**. Escopo do filtro de cancelados em labs = só a LISTA, não o contador agregado.
2. **Contas a Receber** — `accounts-receivable/route.ts:88-196` (hoje, sem param `status`, retorna todos). Vendedor → excluir CANCELED por padrão; admin/gerente → incluir com badge. **Usar `where.status = { not: "CANCELED" }` (escalar), NUNCA um segundo `where.OR`** — já existe um `OR` para busca em `:115` e sobrescrevê-lo quebraria a busca. **(MED)**
3. **Estoque (histórico)** 🟢 — NÃO é filtro. `StockMovement` é livro-razão append-only sem `saleId`/`status`; cancelamento adiciona `CUSTOMER_RETURN`. Correto. Melhoria apenas visual (parear/etiquetar SALE↔CUSTOMER_RETURN como "estornado") — baixa prioridade.
4. **Lista de vendas + dashboard/métricas** — confirmar na implementação se a listagem de vendas (`vendas/`) e as métricas financeiras já filtram CANCELED. Se não, aplicar o mesmo critério por papel. (Fora do diagnóstico original mas implícito na queixa "cancelados visíveis"; verificar antes de fechar F3.)
- **Multi-tenant:** o filtro de papel é ADICIONAL ao `companyId` (que já existe via objeto literal seedado com `companyId` primeiro). Confirmado sem risco de vazamento entre tenants desde que não se reatribua o `where` inteiro.

### Como decidir o papel
Usar role da sessão (`ADMIN`/`GERENTE` vs `VENDEDOR`) já disponível via `auth-helpers`. Backend decide o payload; front exibe badge "CANCELADO" para quem recebe os cancelados. Toggle "Mostrar cancelados" para admin/gerente.

### Teste F3
- Como vendedor: Laboratórios não conta pedidos cancelados; Contas a Receber não lista parcela de venda cancelada.
- Como admin: vê os cancelados com badge; toggle "Mostrar cancelados" alterna a visão.
- `tsc` + build + revisão.

---

## F4 — Cadastros (Marca/Categoria) + Número de venda

### F4a — Criar Marca e Categoria 🟡
- **Arquivos:** `produtos/novo/page.tsx:251-286` (dropdowns), `api/brands/route.ts` e `api/categories/route.ts` (só GET). Modelos `Brand`/`Category` existem; criação só acontecia via `upsert` na importação de planilha.
- **Correção:**
  1. Adicionar `POST /api/brands` e `POST /api/categories` (criar por nome, scoped `companyId`, anti-duplicado).
  2. Criação inline "+ Nova" nos dois `Select`, espelhando o padrão `src/components/supplier-select.tsx` (mini-dialog → cria → seleciona).
- **Tipo** (`ProductType`) continua enum fixo — correto, não precisa criação.
- **(Fornecedor já resolvido na F1.4? Não — fornecedor é F1 separado.)** Nota: o botão "Novo Fornecedor" standalone (`fornecedores/page.tsx:361`, stub `toast("Em desenvolvimento")`) é corrigido na F1 plugando `ModalFornecedorRapido` (`POST /api/suppliers` já funciona). Listado aqui só para rastreabilidade.

### F4b — Número de venda sequencial (`#cmopsjhm` → `#000123`) 🟡
- **Causa:** `Sale` não tem campo `number` (`schema.prisma:1119`). Mostra-se `sale.id.substring/slice`. Infra pronta: `Counter` + `getNextSequence` (`src/lib/counter.ts:20`) com chave `"sale"` **reservada mas não usada**. Existe dead code `(sale as any).number` em `sales/[id]/pdf/route.ts:104` (cai sempre em "000000").
### 🛑 Correções da revisão adversarial — sem isto, QUEBRA criação de venda

**LANDMINE 1 — Deploy de migration é MANUAL (não automático).** A memória dizia "build roda `prisma migrate deploy`" — **está DESATUALIZADO.** Foi removido em 02/06 (commit `d9a229f`, timeout de advisory lock no Neon pooler). Hoje `package.json:7` é só `"build": "next build"`; migrations rodam manualmente via `npm run migrate:deploy`. Logo código e migration NÃO são atômicos — a ordem do deploy importa muito.

**LANDMINE 2 — Existe um SEGUNDO caminho de criar venda.** Além de `sale.service.ts:625`, há `quote.service.ts:905` (`convertToSale`, conversão de orçamento→venda) que faz `tx.sale.create` direto, sem passar por `sale.service.create`. **Os DOIS precisam chamar `getNextSequence`**, senão após o NOT NULL+unique toda conversão de orçamento falha (P2002/NOT NULL).

**LANDMINE 3 — NÃO copiar `@default(0)` da OS.** `ServiceOrder.number` é `Int @default(0)`. Se Sale.number tiver default 0, qualquer insert que esqueça de numerar grava 0, e o 2º colide no unique. Sale.number deve ser **NOT NULL sem default** — força a app a sempre suprir via `getNextSequence`.

**Sequência segura para ESTE repo:**
1. **Patchar PRIMEIRO os dois caminhos de código** (`sale.service.ts:625` + `quote.service.ts:905`) para chamar `getNextSequence(companyId, "sale", tx)` dentro da transação existente, com a coluna ainda **nullable** (writes funcionam, sem quebrar nada). Deploy desse código.
2. **Uma única migration (raw SQL, tudo num `migration.sql`, atômico):** (a) `ADD COLUMN number INT` nullable → (b) backfill com `ROW_NUMBER() OVER (PARTITION BY companyId ORDER BY createdAt ASC, id ASC)` (tiebreaker em `id` evita colisão em createdAt igual; incluir soft-deleted) → (c) seed `Counter` key `"sale"` no `MAX(number)` por empresa → (d) `SET NOT NULL` → (e) `ADD CONSTRAINT unique (companyId, number)`. Rodar via `npm run migrate:deploy` DEPOIS do passo 1 confirmado. **Backfill como SQL na migration, NUNCA script manual separado** (footgun: operador esquece e o NOT NULL falha).
3. `getNextSequence` (`counter.ts:20-42`) é atômico (`upsert` + `increment` = `ON CONFLICT DO UPDATE SET value=value+1`), seguro sob concorrência — **desde que todo caminho de insert o use** (por isso a LANDMINE 2 é crítica).
4. Criar `src/lib/sale-number.ts` (`saleDisplayNumber(sale)` → `#000123`, fallback CUID onde `number` null) — **só helper de exibição, reusa `getNextSequence`, não é segunda fonte de sequência.**
5. Atualizar os `select` das APIs para incluir `number` ANTES de trocar a exibição (senão o PDF continua imprimindo "000000").
6. Trocar todos os `sale.id.substring/slice` pelo helper (vendas/imprimir, devoluções, clientes, recibo, carnês, receipt) e a descrição "Parcela 2/4 - Venda #..." (`sale-side-effects.service.ts:253,276`). Remover `as any` em `pdf/route.ts:104`.

- **Limitação aceita:** descrições JÁ gravadas (parcelas/ledger antigos) permanecem com CUID — só novas saem com número. Não backfillar texto antigo (arriscado).
- **Atenção:** parte mais sensível do sprint. Testar em cópia do banco antes de prod.

### Teste F4
- Produto novo: criar Marca e Categoria inline; aparecem selecionadas e persistidas.
- Nova venda: recebe número sequencial; exibida como `#000123` em lista/recibo/carnê. Venda legada cai no fallback sem quebrar.
- Migration aplica e backfill numera sem colisão (`@@unique` respeitado).
- `tsc` + build + revisão.

---

## F5 — PDFs com header único

### Problema confirmado 🟡
- Logo vive em `CompanySettings.logoUrl` (data-URL base64, `schema.prisma:1795`). Upload em Configurações > Aparência funciona.
- Funciona em ~6 docs (recibo de venda PDF/print, OS, orçamento, recibo AR, relatório de estoque).
- **NÃO funciona** em: Relatório de Caixa (`caixa/[id]/relatorio/page.tsx` — sem logo/nome/CNPJ, o pior), carnê (jsPDF e HTML), comprovante de movimentação (`comprovante-movimentacao.tsx` — hardcoded "PDV Ótica"), recibo compartilhável (`recibo/[token]`), e ~14 relatórios via `report-export.ts`.
- Componentes `src/components/print/print-header.tsx` e `src/components/shared/company-logo.tsx` existem mas são **código morto**.
- Tamanhos de logo inconsistentes (40×18mm, 45px, 50px, h-16...).

### Decisão do dono
Padronizar **TODOS** com header único.

### Correção — UMA fonte de dados, TRÊS renderizadores (revisão adversarial)
⚠️ **`PrintHeader` é React + `next/image` → só funciona nas páginas client `window.print()`.** Os carnês/relatórios são server-side (jsPDF/HTML string) e **não conseguem renderizar React**. O hook `useCompanySettings` também é client-only. Portanto NÃO é "um componente único"; é uma fonte de dados + 3 renderizadores:

1. **Fonte única de dados:** `{ logoUrl, companyName, cnpj, address, phone, email }` de `Company` + `CompanySettings`. Páginas client via hook; **rotas server leem `prisma.companySettings.findUnique` direto** (como `sales/[id]/pdf/route.ts:57-61` já faz).
2. **Três renderizadores compartilhando essa fonte:**
   - **React** (`PrintHeader`, já existe): páginas client `window.print()` — Relatório de Caixa, recibo token, comprovante de movimentação, vendas/OS/orçamento imprimir.
   - **HTML-string helper** (novo): `receipt`, carnê HTML, `products/print`. Header como string HTML com `<img>` (não `next/image`). Validar prefixo `data:image/` no `src` (evita `src="javascript:"`).
   - **jsPDF helper** `drawPdfHeader(doc, company)` (novo): sales PDF, carnê jsPDF, ~14 relatórios via `report-export.ts` (resolve os 14 de uma vez) + 2 carnês.
3. **Consertar carnê jsPDF** (`pdf-utils.ts:13`) que aceita `logoUrl` mas nunca desenha (param morto).
4. **Padronizar tamanho/posição** da logo.

### 🛑 Logo no jsPDF NÃO pode derrubar PDFs que já funcionam (revisão adversarial — MED)
`CompanySettings.logoUrl` é upload do usuário (não-confiável). Um logo WEBP/SVG/grande/malformado faz `jsPDF.addImage` **lançar exceção e dar 500** num recibo que antes funcionava (regressão). Já existe o padrão defensivo correto em `sales/[id]/pdf/route.ts:70-83` — **copiar exatamente** em todo render jsPDF:
- validar prefixo `data:image/(png|jpe?g)` (WEBP é caso real e quebra — `addImage` não suporta),
- `try/catch` com fallback para desenhar o nome da empresa como texto,
- limitar tamanho exibido.
No HTML-string o risco é menor (logo ruim só vira ícone quebrado, sem 500), mas validar o prefixo mesmo assim.

### Fatiamento interno (testar entre cada)
- **F5a:** Relatório de Caixa + docs mais impressos (recibo de venda, OS) → testar.
- **F5b:** carnê (jsPDF + HTML) + comprovante de movimentação → testar.
- **F5c:** ~14 relatórios via `report-export.ts` → testar.

### Teste F5
- Trocar a logo em Configurações reflete em TODOS os documentos.
- Relatório de Caixa sai com logo + nome + CNPJ, layout de impressão limpo (sem cinzas de tela).
- Comprovante de movimentação não mostra mais "PDV Ótica" hardcoded.
- `tsc` + build + revisão.

---

## Itens explicitamente FORA de escopo desta rodada
- Categoria de conta a pagar customizável (fica enum fixo).
- Backfill de descrições textuais antigas com o novo número de venda.
- Pareamento visual avançado no histórico de estoque (apenas etiqueta simples se sobrar tempo).
- Refatorar o "zerar sistema" em transação fatiada (apenas documentar que reset parcial deixa resíduo; orientar usar "ZERAR SISTEMA" completo).

## Riscos e mitigação (consolidado pós-revisão adversarial)
Os detalhes técnicos estão nas seções 🛑 de cada frente. Resumo dos riscos que PODERIAM danificar o sistema, agora endereçados na spec:
- **F4b — quebrar criação de venda (P2002/NOT NULL):** mitigado por (1) patchar os DOIS caminhos de insert, (2) coluna sem `@default(0)`, (3) deploy do código antes do NOT NULL, (4) migration manual (não automática). **Maior risco do sprint.**
- **F2 — corromper saldos:** mitigado por re-creditar reversão só com `financeAccountId != null`, transição atômica `updateMany` exatamente-uma-vez, decrement fora do backfill, validação de tenant, e script de reconciliação de saldo.
- **F3 — filtro no-op silencioso:** mitigado por gatear no enum Prisma (`VENDEDOR`/`GERENTE`/`ADMIN`), nunca `SELLER`/`MANAGER`; não filtrar `_count` de labs; não sobrescrever `where.OR` de busca; toggle enforçado no server.
- **F5 — derrubar PDFs existentes:** mitigado por validação de prefixo + try/catch no `addImage` (copiar `sales/[id]/pdf/route.ts:70-83`); e por aceitar que `PrintHeader` é só p/ páginas client (3 renderizadores).
- **F1 — 400 e perda de auditoria:** mitigado por `Number(amount)` + compor `note` com motivo+observações.
- **Geral:** testar em cópia do banco antes de prod nas frentes com migration (F4b); smoke manual do dono ao fim de cada frente.

## Critérios de aceite (resumo)
Todas as 15 queixas da rotina de testes endereçadas, com cada frente testada antes da próxima, `tsc` limpo, build verde, revisão de código por frente, e smoke manual do dono ao final. Nenhuma regressão em: criação/conversão de venda, saldos financeiros, recibos/PDFs existentes, isolamento multi-tenant.
