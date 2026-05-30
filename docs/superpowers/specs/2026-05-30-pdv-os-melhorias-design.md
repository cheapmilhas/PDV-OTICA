# Design Spec — Melhorias PDV/OS (6 demandas)

**Data:** 2026-05-30
**Stack:** Next.js 14 (App Router), Prisma, PostgreSQL (Neon), Shadcn UI + Tailwind
**Entrega:** Um sprint por vez, com deploy e validação em produção entre cada um.
**Deploy:** Manual via `vercel deploy --prod --yes` (auto-deploy Git não dispara). Plano Hobby (cron diário).

---

## Contexto / validação do código atual

Investigação feita em 2026-05-30 (3 agentes paralelos). Achados que fundamentam o plano:

- **Desconto:** existe só por ITEM no PDV (`CartItem.discountValue/discountType`). `const desconto = 0` é hardcoded em `pdv/page.tsx`. O backend `createSaleSchema` **já aceita** `Sale.discount` (nível venda), mas o PDV sempre envia 0.
- **`stockControlled`:** existe no schema (`Product`, default true) e a API de update **aceita** o campo. O `Switch` existe na tela de CRIAÇÃO (`produtos/novo/page.tsx`) mas **está ausente** na EDIÇÃO (`produtos/[id]/editar/page.tsx`).
- **Lembretes:** a tela `/dashboard/lembretes` lê `CustomerReminder` via `/api/crm/reminders`. O lembrete pós-venda (`POST_SALE_30_DAYS`) é criado em `sale-side-effects.service.ts`. O `cancel()` em `sale.service.ts` só cancela lembretes com status `["PENDING","SCHEDULED"]` — **deixa `IN_PROGRESS` órfão**, filtra por `customerId` (não por venda), e engole erros no catch. **Bug confirmado** (caso Andrea).
- **Fluxo OS↔Venda:** hoje é **OS → Venda** (cria OS na página própria, depois "Gerar Venda" leva ao PDV via `?serviceOrderId`). A venda NÃO cria OS. `Sale.serviceOrderId` é o FK (1:1 opcional). `Product.type` (OPHTHALMIC_LENS, CONTACT_LENS, LENS_SERVICE) existe no schema mas **NÃO chega ao carrinho do PDV** (interface Product do PDV só tem id/sku/name/salePrice/stockQty/stockControlled).
- **Garantia/retrabalho:** `createWarranty` gera **número sequencial novo** + `originalOrderId` (vínculo). A letra -G/-R é só formatação no front (`osNum()`). Não há campo de sufixo. `@@unique([companyId, number])` impede reusar número.
- **Receita:** `prescriptionData Json?` na OS, **editável** via `PUT /api/service-orders/[id]` (bloqueia se DELIVERED). A página `imprimir` re-renderiza da `prescriptionData`.

---

## Decisões do usuário (brainstorming 2026-05-30)

1. OS criada automaticamente **ao finalizar a venda no PDV** (quando há lente).
2. Detecção de lente: **pelo `Product.type`** (auto) **+ botão "Converter para OS"** manual na venda.
3. Garantia: **mantém número novo** (#1240-G) vinculado à original — sem campo de sufixo.
4. Desconto no total da venda: **livre por enquanto** (sem override de gerente).
5. Ritmo: **um sprint por vez, com deploy**.

---

## Diretrizes de design (Shadcn UI / ui-ux-pro-max)

- **Dialog** para forms/confirmações (já é o padrão). Não usar Alert como modal.
- Todo submit: **loading → success/error** com feedback (toast). Sem sucesso silencioso.
- **Confirmação antes de ações destrutivas/sensíveis** (cancelar venda, alterar receita por erro médico).
- **Erro próximo ao problema** (borda vermelha + mensagem no campo).
- Input monetário: `type=text` + `inputMode=decimal` + normalização vírgula/ponto (padrão já adotado hoje no PDV).
- `FormLabel` visível (não usar placeholder como único rótulo). Ícones Lucide `h-4 w-4`. Sem emoji como ícone de UI.
- Badge para status/vínculo (OS vinculada, receita alterada).

---

## SPRINT 1 — Quick wins (baixo risco) 🟢

### 1a. Desconto no valor TOTAL da venda
- **Arquivos:** `modal-finalizar-venda.tsx`, `pdv/page.tsx`.
- **UI:** campo "Desconto da venda" no resumo do modal, com toggle R$/%. Input `type=text inputMode=decimal`, normaliza vírgula→ponto. Recalcula Total e Falta em tempo real.
- **Regra:** valor entra em `Sale.discount` (nível venda), separado dos descontos por item. Validação: desconto ≤ subtotal. Sem override de gerente (decisão #4).
- **Backend:** já aceita; só parar de enviar 0 fixo e enviar o valor calculado.

### 1b. Toggle "Controla estoque" na edição de produto
- **Arquivo:** `produtos/[id]/editar/page.tsx`.
- **UI:** replicar o `Switch` "Controlar Estoque" da tela de criação (mesmo texto explicativo). Ler `stockControlled` ao carregar; incluir no payload do PUT.

### 1c. Bug do lembrete na venda cancelada
- **Arquivo:** `sale.service.ts` (`cancel()`), passo 9.
- **Fix:** incluir `IN_PROGRESS` no status do cleanup; logar falhas (não engolir). Avaliar vincular o lembrete à venda (saleId) para limpeza precisa por venda em vez de por cliente.
- **Critério:** cancelar a venda remove o lembrete dela da tela `/dashboard/lembretes`, inclusive se já estiver `IN_PROGRESS`.

**Deploy + validação do Sprint 1 antes do Sprint 2.**

---

## SPRINT 2 — Converter venda → OS 🟡 (demandas 3 e 4)

- **Propagar `Product.type`** até o carrinho do PDV (interface Product, select de produtos, convert).
- **Ao finalizar venda** com item de tipo lente (OPHTHALMIC_LENS/CONTACT_LENS/LENS_SERVICE): criar `ServiceOrder` automaticamente, vinculada à venda (`Sale.serviceOrderId`), com itens/cliente preenchidos, status DRAFT. Pendente: receita + imprimir.
- **Botão "Converter para OS"** manual na venda finalizada (para vendas sem lente detectada / produtos mal cadastrados).
- **UI:** após finalizar venda com lente, dialog/toast "OS #X criada — completar receita?" com ação para abrir a OS. Badge de OS vinculada na venda.
- **Demanda 4:** com a OS nascendo da venda, remover/ocultar o fluxo "gerar venda quando produto fica pronto" (ou manter só legado — decidir na implementação).
- **Risco:** inversão de fluxo. Cuidar de não quebrar o fluxo OS→venda existente para quem ainda usa.

**Deploy + validação antes do Sprint 3.**

---

## SPRINT 3 — Garantia/retrabalho com vínculo 🟠 (demanda 5)

- **Escopo enxuto** (usuário abandonou o "1234-A"): apenas melhorar **exibição/rastreabilidade** do vínculo com a OS original.
- **UI:** "Garantia da OS #001234" como badge + link na nova OS de garantia/retrabalho. A letra -G/-R já existe.

**Deploy + validação antes do Sprint 4.**

---

## SPRINT 4 — Erro médico + reimpressão de receita 🔴 (demanda 6)

- **Arquivos:** modal de garantia (`ordens-servico/page.tsx`), update de OS, página imprimir.
- **Novo:** checkbox/campo **"Erro médico"** no modal de garantia. Schema: novo campo em ServiceOrder (ex.: `isMedicalError Boolean` + motivo) ou flag no warranty.
- **Fluxo:** se erro médico → guiar edição da receita (já editável) → após salvar, botão **"Reimprimir OS"**.
- **UI:** confirmação antes de alterar receita (ação sensível). Badge "Receita alterada (erro médico)".

**Deploy + validação. Fim.**

---

## Ordem e racional

Risco crescente: Sprint 1 (campos isolados + bugfix) → Sprint 2 (inversão de fluxo, maior risco) → Sprint 3 (só UI) → Sprint 4 (schema + fluxo de receita). Cada sprint é deployável e testável sozinho, permitindo validação em produção entre eles.
