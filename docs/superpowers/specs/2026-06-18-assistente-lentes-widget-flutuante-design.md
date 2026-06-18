# Assistente de Lentes — Widget Flutuante Global (bolinha) — Design

**Data:** 2026-06-18 · **Status:** aprovado na brainstorm (dono), aguardando review de spec + OK final.

## Problema

O Assistente de Lentes (motor óptico + IA de explicação) foi entregue como um **painel embutido na tela de Ordem de Serviço (OS)**. Mas a OS é criada **depois** da venda — então a ferramenta está no momento errado do fluxo. O dono quer um assistente **antes da venda**, disponível a qualquer momento, para o vendedor analisar o tipo de lente, índice de refração, espessura/peso, **e** cruzar com as tabelas de grade dos produtos (cadastradas na base de conhecimento) para ver **qual produto tem disponibilidade / cabe na dioptria**.

## Solução (resumo)

Transformar o assistente num **widget flutuante global** — uma "bolinha" fixa no canto de todas as telas do dashboard da ótica. Ao clicar, abre um **balão flutuante** (estilo chat) onde o vendedor:
1. Preenche a **receita** (OD/OE) + **medidas da armação**.
2. Vê o **resultado do motor** (índice, espessura em faixa, peso, alertas) — instantâneo, grátis, sem IA.
3. Clica **"Pedir sugestão da IA"** → a IA cruza o grau com a **base de conhecimento** (tabelas de grade) e diz quais produtos cobrem aquele grau.

O painel embutido na OS é **removido** (migra para a bolinha).

## Decisões do dono (fechadas na brainstorm)

1. **Função da IA:** analisar tipo de lente + índice de refração + (com a base de conhecimento alimentada) checar **disponibilidade na grade** de cada produto (se o grau cabe na dioptria que o produto cobre).
2. **Fonte da grade:** **texto na Base de Conhecimento** existente (o dono cola as tabelas de grade como texto; a IA interpreta em linguagem natural). NÃO campos estruturados no produto (fase futura, fora de escopo).
3. **Onde aparece:** bolinha flutuante em **todo o dashboard da ótica** (não preso a uma tela).
4. **Formato:** **balão flutuante acima da bolinha** (estilo chat Intercom/WhatsApp), não drawer lateral.
5. **Persistência:** mantém os dados **durante a sessão, mas limpa após 10 minutos** de inatividade.
6. **Motor vs IA:** o **motor** (índice/espessura/peso) aparece para **toda** ótica (grátis, sem IA). O botão **"Pedir sugestão da IA"** só funciona se a ótica tem IA ligada + crédito (degrada gracioso).
7. **Painel da OS:** **removido** das 2 telas de OS (migra para a bolinha).

## Arquitetura

### Componentes (novos)
- **`LensAdvisorFab`** — a bolinha. Botão circular fixo (`fixed bottom-4 right-4`, z-index alto mas abaixo de modais), ícone de óculos/lente (lucide `Glasses`), acento teal, `aria-label="Assistente de Lentes"`, foco visível, alvo ≥44px. Renderizado **uma vez** no layout do dashboard da ótica. Aparece para toda ótica (não no admin, não no login).
- **`LensAdvisorChat`** — o balão que abre ao clicar (card ~360-400px, altura limitada com scroll interno, abre acima da bolinha; desliza suave via transform/opacity, sem animar layout). Fecha no X, Esc, ou clique fora. `prefers-reduced-motion` respeitado.

### Reaproveitamento (já existe e funciona)
- **`analyzeLens`** (`src/lib/lens-optics.ts`) — motor determinístico puro.
- **`LensAdvisorPanel`** (`src/components/ordens-servico/lens-advisor-panel.tsx`) — sua lógica de inputs/motor/estados de IA será **extraída** para um núcleo reutilizável (hook ou componente compartilhado) e consumida pelo chat. NÃO reescrever do zero.
- **`POST /api/company/lens-advisor`** — rota do vendedor (auth + `requirePermission("company.settings")` + rate-limit + `assertAiAllowed` + `logAiUsage`). Reusada como está; só o **prompt** muda.
- **Base de conhecimento** (`buildKnowledgeContext`, tela "Base de Conhecimento" no super admin) — onde o dono cola as tabelas de grade. Já alimenta a IA.

### Modificações
- **`src/lib/ai/lens-advisor.ts`** — ajustar o `system`/`user` prompt: além de explicar a recomendação, instruir a IA a **cruzar o grau com as tabelas de grade fornecidas** e dizer **quais produtos cobrem o grau (cabem na dioptria) e quais não**. Regras mantidas: nunca contradiz o motor, nunca inventa número, **nunca inventa produto que não está nas tabelas**; se não houver tabela de grade no contexto, dizer que falta cadastrar. Anti-injeção (nonce) mantida.
- **Layout do dashboard da ótica** — montar `<LensAdvisorFab />` uma vez.
- **Telas de OS** (`ordens-servico/nova/page.tsx` e `[id]/editar/page.tsx`) — **remover** `<LensAdvisorPanel .../>`.

### Fluxo de dados
1. Vendedor abre a bolinha → digita receita + armação no balão.
2. Motor roda no browser conforme digita → índice/espessura/peso/alertas na hora (grátis).
3. Clica "Pedir sugestão da IA" → `fetch POST /api/company/lens-advisor` com `{ od, oe, frame }`.
4. A rota: motor (servidor) → `buildKnowledgeContext(companyId)` (tabelas de grade) → `explainLensRecommendation` (prompt novo, foco em grade) → `logAiUsage` → retorna texto + degrada gracioso.
5. O balão mostra o texto da IA **subordinado** (não parece cálculo; legenda "confira sempre os dados acima"). Spinner + skeleton durante o fetch (padrão do pacote OURO).

### Degradação graciosa (3 pontos, já implementados)
- IA off (`assertAiAllowed`) / sem chave / erro de API / sem crédito → o botão mostra nota discreta "IA indisponível"; **o motor sempre continua exibido**.

### Persistência (10 min)
- O estado da receita/armação vive no componente do widget durante a sessão (não recarrega a página). Um **timestamp da última edição**; ao abrir o balão, se passou > 10 min desde a última edição, **zera** os campos (e limpa a sugestão da IA). A sugestão da IA também limpa quando a receita muda (comportamento já existente do pacote OURO).

### Comportamento por flag
- **Bolinha + motor:** toda ótica (grátis, sem IA).
- **Botão "Pedir sugestão da IA":** só com `iaAvailable && iaEnabled` + crédito (a rota já valida; o widget reflete com a nota "indisponível").

## Componentes e responsabilidades (isolamento)

| Unidade | O que faz | Depende de |
|---|---|---|
| `LensAdvisorFab` | Renderiza a bolinha; controla aberto/fechado | nada (só estado local) |
| `LensAdvisorChat` | O balão: inputs de receita/armação + resultado do motor + botão IA + persistência 10min | núcleo de lente extraído + rota do vendedor |
| núcleo de lente (hook/componente extraído do painel atual) | Converte strings PT → `EyePower`/`FrameSize`, roda `analyzeLens`, gerencia estados de IA (loading/erro/texto), serializa o body | `analyzeLens`, a rota |
| `lens-advisor.ts` (prompt) | Explica o motor **+ cruza grade/disponibilidade** | base de conhecimento (contexto) |

## Testes
- Reusar: testes do motor (`analyzeLens`) e da rota do vendedor já existem.
- Novos: lógica de expiração de 10 min (função pura, testável); o gate "botão IA só com flag" (a rota já tem; o widget reflete); a degradação no widget. UI validada por tsc + build.

## Fora de escopo (YAGNI — confirmado pelo dono)
1. Campos estruturados de grade no produto (fica texto na base de conhecimento; estruturado é fase futura).
2. Chat conversacional de ida-e-volta com histórico (é "preenche receita → 1 sugestão", não múltiplas mensagens).
3. Puxar receita de uma OS/orçamento existente (vendedor digita no widget; atalho futuro).
4. Comparar preço/estoque real dos produtos (a IA fala de disponibilidade na grade/dioptria, não preço/estoque — depende de popular outras tabelas).

## Notas de implementação / deploy
- **Sem migração, sem env nova** — reusa toda a infra F1-F4.
- Trabalhar no worktree `.worktrees/integra-lentes` (branch `feat/integra-lentes`). Conferir drift antes de deploy.
- A IA já está ligada e funcionando em prod (chave válida + crédito, 2026-06-18). A base de conhecimento precisa ser alimentada pelo dono com as tabelas de grade para a parte de "disponibilidade" ter dados.
- Subagent-driven na implementação, parar antes do deploy (gate do dono).
