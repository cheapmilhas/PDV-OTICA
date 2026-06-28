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
2. **Chips rápidos** (um clique, single-select): `Todas` · `Vence em 30 dias` · `Vencidas` · `1 a 2 anos` · `2+ anos`. Os dois últimos filtram por **idade da receita** (não validade), em faixas que **não se sobrepõem**.
3. **Filial** (dropdown; só aparece se a empresa tiver mais de uma filial).
4. **Período de emissão** (data de–até, recolhível).
5. **Status** (Aguardando grau / Completa) — mantém o existente.
6. **Toggle de visualização** `Lista` ⇄ `Por cliente` (default: Lista).

**Modo Lista:** comportamento atual — um card por receita, `issuedAt desc`.

**Modo Por cliente:** receitas agrupadas por `customerId`. Cabeçalho do grupo = nome do cliente (link p/ ficha) + nº de receitas + grau mais recente. Abaixo, as receitas do cliente em ordem **cronológica crescente** (`issuedAt asc`) para ler a evolução. O "grau mais recente" do cabeçalho = `values` da **última** receita após o sort crescente (a de `issuedAt` mais novo). Grupos ordenados pelo cliente cuja receita mais recente é a mais nova; empate de data desempata por nome do cliente (A→Z).

**Importante (page-scoped):** o nº de receitas e o "grau mais recente" do cabeçalho são calculados **apenas a partir da página carregada** (ver decisão de paginação abaixo). Se as receitas de um cliente cruzarem o limite de página, o cabeçalho pode subcontar. Mitigação: a UI orienta a **filtrar por cliente** (busca) antes de tratar a contagem como definitiva, e o cabeçalho não é apresentado como número oficial/auditável.

### Dados e backend

**Busca ampliada (`prescriptionService.list`):** trocar o filtro `customer.name contains` por um `OR` que casa `name` OU `cpf` OU `phone` (contains, `mode: insensitive`). **Os três ramos são sempre avaliados** — não há detecção do tipo de input (um termo numérico curto pode casar telefones; aceito como tradeoff, dado que o uso real é digitar nome ou CPF/telefone quase completos).

**Formato de CPF/telefone — a confirmar antes de codar:** não se sabe se `Customer.cpf`/`phone` são guardados com pontuação (`123.456.789-00`, `(62) 9...`) ou só dígitos. O implementador **verifica no banco primeiro**. A busca deve casar **independente de pontuação**: normaliza a entrada (tira não-dígitos) e compara contra os dados também normalizados. Se os dados no banco têm pontuação, comparar contra uma expressão que remove a pontuação (ex.: `regexp_replace`/`translate` em `$queryRaw`, ou normalização equivalente) — não confiar só em normalizar a entrada. A escolha exata (query raw vs. coluna normalizada) é decidida na Fase 1 após inspecionar o formato real.

**Filtros já suportados:** `branchId`, `validadeDe`, `validadeAte` — apenas expor na tela.

**Filtro novo (único de backend):** período/idade de **emissão** — params `emitidaDe` / `emitidaAte` aplicados a `Prescription.issuedAt`. Adicionados ao `prescriptionQuerySchema`, à rota e ao `service.list`.

**Autoridade única de "hoje":** todos os limites de data (chips e período) são calculados no front fixando o fuso **`America/Sao_Paulo`** (UTC−3), não o fuso do browser. Isso evita que perto da meia-noite uma receita "vire de dia" e mude de faixa. As datas resultantes são enviadas como ISO à API.

**Mapa chip → parâmetros** (single-select; selecionar um chip limpa os outros; o período de emissão manual também é zerado ao clicar num chip):

| Chip | Parâmetros setados | Semântica |
|------|--------------------|-----------|
| `Todas` | (limpa validadeDe/Ate, emitidaDe/Ate) | sem filtro de data |
| `Vence em 30 dias` | `validadeDe = hoje`, `validadeAte = hoje+30d` | expira nos próximos 30 dias |
| `Vencidas` | `validadeAte = hoje` | `expiresAt < hoje` |
| `1 a 2 anos` | `emitidaDe = hoje−2a`, `emitidaAte = hoje−1a` | emitida entre 1 e 2 anos atrás (faixa half-open: `hoje−2a ≤ issuedAt < hoje−1a`) |
| `2+ anos` | `emitidaAte = hoje−2a` | emitida há mais de 2 anos (`issuedAt < hoje−2a`) |

As faixas "1 a 2 anos" e "2+ anos" são **exclusivas** (não se sobrepõem). Intervalos meio-abertos em `issuedAt`.

**Agrupamento (modo Por cliente):** feito **no front**, juntando o payload por `customerId`. Sem endpoint novo nem lógica duplicada; o mesmo payload paginado serve aos dois modos. Os `values` (grau) já vêm no payload.

**Decisão consciente — paginação por cliente:** a paginação atual (50/página) pode cortar um cliente entre páginas. O agrupamento é confiável dentro da página carregada; como na prática filtra-se por cliente antes de olhar a evolução, isso raramente importa. **Não** paginar por cliente nesta fase (fora de escopo).

**Multi-tenant e permissões:** mantém `companyId` em todos os filtros Prisma e a permissão `prescriptions.view` que já protege a rota.

### Navegação e interações

- **Nome do cliente = link** para `/dashboard/clientes/[id]` em **nova aba** (`target="_blank"`), em ambos os modos e dentro do modal de detalhe.
- **Modo Lista:** clicar no nome → ficha; clicar em outra parte do card → detalhe. `stopPropagation` no link (mesmo padrão do botão "Digitar grau").
- **Modo Por cliente:** nome no cabeçalho do grupo → ficha; cada receita abaixo abre o detalhe.
- **Ações preservadas:** "Digitar grau" em `AGUARDANDO_GRAU` sem OS; receita com OS continua só-leitura.
- **Estados vazios:** mensagem clara ("Nenhuma receita para estes filtros") + botão "Limpar filtros", nos dois modos.
- **Estado de erro:** se o fetch falhar, mensagem de erro com botão "Tentar de novo" (não confundir com vazio).

## Faseamento

- **Fase 1 — Busca + filtros (backend + front).** Busca nome/CPF/telefone; expor filial e período de emissão; chips de validade. Entrega valor sozinha.
- **Fase 2 — Link do cliente.** Nome clicável → ficha (nova aba), na lista e no detalhe.
- **Fase 3 — Modo "Por cliente".** Toggle + agrupamento no front com evolução do grau cronológica.

Cada fase: TDD (RED→GREEN), `tsc` + build + review, deploy só com aprovação do dono.

## Testes

**Backend:**
- Busca casa nome, CPF e telefone (3 casos) **com e sem pontuação** na entrada e no dado armazenado.
- Filtro de período de emissão (`emitidaDe`/`emitidaAte`) aplica em `issuedAt`.
- Chips calculam as datas corretas e mutuamente exclusivas: vence 30d, vencidas, `1 a 2 anos` (faixa half-open), `2+ anos`.
- Não-regressão: filtros existentes (status, branchId, validade) seguem funcionando; `companyId` sempre presente.

**Cálculo de datas (front, fuso fixo):**
- Limites de "hoje" calculados em `America/Sao_Paulo` produzem o dia correto independentemente do fuso do browser (testar com clock simulado perto da meia-noite).

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
- Data de referência dos cálculos de validade/idade = "hoje" fixado em **`America/Sao_Paulo`** (decisão acima), calculado no front.
- Formato de armazenamento de `cpf`/`phone` **a confirmar no banco na Fase 1**; a busca deve ser robusta a pontuação dos dois lados (entrada e dado).
