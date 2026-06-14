# Plano: Reconciliar drift de cobrança (item 2) + Busca global cmd+K na admin (item 3)

> **Status:** PROPOSTA para análise/aprovação do dono. Nada implementado ainda.
> **Data:** 2026-06-14
> **Branch base:** `feat/admin-redesign-light` (admin redesign 100% em prod)

Este documento descreve **o que muda de fato no sistema** em dois trabalhos independentes. Cada um pode ser aprovado/recusado separadamente.

---

# ITEM 2 — Reconciliar o drift de schema da cobrança Asaas

## O problema em uma frase
O fluxo de **cobrança Asaas** foi deployado em produção (worktree `feat/saas-cobranca-fase2`), então **o banco de produção já tem** colunas, uma tabela e valores de enum que **não existem na main nem na branch admin**. Isso é um *drift*: o código-fonte "oficial" (main) está desatualizado em relação ao banco real.

## O que está divergente (medido, não estimado)
**Schema (banco de prod já tem, main não):**
- `Invoice.isManual` (boolean) e `Invoice.source` (texto) — marcam cobranças avulsas/manuais.
- `Invoice` índice único `(subscriptionId, asaasPaymentId)` — anti-cobrança-duplicada.
- `SaasEmailConfig` +3 flags: `invoiceGenerationEnabled`, `invoiceCreatedEnabled`, `invoiceDueSoonEnabled`.
- `SaasEmailType` enum +2 valores: `INVOICE_CREATED`, `INVOICE_DUE_SOON` (estes **já trouxe** no fix de hoje).
- Tabela nova `SaasCounter` — contador global do número de fatura (`INV-NNNNNN`).
- 2 migrations: `20260611120000_saas_invoice_fase2` e `20260611140000_invoice_manual`.

**Código de feature (56 arquivos, ~2.100 LOC):** serviços Asaas, geração/envio de fatura, cobrança avulsa, cron de lembretes, botões na tela de faturas. **Tudo isso já roda em prod** (deployado do worktree), mas não está na main.

## Por que isso importa (o risco real)
1. **Toda vez que alguém deploya de uma branch que NÃO é a de cobrança, o código de cobrança some do bundle em produção** — mas o banco continua com os dados. Foi exatamente o que gerou o bug de hoje (a tela de emails quebrou ao ler logs `INVOICE_CREATED`). É uma bomba-relógio: cada deploy "limpo" pode quebrar a cobrança ou telas que leem dados dela.
2. **`prisma migrate dev` em qualquer sessão futura vai querer "resetar" o banco** para bater com o schema desatualizado da main — risco de perda de dados. (A memória já registra "drift cockpit" pausado pelo mesmo motivo.)

## Decisão central que VOCÊ precisa tomar
Há duas formas de reconciliar, com impactos bem diferentes:

### Opção 2A — Trazer SÓ o schema (Recomendado para fechar o risco rápido)
**O que muda no sistema:**
- Adiciona ao `schema.prisma` da branch: as 5 colunas, o índice, a tabela `SaasCounter`.
- Adiciona as 2 migrations (idempotentes — em prod são no-op, os objetos já existem).
- **NÃO traz o código de feature da cobrança.**

**Efeito prático:** o schema-fonte passa a refletir o banco real. `prisma generate`/`migrate status` param de divergir. Telas que leem esses dados (como a de emails, que já corrigi) ficam blindadas em qualquer branch. **Mas** a feature de cobrança (criar fatura avulsa, reenviar, cron de lembrete) continua existindo só no worktree — se você deployar da branch admin, esses botões/rotas não aparecem.
- **Esforço:** pequeno (P) — meio dia.
- **Risco:** baixo (aditivo, sem código novo de comportamento).
- **Quando faz sentido:** você quer parar o sangramento do drift agora, e a cobrança continua sendo operada/deployada pelo worktree dela por enquanto.

### Opção 2B — Trazer TUDO (consolidar a cobrança na main de vez)
**O que muda no sistema:**
- Tudo da 2A **+** os 56 arquivos de código: serviços Asaas, geração de fatura, cobrança avulsa, cron `invoice-reminders` (vercel.json), botões "Nova cobrança / Reenviar / Sincronizar faturas" nas telas de faturas/inadimplência.
- A partir daí, **um único deploy da main tem tudo** (admin redesign + cobrança + caixa, se também consolidado).

**Efeito prático:** acaba de vez a fragmentação de worktrees. A cobrança vira parte oficial do sistema. **Mas** exige resolver conflitos: as telas `/admin/financeiro/faturas/*` foram migradas por mim (tema claro) E modificadas pela cobrança (botões) — os dois trabalhos colidem nos mesmos arquivos e precisam ser casados à mão.
- **Esforço:** grande (G) — 2 a 3 sessões, com rebase cuidadoso.
- **Risco:** médio (merge de 56 arquivos, telas em conflito, precisa re-testar o fluxo de cobrança inteiro).
- **Quando faz sentido:** você quer encerrar a era dos worktrees paralelos e ter um só código-fonte verdadeiro.

> **Minha recomendação:** **2A agora** (fecha o risco de drift com baixo esforço) e **2B depois**, como um projeto dedicado de "consolidação na main" que junte cobrança + caixa + admin de uma vez — porque hoje há 3 trabalhos paralelos não-mergeados e fazer um merge grande de cada vez é mais seguro que três merges parciais.

## Arquitetura da Opção 2A (a que recomendo aprovar)
- **Arquivos tocados:** só `prisma/schema.prisma` (+5 colunas, +1 model, +1 índice) e 2 pastas de migration copiadas do worktree.
- **Nada de lógica/UI muda.** Zero risco de regressão funcional.
- **Validação:** `prisma generate` + `prisma migrate status` (deve dizer "em dia" contra prod) + `tsc` + suite + build. Como prod já tem os objetos, é confirmação, não alteração.

---

# ITEM 3 — Busca global cmd+K na admin (command palette)

## O que é
Apertar **⌘K** (Mac) / **Ctrl+K** (Windows) em qualquer tela da admin abre uma paleta de busca (estilo Linear/Vercel/Raycast) que permite: (a) **navegar** rápido para qualquer página da admin, e (b) **buscar empresas/clientes** por nome/CNPJ e pular direto para a ficha.

## O que muda de fato no sistema (a experiência)
**Hoje:** para ir de "Dashboard" para "Inadimplência" ou achar a empresa "Óticas Atacadão", você clica no menu, navega, usa filtros.
**Depois:** ⌘K → digita "inad" → Enter (vai pra Inadimplência). Ou ⌘K → digita "atacad" → aparece a empresa → Enter (abre a ficha). Sem tirar a mão do teclado. Dá uma cara de produto profissional e é o item que mais "impressiona" na estética que escolhemos.

## Por que é barato (fundação já existe)
- `cmdk` **já está instalado** (`package.json`).
- `src/components/ui/command.tsx` **já existe** (`CommandDialog`, `Command`, `CommandInput`, `CommandItem`, `CommandGroup`...).
- `/api/admin/clientes?search=` **já existe** e busca empresa por nome/CNPJ/email.
- O menu admin (`admin-nav.tsx`) já tem as 20 rotas com labels/ícones — fonte pronta para os atalhos de navegação.

## Arquitetura proposta
**Arquivos novos:**
- `src/components/admin/CommandPalette.tsx` (client component): monta o `CommandDialog`, escuta o atalho ⌘K/Ctrl+K (listener de teclado global), tem 2 grupos:
  - **"Ir para"** — lista as páginas da admin (reaproveita a mesma lista do `admin-nav`, extraída para um módulo compartilhado para não duplicar).
  - **"Empresas"** — campo de busca que, ao digitar (com debounce ~250ms), chama `/api/admin/clientes?search=` e lista resultados; Enter abre `/admin/clientes/[id]`.
- `src/app/admin/admin-nav-items.ts` (refactor leve): extrai a lista de rotas/labels/ícones do `admin-nav.tsx` para um módulo, consumido tanto pela sidebar quanto pela paleta (fonte única, sem duplicar).

**Arquivos modificados:**
- `src/app/admin/layout.tsx`: monta `<CommandPalette />` uma vez (fica disponível em todas as telas).
- `src/app/admin/admin-nav.tsx`: passa a importar a lista de `admin-nav-items.ts` (em vez de defini-la inline) — sem mudança visual.

**O que NÃO muda:** nenhuma lógica de negócio, nenhuma query existente, nenhum dado. É puramente uma camada de navegação/atalho por cima do que já existe. A busca de empresas usa a API que já existe.

## Escopo (o que entra e o que fica de fora)
**Entra (v1):**
- Atalho ⌘K/Ctrl+K + botão opcional na top bar ("Buscar… ⌘K").
- Navegação para as ~20 páginas da admin.
- Busca de empresas por nome/CNPJ → abre ficha.

**Fora (YAGNI — pode virar v2 se você quiser):**
- Buscar faturas/tickets/usuários (cada um precisaria de endpoint de busca; começamos só com empresas, que é o caso 90%).
- Ações ("criar empresa", "recalcular saúde") direto da paleta.

- **Esforço:** pequeno/médio (P/M) — ~1 sessão.
- **Risco:** baixo — tudo aditivo, fundação pronta, testável (componente isolado + a busca usa API existente).

## Validação
- Teste unitário do `CommandPalette` (abre no atalho, lista navegação, dispara busca) no padrão jsdom do projeto.
- Teste do módulo `admin-nav-items` (a sidebar continua renderando os mesmos itens — sem regressão).
- `tsc` + suite + build + smoke visual (abrir ⌘K, navegar, buscar uma empresa).

---

# Resumo para decisão

| Item | O que muda no sistema | Esforço | Risco | Recomendação |
|---|---|---|---|---|
| **2A — schema da cobrança** | Schema-fonte passa a refletir o banco de prod (5 colunas + SaasCounter + 2 migrations). Para o sangramento do drift. Sem mudança de comportamento/UI. | P | Baixo | **Fazer agora** |
| **2B — código da cobrança** | Traz a feature de cobrança inteira (56 arquivos) para a main; acaba os worktrees paralelos. Exige casar telas em conflito. | G | Médio | Depois, como projeto de consolidação dedicado |
| **3 — cmd+K** | Paleta de busca/navegação (⌘K) em toda a admin; navega páginas + acha empresas pelo teclado. Aditivo, fundação pronta. | P/M | Baixo | Fazer se quiser o toque "produto premium" |

**Caminho que sugiro:** aprovar **2A + 3** nesta leva (ambos baixo risco, alto valor/custo), e deixar **2B** para uma sessão dedicada de consolidação geral (cobrança + caixa + admin → main) quando você quiser encerrar a fragmentação de branches.
