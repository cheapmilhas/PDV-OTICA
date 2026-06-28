# Livro de Receitas — Melhorias de Usabilidade (Consulta Clínica)

**Data:** 2026-06-27
**Status:** Design aprovado pelo dono (aguardando revisão da spec)
**Objetivo principal:** consulta clínica no balcão — encontrar rápido a receita certa de um cliente e visualizar a evolução do grau ao longo do tempo.

## Contexto

A tela `/dashboard/livro-receitas` hoje oferece:
- Busca **apenas por nome** do cliente.
- Filtro por **status** (Aguardando grau / Completa).
- Lista plana de receitas, ordenada por `issuedAt desc`.
- Card clicável → modal de detalhe (grau OD/OE, paciente, datas, origem).
- Receita com OS = só-leitura (edita na OS); `AGUARDANDO_GRAU` sem OS oferece "Digitar grau".

A API `GET /api/prescriptions` (via `prescriptionService.list`) **já aceita** `branchId`, `validadeDe` e `validadeAte`, mas a tela não os expõe. Modelo `Prescription` traz cliente, paciente/dependente, status, datas, origem (OS/Venda/Avulsa via `hasServiceOrder`), grau OD/OE (`values`), médico, filial. `Customer` tem `cpf` e `phone` (ambos `String?`).

## Decisões de produto (do brainstorming)

- **Uso principal:** consulta / histórico clínico (não marketing de recompra).
- **Como o atendente chega na receita:** misturado — às vezes pelo cliente (nome/CPF/telefone), às vezes navegando a lista.
- **Busca ampliada:** nome **+ CPF + telefone**.
- **Agrupar receitas por cliente** para ver evolução do grau cronológica.
- **Filtros novos:** idade/validade (atalhos), filial, período de emissão. (Origem foi descartada.)
- **Nome do cliente = link** para a ficha (`/dashboard/clientes/[id]`) em **nova aba**; resto do card abre o detalhe da receita.

## Abordagem escolhida

**Opção A — Modo dual "Lista" ⇄ "Por cliente".** Um toggle alterna entre a lista plana atual (navegar receitas recentes / gestão) e uma visão agrupada por cliente (foco clínico, evolução do grau). Filtros e busca valem nos dois modos. Honra os dois comportamentos misturados sem sacrificar nenhum, reaproveitando o payload existente.

Alternativas descartadas:
- **B (sempre agrupado):** pior para ver receitas recentes da loja.
- **C (evolução só no detalhe):** não entrega o agrupamento na lista, que o dono pediu explicitamente.

## Design

### Layout da tela

De cima para baixo:
1. **Busca única** que casa nome, CPF ou telefone do cliente.
2. **Chips de validade** (um clique): `Todas` · `Vence em 30 dias` · `Vencidas` · `+1 ano` · `+2 anos`.
3. **Filial** (dropdown; só aparece se a empresa tiver mais de uma filial).
4. **Período de emissão** (data de–até, recolhível).
5. **Status** (Aguardando grau / Completa) — mantém o existente.
6. **Toggle de visualização** `Lista` ⇄ `Por cliente` (default: Lista).

**Modo Lista:** comportamento atual — um card por receita, `issuedAt desc`.

**Modo Por cliente:** receitas agrupadas por `customerId`. Cabeçalho do grupo = nome do cliente (link p/ ficha) + nº de receitas + grau mais recente. Abaixo, as receitas do cliente em ordem **cronológica crescente** (`issuedAt asc`) para ler a evolução. Grupos ordenados pelo cliente cuja receita mais recente é a mais nova.

### Dados e backend

**Busca ampliada (`prescriptionService.list`):** trocar o filtro `customer.name contains` por um `OR` que casa `name` OU `cpf` OU `phone` (contains, `mode: insensitive`). A entrada é normalizada no front (remove pontuação de CPF/telefone) antes de enviar, para casar com o armazenado. Mudança isolada no service.

**Filtros já suportados:** `branchId`, `validadeDe`, `validadeAte` — apenas expor na tela. Os chips de validade calculam datas no front:
- *Vence em 30 dias* → `validadeDe = hoje`, `validadeAte = hoje+30`.
- *Vencidas* → `validadeAte = hoje` (expiresAt < hoje).
- *+1 ano / +2 anos* → filtro por **idade da receita** (`issuedAt < hoje−1ano / −2anos`). Requer novos params `emitidaAte` (ver abaixo).

**Filtro novo (único de backend):** período/idade de **emissão** — params `emitidaDe` / `emitidaAte` aplicados a `Prescription.issuedAt`. Adicionados ao `prescriptionQuerySchema`, à rota e ao `service.list`. Os chips "+1 ano"/"+2 anos" reutilizam `emitidaAte`.

**Agrupamento (modo Por cliente):** feito **no front**, juntando o payload por `customerId`. Sem endpoint novo nem lógica duplicada; o mesmo payload paginado serve aos dois modos. Os `values` (grau) já vêm no payload.

**Decisão consciente — paginação por cliente:** a paginação atual (50/página) pode cortar um cliente entre páginas. O agrupamento é confiável dentro da página carregada; como na prática filtra-se por cliente antes de olhar a evolução, isso raramente importa. **Não** paginar por cliente nesta fase (fora de escopo).

**Multi-tenant e permissões:** mantém `companyId` em todos os filtros Prisma e a permissão `prescriptions.view` que já protege a rota.

### Navegação e interações

- **Nome do cliente = link** para `/dashboard/clientes/[id]` em **nova aba** (`target="_blank"`), em ambos os modos e dentro do modal de detalhe.
- **Modo Lista:** clicar no nome → ficha; clicar em outra parte do card → detalhe. `stopPropagation` no link (mesmo padrão do botão "Digitar grau").
- **Modo Por cliente:** nome no cabeçalho do grupo → ficha; cada receita abaixo abre o detalhe.
- **Ações preservadas:** "Digitar grau" em `AGUARDANDO_GRAU` sem OS; receita com OS continua só-leitura.
- **Estados vazios:** mensagem clara ("Nenhuma receita para estes filtros") + botão "Limpar filtros", nos dois modos.

## Faseamento

- **Fase 1 — Busca + filtros (backend + front).** Busca nome/CPF/telefone; expor filial e período de emissão; chips de validade. Entrega valor sozinha.
- **Fase 2 — Link do cliente.** Nome clicável → ficha (nova aba), na lista e no detalhe.
- **Fase 3 — Modo "Por cliente".** Toggle + agrupamento no front com evolução do grau cronológica.

Cada fase: TDD (RED→GREEN), `tsc` + build + review, deploy só com aprovação do dono.

## Testes

**Backend:**
- Busca casa nome, CPF e telefone (3 casos) + normalização de pontuação.
- Filtro de período de emissão (`emitidaDe`/`emitidaAte`) aplica em `issuedAt`.
- Chips de validade calculam as datas corretas (vence 30d, vencidas, +1a, +2a).
- Não-regressão: filtros existentes (status, branchId, validade) seguem funcionando; `companyId` sempre presente.

**Front (RTL):**
- Toggle alterna Lista ⇄ Por cliente.
- Agrupamento junta receitas do mesmo cliente em ordem cronológica crescente.
- Nome dispara navegação sem abrir o detalhe (stopPropagation).
- Estado vazio + "Limpar filtros".

## Fora de escopo (YAGNI)

- Paginação por cliente (decisão acima).
- Exportar/imprimir o Livro; gráfico de evolução do grau; lembrete automático de recompra.
- Filtro por origem (OS/Venda/Avulsa) — descartado pelo dono.

## Premissas

- `Customer.cpf` e `Customer.phone` existem (`String?`). **Confirmado no schema.** Se algum estiver ausente em runtime, a busca usa só os campos presentes (o `OR` ignora ramos vazios).
- Data de referência dos cálculos de validade/idade = "hoje" no fuso do servidor.
