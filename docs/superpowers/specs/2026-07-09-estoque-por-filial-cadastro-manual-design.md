# Estoque por filial no cadastro/edição manual de produto — Design

**Data:** 2026-07-09
**Origem:** Item 1 do QA dogfood 09/07 (aprovado). Passou pela forja (painel adversarial) → abordagem escolhida pelo dono: **seletor de filial no formulário, default = filial ativa**.
**HEAD de referência:** `57bde97`.
**Migração de banco:** nenhuma.

---

## Problema

No PDV de ótica, cadastrar um produto pela tela com "Quantidade em Estoque = 10" **não cria a linha `BranchStock`** em empresa multi-filial. No checkout, a venda acusa "Estoque insuficiente. Disponível: 0" mesmo com estoque cadastrado — o "estoque fantasma".

**Raiz (verificada):** duas fontes de verdade divergentes.
- `Product.stockQty` é um **cache/soma global** (mostrado no card do PDV).
- A venda **valida e debita** de `BranchStock.quantity` (estoque **por filial**, `Int`).
- `syncBranchStock` (`src/services/product.service.ts:284-303`) **aborta de propósito** em multi-filial: `if (branches.length !== 1) return;`. Justificativa documentada (linhas 275-280): escrever a soma numa única filial corromperia a distribuição feita por transferência.
- Na edição, `update` (`product.service.ts:472-479`) passa `updated.stockQty` (a **soma**) ao `syncBranchStock` — se o abort fosse simplesmente removido, a edição estamparia a soma numa filial e corromperia a distribuição (foi o FATAL que matou a abordagem "espelhar importador puro" no painel).

## Decisões (travadas com o dono)

1. **Filial do estoque em multi-filial:** seletor no formulário, default = filial ativa do topo.
2. **Semântica do campo de estoque em multi-filial:** "quantidade **nesta filial**", nunca a soma global.
3. **Edição de produto com estoque distribuído:** o campo mostra/edita apenas a quantidade da **filial selecionada**; as outras filiais ficam intactas; a soma é recalculada.
4. **Non-admin (VENDEDOR/CAIXA/ATENDENTE):** sem seletor — estoque entra na filial da sessão deles (rótulo fixo). Só ADMIN/GERENTE escolhem.
5. **ADMIN com filial ativa = "ALL":** não bloquear submit; servidor cai no default seguro (principal/mais antiga ativa) e a UI mostra em qual filial entrou.

---

## Comportamento

### Loja única (maioria) — NADA muda
Sem seletor, sem campo novo. `syncBranchStock` grava `stockQty` na única filial. Caminho atual, preservado por construção.

### Multi-filial
| Papel | Seletor "Estoque nesta filial" | Default |
|---|---|---|
| ADMIN / GERENTE | dropdown de filiais ativas | filial ativa do topo; se "ALL" → principal/mais antiga ativa |
| VENDEDOR / CAIXA / ATENDENTE | rótulo fixo "Estoque entra em: Filial X" | filial da sessão (não editável) |

- **Cadastro novo:** o número é o estoque inicial **daquela filial**.
- **Edição:** o campo mostra o que a **filial selecionada** tem hoje (ex.: matriz=3). Salvar grava esse número nessa filial; irmãs intactas; `stockQty` recalculado como soma.

---

## Arquitetura e fluxo de dados

### Helper novo — `resolveStockBranchId` (resolução segura, fecha o IDOR)
Espelha `resolveReportBranchId` (`src/lib/resolve-report-branch.ts:25`), mas para o **write path** de estoque. `branchId` do cliente é **sugestão validada, nunca autoridade**.

**Duas divergências deliberadas vs. `resolveReportBranchId` (não "consertar" para igualar):**
- Recebe `tx` porque roda **dentro** do `$transaction` de create/update — a leitura de validação da filial e o fallback "principal/mais antiga ativa" precisam usar a mesma `tx` do upsert seguinte, para consistência. O helper de relatório lê pelo `prisma` do módulo, fora de transação.
- Recebe `session` como parâmetro em vez de chamar `requireAuth()` internamente — a camada de service não deve re-autenticar; a rota já autenticou e injeta a sessão.

```
resolveStockBranchId(requestedBranchId, session, tx) → branchId | null
  - sem branchId / "ALL" / == filial da sessão:
      · filial da sessão (getBranchId), se houver
      · ADMIN em "ALL" sem filial de sessão → principal/mais antiga ativa
  - branchId diferente da filial da sessão:
      · só ADMIN/GERENTE (CROSS_BRANCH_ROLES); senão forbiddenError (403)
      · valida que a filial pertence ao companyId E está active; senão 403
  - empresa sem filial ativa → null (não grava BranchStock; não quebra o cadastro)
```

- Papéis: reusa `CROSS_BRANCH_ROLES = ["ADMIN","GERENTE"]`.
- Multi-tenant: filtro por `companyId` sempre. Nunca confia no `activeBranchId` do localStorage como autoridade.

### `resyncProductStockCache(tx, productId)` (helper extraído)
Extrai o `$executeRaw` **que já existe** em `stock-movement.service.ts:292-301`:
```sql
UPDATE "Product"
SET "stockQty" = (SELECT COALESCE(SUM("quantity"),0) FROM "branch_stocks" WHERE "product_id" = $1),
    "updatedAt" = NOW()
WHERE "id" = $1
```
- Precedido de `SELECT ... FOR UPDATE` na linha do `Product` (mesma transação) para evitar lost-update entre edição e venda concorrente.
- `stock-movement.service.ts` passa a consumir o helper. **Atenção:** o `FOR UPDATE` é comportamento **novo** — o `$executeRaw` atual não trava a linha. Isso é uma melhoria intencional de correção (não regride o caller de stock-movement), então não é "só desduplicação" pura: é desduplicação + hardening da race. Verificar que o lock adicional não conflita com a transação de ajuste de estoque.

### `syncBranchStock` reescrito (`product.service.ts:284-303`)
Assinatura ganha `branchId?: string`.
1. `if (!stockControlled) return;` (igual hoje).
2. `target = await resolveStockBranchId(branchId, session, tx)`. Se `null` → return (empresa sem filial ativa).
3. Guard `quantity >= 0` (defensivo; `BranchStock.quantity` é `Int` sem CHECK constraint).
4. `upsert` do `BranchStock` de `target` com a **quantidade da filial-alvo** (o número que o campo agora significa).
5. `await resyncProductStockCache(tx, productId)`.

### `create` / `update` (`product.service.ts`)
- **Mudança-chave:** hoje passam `created.stockQty` / `updated.stockQty` (a **soma**) para `syncBranchStock`. Passarão a quantidade da **filial-alvo** (o valor do campo) + o `branchId` resolvido + a sessão.
- `update`: o guard `stockEdited` (hasOwnProperty `stockQty`) **permanece** — editar só nome/preço não mexe em estoque.

### API — `POST /api/products` (create) e `PUT /api/products/[id]` (update)
> Rotas reais confirmadas: create = `POST /api/products`; update = `PUT /api/products/[id]` (`src/app/api/products/[id]/route.ts:42`). **Não existe PATCH.**
- Schema Zod (`src/lib/validations/product.schema.ts`): `+ branchId: z.string().optional()` no create e no update.
- Rota resolve a sessão (padrão da casa) e repassa `branchId` + sessão ao service. `companyId` sempre da sessão, nunca do body.

### Read-path na edição (fonte da quantidade por filial — SEM endpoint novo)
`getById` (`product.service.ts:230`) **já inclui** `branchStocks: { include: { branch: { id, name } } }` (linhas 249-250), então o `GET /api/products/[id]` já devolve a quantidade por filial. O form de edição:
- Em multi-filial, preenche o campo de estoque com `branchStocks.find(bs => bs.branchId === filialSelecionada)?.quantity ?? 0` — **não** com `stockQty` (a soma).
- Trocar a filial no seletor re-preenche o campo a partir do mesmo `branchStocks` já carregado (sem novo fetch).
- Loja única: comportamento atual (usa `stockQty`, que é igual à única filial).

### Form (`produtos/novo/page.tsx` e `produtos/[id]/editar/page.tsx`)
- Bloco condicional "Estoque nesta filial": só renderiza quando a empresa tem ≥2 filiais ativas.
- ADMIN/GERENTE: `<Select>` (shadcn) de filiais, seed = `useBranchContext().activeBranchId` (se filial real; se "ALL" → principal/mais antiga).
- Non-admin: rótulo fixo com a filial da sessão.
- **Edição:** campo lê a quantidade da filial selecionada via `branchStocks` (ver read-path acima).
- Copy inline: "Este estoque entra em **[Filial X]**. Para dividir entre filiais, use Transferências."

**Blast radius:** `product.service.ts` (create/update/syncBranchStock), novo arquivo `src/lib/resolve-stock-branch.ts`, `stock-movement.service.ts` (consome helper extraído), `product.schema.ts`, `POST /api/products` + `PUT /api/products/[id]`, 2 telas de form. **Não toca** sale / refund / FIFO / adjustment / transfer.

---

## Erros e edge cases

| Caso | Comportamento |
|---|---|
| `branchId` de outra empresa / inválido | 403 (`forbiddenError`), nunca grava cross-tenant |
| Non-admin manda `branchId` ≠ dele (request forjado) | 403 (UI não oferece, servidor é a verdade) |
| ADMIN em "ALL" | cai na principal/mais antiga ativa; UI mostra a filial escolhida; não trava submit |
| Empresa sem filial ativa | não grava BranchStock, não quebra o cadastro (return silencioso) |
| Quantidade negativa | guard `>= 0` na aplicação antes do upsert |
| Edição sem tocar estoque (só nome/preço) | `stockEdited` false → não mexe em BranchStock |
| Loja única | resolve p/ única filial; SUM = número; `stockQty` idêntico ao atual |

---

## Testes (`src/services/__tests__/product-branchstock-sync.test.ts`)

- **INVERTE** o caso `:82-96` ("NÃO toca BranchStock em multi-filial") → agora **grava** na filial-alvo resolvida.
- Novos casos:
  - (a) multi-filial grava na filial do seletor;
  - (b) edição da filial A **não altera** filial B (preserva distribuição);
  - (c) `stockQty == SUM(BranchStock)` após create e após edit;
  - (d) non-admin pedindo outra filial → 403;
  - (e) ADMIN "ALL" → cai na principal/mais antiga;
  - (f) loja única segue idêntico;
  - (g) `stockControlled=false` ignora.
  - (h) **read-path:** `getById` de produto multi-filial retorna `branchStocks` com a quantidade por filial (a UI consegue exibir a quantidade da filial selecionada, não a soma).
- Casos existentes de loja única e sem-controle permanecem válidos.

**Verificação ao fim:** `tsc` + suite do service verde.

---

## Fora de escopo (YAGNI — cortado pelo painel)

- Distribuir automaticamente a quantidade entre filiais (rebalanceamento é via Transferências, fluxo que já existe).
- Refactor global do invariante de estoque (auditar todos os `SET stockQty`): matado pelo painel como refactor grande disfarçado, colide com sale-path lockstep e adjustment increment (caminhos financeiros já auditados).
- Grid por-filial no formulário / edição de múltiplas filiais numa tela.
- Bloquear submit no caso "ALL".

## Deploy
Padrão da casa: merge → `vercel deploy --prod`. **Sem migração.**
