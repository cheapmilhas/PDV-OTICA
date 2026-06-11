# Cadastro de cliente sem LGPD + ficha completa + cashback no PDV

**Data:** 2026-06-11
**Branch sugerida:** `fix/cadastro-cliente-lgpd-ficha`
**Status:** Design aprovado pelo dono (aguardando review da spec)

## Problema

Três ajustes pedidos pelo dono, todos centrados no cadastro/visualização de cliente:

1. O modal de **cadastro rápido de cliente** (acessível pelo PDV via "F3 Cliente") tem um bloco "CONSENTIMENTO LGPD" com 3 checkboxes, sendo 2 obrigatórios que **bloqueiam o salvamento**. Isso atrapalha o cadastro no balcão e não é desejado. Deve sair. No lugar, o cadastro deve oferecer **campos opcionais** (email, endereço completo, nascimento, gênero) para quem quiser preencher — sem obrigar.

2. A **tela de detalhes do cliente** (`/dashboard/clientes/[id]`, aba "Dados" → "Informações do Cliente") só exibe Nome, Tipo, CPF/CNPJ, Email, Telefone e um endereço resumido. Vários campos que já existem no banco (nascimento, gênero, telefone 2, como nos conheceu, número/bairro/complemento do endereço, observações) não aparecem. Devem ser exibidos.

3. O **card do cliente selecionado no PDV** mostra só nome + telefone. O dono quer ver também o **cashback disponível**, sem quebrar a organização enxuta atual.

## Premissa central: nenhuma migration necessária

O modelo `Customer` (`prisma/schema.prisma` ~linhas 390-457) **já possui todos os campos**: `birthDate`, `gender`, `phone2`, `referralSource`, `address`, `number`, `complement`, `neighborhood`, `city`, `state`, `zipCode`, `notes`. A tela de edição completa (`clientes/[id]/editar/page.tsx`) já usa todos eles. A `createCustomerSchema` (`src/lib/validations/customer.schema.ts`) já valida todos como opcionais, e `sanitizeCustomerDTO` converte strings vazias em `undefined`. Portanto **as APIs não mudam** — o trabalho é majoritariamente UI + remoção de uma trava.

## Decisões do dono

- **LGPD:** remover totalmente os 3 checkboxes e a trava de consentimento do modal de cadastro rápido.
- **Campos extras no cadastro rápido:** endereço completo (CEP, rua, nº, bairro, cidade, UF), data de nascimento, gênero.
- **Layout do modal:** manter enxuto — nome/telefone/cpf/email à vista; campos extras numa seção recolhível "Adicionar mais informações" (fechada por padrão).
- **Card do PDV:** nome + telefone + cashback disponível (sem quebrar layout).

---

## Parte 1 — Cadastro rápido sem LGPD + campos opcionais

**Arquivo:** `src/components/pdv/modal-novo-cliente.tsx`

### Remover
- O bloco `<LgpdConsentCheckbox value={consent} onChange={setConsent} required />` (linha ~177).
- O hook `const [consent, setConsent] = useConsentState();` (linha ~26).
- A trava `if (!consent.personalData) { toast.error(...); return; }` (linhas ~31-34).
- O envio de `consent` no `customerData` (linha ~43) e o reset `setConsent(...)` (linha ~78).
- O import de `LgpdConsentCheckbox`/`useConsentState` (linha ~10).

### Deletar o componente
- `src/components/clientes/lgpd-consent-checkbox.tsx` — confirmado por `grep` que é usado **somente** neste modal. Sem outros consumidores, o arquivo é removido para não deixar código morto.

### Adicionar
Seção recolhível **"Adicionar mais informações"** abaixo do email, fechada por padrão (estado `mostrarMais`, default `false`), expandida por um botão/toggle. Conteúdo quando expandida:

- **Data de nascimento** (`birthDate`, `<input type="date">`) + **Gênero** (`gender`, select com M/F/Outro) — em grid 2 colunas.
- **Endereço:** CEP (`zipCode`), Endereço (`address`), Número (`number`), Bairro (`neighborhood`), Cidade (`city`), UF (`state`).

O `formData` do componente ganha esses campos (string vazia default). Todos opcionais.

A dica "Cadastre apenas os dados essenciais. Você pode completar o cadastro depois." permanece.

### Envio
O `customerData` passa a incluir os campos novos **apenas quando preenchidos** (mesmo padrão atual de `if (formData.email)`), OU envia tudo e deixa `sanitizeCustomerDTO` limpar — a abordagem escolhida é seguir o padrão atual de só anexar quando não-vazio, mantendo o payload limpo. `birthDate` enviado como string ISO (o backend já aceita — a tela de edição faz igual). **A API `POST /api/customers` não muda.**

### Teste
- Unit: `createCustomerSchema.parse({ name, phone })` (sem `consent`) passa.
- Unit: `createCustomerSchema.parse({ name, phone, birthDate, gender, address, number, neighborhood, city, state, zipCode })` passa.
- Unit: `sanitizeCustomerDTO` transforma campos vazios em `undefined`.

---

## Parte 2 — Ficha completa na tela de detalhes

**Arquivo:** `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx` (bloco "Informações do Cliente", ~linhas 838-918)

Mantém a estrutura existente: `grid gap-4 md:grid-cols-2`, cada campo um `<div>` com `<p className="text-sm text-muted-foreground">Label</p>` + `<p className="font-medium">valor</p>`. Cada novo campo é **condicional** (`{customer.campo && (...)}`) → não cria célula vazia.

### Campos a acrescentar no grid
- **Data de nascimento** (`birthDate`) — formatada `dd/mm/aaaa`.
- **Gênero** (`gender`) — valores no banco são `"M" | "F" | "Outro"` (exibir legível).
- **Telefone 2** (`phone2`) — com ícone `Phone`.
- **Como nos conheceu** (`referralSource`) — string livre.
- **Cliente desde** (`createdAt`) — formatado `dd/mm/aaaa`.

### Bug latente a corrigir junto (achado na review da spec)
A interface TS local `Customer` (página ~linhas 65-78) declara `type: "INDIVIDUAL" | "BUSINESS"`, mas `customerService.getById` retorna o objeto Prisma cru, cujo campo é **`personType: "PF" | "PJ"`** — não existe `type` no payload e não há camada de mapeamento. Resultado: a linha ~856 `customer.type === "INDIVIDUAL"` é **sempre falsa** → todo cliente é exibido como "Pessoa Jurídica" (bug pré-existente). Como estamos editando exatamente esse bloco, corrigir: trocar a interface e a checagem para `personType === "PF"`. Adicionar os campos novos à interface usando os **nomes exatos do Prisma** (não copiar o padrão errado de `type`).

### Bloco de endereço (já existe, ~linhas 895-915)
Enriquecer a montagem da linha de endereço para incluir `number`, `neighborhood` e `complement`, que já estão no banco mas são ignorados pela string atual. Exemplo de ordem: `{address}, {number} {complement}` / `{neighborhood} - {city} - {state} - CEP: {zipCode}`. Manter tudo condicional.

### Observações
Se `customer.notes` existir, exibir um bloco separado (`<Separator />` + título "Observações" + texto) abaixo do endereço.

### Verificação técnica obrigatória na implementação
Confirmar que:
1. `GET /api/customers/[id]` (via `customerService.getById`) retorna esses campos (confirmado na review: retorna o objeto Prisma completo cru).
2. A **interface TypeScript local** `Customer` na página inclui os novos campos com os nomes exatos do Prisma — se não, adicioná-los. Sem isso, `customer.birthDate` etc. dão erro de tipo. Resolver primeiro; corrigir junto o `type`→`personType` (ver acima). `tsc` valida.

### Teste
- `tsc` limpo (pega campos faltando na interface).
- Smoke: abrir ficha de um cliente com endereço/nascimento preenchidos e confirmar exibição; abrir ficha de cliente "magro" (só nome+telefone) e confirmar que nada quebra nem aparece célula vazia.

---

## Parte 3 — Cashback no card do PDV

**Arquivo:** `src/app/(dashboard)/dashboard/pdv/page.tsx` — card do cliente selecionado (~linhas 1159-1175).

### Endpoint reutilizado
`GET /api/cashback/balance/[customerId]` (já existe, `src/app/api/cashback/balance/[customerId]/route.ts`). Lookup indexado por `customerId_branchId`, instantâneo. Resposta:
```
{ success: true, data: { balance, totalEarned, totalUsed, totalExpired } }
```
Retorna `403` quando o plano não inclui cashback.

### Implementação — fetch num único ponto (`useEffect`)
**Importante (achado na review):** o cliente selecionado é setado em **vários lugares**, não só no clique da busca: clique no resultado da busca (~linha 1201), callback `onClienteCriado` do modal de cadastro (~linha 905), e pré-preenchimento vindo de orçamento/OS (~linhas 232 e 279). Patchar só o clique da busca deixaria o cashback sem aparecer nos outros fluxos.

Solução robusta de ponto único:
- Estado novo no PDV: `cashbackSelecionado: number | null` (default `null`).
- Um `useEffect` keyed em `clienteSelecionado?.id`:
  - se não há cliente → `setCashbackSelecionado(null)` e retorna.
  - senão → `fetch(\`/api/cashback/balance/${clienteSelecionado.id}\`)`:
    - `403` → `setCashbackSelecionado(null)` (plano sem cashback, não exibe nada).
    - sucesso → `setCashbackSelecionado(Number(data.data.balance) || 0)`.
    - erro de rede → `null` (silencioso, não atrapalha a venda).
  - usar guarda de cancelamento (flag `ativo`/`AbortController`) para evitar race ao trocar de cliente rápido.
- Isso cobre automaticamente todos os pontos de seleção, inclusive remover/F8 (que zeram `clienteSelecionado`).
- No card, **abaixo do telefone**: exibir `Cashback: {formatCurrency(saldo)}` **somente quando `cashbackSelecionado != null && cashbackSelecionado > 0`**. Texto pequeno (`text-xs`), ícone discreto. Saldo 0 ou plano sem cashback → linha não aparece (card idêntico ao atual).

Não toca a busca de clientes `/api/customers?search=` → sem N+1. Não altera layout quando não há cashback.

### Teste
- `tsc` + build.
- Smoke: selecionar cliente com cashback → linha aparece; cliente sem cashback → não aparece; remover cliente → linha some.

---

## Resumo de arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/components/pdv/modal-novo-cliente.tsx` | Remove LGPD; adiciona seção recolhível com endereço/nascimento/gênero |
| `src/components/clientes/lgpd-consent-checkbox.tsx` | **Deletado** (sem outros consumidores) |
| `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx` | Exibe nascimento, gênero, tel 2, referral, criado em, endereço completo, notes; ajusta interface TS local; corrige bug `type`→`personType` (Pessoa Física/Jurídica) |
| `src/app/(dashboard)/dashboard/pdv/page.tsx` | Busca + exibe cashback no card do cliente selecionado |
| `src/lib/validations/__tests__/customer.schema.test.ts` (ou equivalente) | Testes de cadastro sem consent + campos novos |

**Sem migration. Sem mudança de API.** Risco baixo: UI + remoção de trava + reuso de endpoint existente.

## Riscos e mitigações

1. **Interface TS local desatualizada na detail page** → resolver primeiro, `tsc` valida.
2. **`birthDate` formato de envio** → seguir exatamente o que a tela de edição já faz (string do `<input type=date>`); o backend já aceita.
3. **Deletar `lgpd-consent-checkbox.tsx`** → grep confirmou consumidor único; se na implementação surgir outro uso, manter o arquivo e apenas parar de usá-lo no modal.
4. **Card do PDV com cashback** → exibição estritamente condicional a `> 0`; falha de fetch é silenciosa e não bloqueia venda.
