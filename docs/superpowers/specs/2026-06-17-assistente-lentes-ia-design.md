# Assistente de Lentes IA + Governança no Super Admin — Design

> Spec de brainstorming. Status: **aprovada pelo dono em 2026-06-17**, pendente revisão de spec + transição para plano de implementação.
> Projeto: Vis (PDV/gestão para óticas), Next.js App Router + Prisma + Postgres (Neon), deploy Vercel.

## Resumo

Conjunto de capacidades de IA voltadas à venda de lentes, **embutidas no fluxo de Ordem de Serviço (OS)** — não um chat separado — e governadas centralmente pelo super admin. A IA ataca duas dores que o dono de ótica paga para resolver — **não errar** (retrabalho) e **vender melhor** (ticket) — e **nunca assume o papel de prescrever**.

Reusa integralmente a infraestrutura de IA já em produção (Blocos C1/C2/C3/D): medição de custo, cota por ótica, margem, chave cifrada, flags liga/desliga, painéis de consumo. O trabalho novo é: (1) **motor óptico determinístico**, (2) **base de conhecimento** gerenciável pelo super admin, (3) **playground de testes**, (4) **camada de IA** que traduz o motor em linguagem de venda, e (5) integração do **OCR de receita existente** ao fluxo.

## Contexto e origem

Brainstorming 2026-06-17. O dono pediu uma IA que "estuda dioptria, grau, espessura, peso, tamanho da armação, tipo de lente e ajuda o vendedor na tomada de decisão", com governança no super admin (ensinar a IA com documentos, testar, ligar/desligar global ou por cliente, ver custo de tokens) e seleção de modelo.

Duas análises críticas adversariais (arquiteto + consultor de produto de óticas) foram executadas **antes** de fechar o design e mudaram a proposta original:

- O "chat consultor que recomenda índice" resolve dor fraca (recomendação de índice é quase uma tabela fixa que o lab já fornece) e cria fricção (digitação dupla no balcão). **Reposicionado** para "Assistente de Lentes" embutido na OS, focado em sanity-check + comparativo + foto-da-receita.
- "RAG com pgvector" é over-engineering prematuro (Neon sem pgvector; base começa vazia). **Substituído** por contexto-no-prompt com `cache_control` do Claude + texto no Postgres.
- "Motor óptico = fonte de verdade dos números" é perigoso (espessura real depende de dados que o sistema não tem). **Corrigido** para faixas + disclaimer + falha fechada.

## Realidade dos dados em produção (verificado 2026-06-16/17)

- `Lab`: 4 cadastrados.
- `LabPriceRange` (lentes do lab com faixa de grau `sphMin/sphMax`, `cylMin/cylMax`, `labPrice`, `arPrice`, etc.): **0 linhas** — tabela existe e é ideal para o comparativo, mas está vazia.
- `Prescription`: **0** — fluxo de receita estruturada não usado hoje.
- `ServiceOrder`: 40.
- `Product`: 877 (armações + lentes juntos; sem campo de índice de refração estruturado).
- OCR de receita já existe (`/api/ocr/prescription`) com componente na tela de OS (`prescription-image-upload.tsx`), extrai esf/cil/eixo/dnp/altura/add/prisma/base. **Bug latente:** usa `new Anthropic()` (ignora a chave cifrada do super admin e não é medido).

**Implicação:** a feature **não pode depender de catálogo de lentes no início** (está vazio). O motor óptico determinístico funciona sem nenhum dado da ótica; o comparativo com preço da loja fica para fase posterior (quando `LabPriceRange` for populado).

## Princípios (regras, não enfeite — vindos da crítica)

1. **A IA nunca é fonte de número de produção.** Espessura/peso saem como **faixa + disclaimer fixo não-removível** ("Estimativa para orientação de venda. A espessura/peso final dependem do laboratório, material e montagem."). A receita é do médico; a indicação técnica é do óptico; a IA transcreve e confere, **não prescreve**.
2. **Determinístico no caminho crítico, IA por cima.** O que dá para calcular/validar por regra roda sem IA e funciona com a IA desligada. A IA agrega explicação e leitura de receita; **nunca contradiz o motor**.
3. **Zero digitação dupla.** Gancho de adoção = foto da receita → preenche a OS (evolui o OCR + componente existentes). A IA entra onde o vendedor já está.
4. **Custo sob controle.** Modelo configurável por feature (default Haiku no caminho do vendedor), `cache_control` do Claude na base de conhecimento, rate-limit por usuário, tudo medido pela infra C1/C2/C3 com `feature` própria.
5. **Governança central.** Super admin ensina (base de conhecimento global + por ótica, texto no Postgres), testa (playground isolado), liga/desliga (reusa flags + ação em massa), vê custo. Admin cliente: liga/desliga + vê consumo (R$ com margem embutida, sem custo real nem %).

## As 3 capacidades da IA (ordem de valor)

| # | Capacidade | Dor que resolve | Risco |
|---|---|---|---|
| 1 | Foto da receita → preenche OS (evolui OCR existente) | digitação dupla / erro de transcrição | baixo |
| 2 | Sanity-check do grau (alerta inconsistências antes do lab) | retrabalho caro | baixo |
| 3 | Recomendação/comparativo de lente (faixa de índice + preço da loja quando houver catálogo) | ticket / upsell | médio (depende de catálogo) |

## Arquitetura

```
VENDEDOR (tela de OS)                 SUPER ADMIN (/admin/configuracoes/ia, com sub-abas)
   │                                     ├─ Base de Conhecimento (sobe docs: global / por ótica)
   │ grau + armação (ou foto da receita) ├─ Playground (testa motor + IA, isolado)
   ▼                                     ├─ Liga/desliga (por ótica + ação "todos")  ← reusa flags
┌──────────────────────────────┐        ├─ Seletor de modelo por feature  ← lensAdvisorModel
│ Assistente de Lentes          │        └─ Consumo de tokens R$  ← reusa C2/C3
│  1. motor óptico (fórmula, faixas+disclaimer, falha fechada) — SEM IA
│  2. base de conhecimento (contexto-no-prompt + cache) — global + da ótica
│  3. Claude traduz em linguagem de venda (getAnthropicKey, rate-limit, anti-injeção)
│  4. assertAiAllowed (antes) + logAiUsage(feature:"lens_advisor") (depois)
│  IA OFF/sem chave → mostra SÓ o motor determinístico (degradação graciosa)
└──────────────────────────────┘
```

### Camada 1 — Motor óptico determinístico (`src/lib/lens-optics.ts`)

Função pura, sem IA, sem custo de token, testável. Funciona com IA desligada.

**Entrada:** esf/cil/eixo/add (OD + OE) — **obrigatório**; tamanho da armação (largura da lente, ponte, maior diâmetro efetivo) — **opcional**.

**Origem do tamanho da armação (resolve C1 da revisão):** a **faixa de índice e o sanity-check dependem apenas do grau** — funcionam sem a armação. **Espessura/peso só são calculados quando a medida da armação for informada** (campo manual opcional na tela de OS; pode pré-preencher do produto-armação selecionado se ele tiver medidas, mas hoje `Product` não tem — então é entrada manual opcional). Sem a medida, o motor degrada para "só faixa de índice + alertas" (coerente com a filosofia de falha-fechada: não inventa espessura sem dado).

**Saída:**
- **Faixa de índice recomendada** (a tabela do lab virada regra explícita em constante configurável): `|grau| até ~2 → 1.50/1.56 · ~2-4 → 1.56/1.61 · ~4-6 → 1.61/1.67 · >6 → 1.67/1.74`.
- **Espessura de borda como FAIXA + disclaimer** (nunca número exato): ex. "estimativa 4–6 mm; confirme com o laboratório". Internamente usa fórmula de sagitta como ordem de grandeza; a saída é faixa.
- **Peso relativo qualitativo:** "mais leve / médio / mais pesado".
- **Alertas / sanity-check:** cilíndrico alto com eixo suspeito; adição sem indicação de perto/multifocal; grau fora da faixa do produto (quando houver catálogo); assimetria grande OD≠OE; grau alto + armação grande → priorize alto índice.

**Dupla checagem determinística (3 camadas — explicitamente SEM usar a IA para validar o cálculo):**
1. **Testes de referência** (a checagem mais forte): tabela de casos óptica validada (grau+armação → faixa esperada), incluindo extremos; testes de propriedade ("índice nunca diminui quando grau aumenta", "espessura nunca negativa", "faixa min ≤ max"). Calibração ancorada via planilha que o dono valida no playground antes de ativar.
2. **Guarda-corpos em runtime:** valida entrada (faixas plausíveis: esf −30..+30, cil −10..0, eixo 0..180) e saída (descarta absurdos). **Falha fechada:** entrada atípica ou saída duvidosa → não exibe número, mostra "valor atípico, confirme a receita/laboratório". Prefere não responder a responder errado.
3. **Disclaimer + decisão humana:** o número é sempre faixa + disclaimer; a decisão é do óptico.

### Camada 2 — Base de conhecimento (contexto curado, NÃO pgvector)

Documentos que o super admin sobe, divididos em **global** (todas as óticas) e **por ótica** (companyId). Na resposta, a IA recebe os trechos relevantes (global + da ótica logada) como contexto, em blocos `system` com `cache_control: {type: "ephemeral"}` do Anthropic (≈90% de desconto no input cacheado; a tabela de pricing e o código de medição já leem `cache_read_input_tokens`).

- **Fase inicial: texto/markdown** (colado ou `.txt`) guardado como texto no Postgres — sem infra nova. PDF/planilha com extração (Vercel Blob + parser) fica para fase posterior.
- **Teto de contexto explícito** por requisição (default conservador, ex: ~20–30k tokens de corpus global + da ótica somados; ajustável). Acima disso, só então introduzir retrieval (tsvector → depois pgvector). Gatilho de migração documentado; pgvector é fase futura hipotética, não Fase 1/2.
- **Custo (resolve I2/I3 da revisão):** o controle de custo real vem de **Haiku como default + teto de contexto + rate-limit por usuário**. O `cache_control` ephemeral (TTL ~5 min) **ajuda em rajadas** (várias consultas seguidas), mas o vendedor consulta de forma esparsa, então **não conte com o cache como economia garantida**. Validar TTL/preço exatos via skill `claude-api` na fase de planejamento. Ao selecionar Sonnet/Opus com corpus grande, alertar o super admin do impacto de custo.
- **`tokensEstimate` do documento (resolve I5):** estimado no upload (token counting da API Anthropic, ou heurística declarada ~chars/4 como fallback). Se a soma dos docs ativos (global + ótica) exceder o teto de contexto, **alertar o super admin e não ativar docs além do teto** (não trunca silenciosamente).
- **Isolamento de tenancy:** a função que monta o contexto **no fluxo do vendedor** recebe `companyId` **obrigatório e tipado** (falha fechada se ausente). Teste unitário explícito: "corpus da ótica A nunca aparece no prompt da ótica B". Cada chunk marca origem (global vs ótica X) para auditoria e citação. Corpus por-ótica restrito a material de produto/preço/política — **sem PII de pacientes**.
- **Exceção do playground (resolve I4):** o super admin **é autorizado a inspecionar qualquer corpus** no playground (escolhe a ótica-alvo num dropdown). O isolamento "A não vê B" vale para o **fluxo do vendedor**, não para o super admin testando — sem contradição.
- **Visibilidade (resolve C2):** a base de conhecimento é **exclusivamente leitura+escrita do super admin**. O admin cliente **não vê o conteúdo nem a existência** dos documentos (nem os globais nem os da própria ótica) — conteúdo por-ótica pode ter preço de custo/política comercial sensível.

### Camada 3 — Orquestrador (`src/services/lens-advisor.service.ts`)

Fluxo de uma consulta:
1. Roda o motor óptico (determinístico) → faixas + sanity-check.
2. Busca a base de conhecimento (global + da ótica) com `cache_control`.
3. Chama Claude (modelo = `lensAdvisorModel`, via `getAnthropicKey()` — **não** `new Anthropic()`), passando o resultado do motor como dado + a base de conhecimento. A IA traduz em linguagem de venda; nunca contradiz o motor.
4. `assertAiAllowed(companyId)` antes (flags/cota) + `logAiUsage({feature:"lens_advisor", ...})` depois + **rate-limit por usuário** (como o OCR).
5. **Defesa anti-injeção:** nonce markers (copiado de `src/lib/ai/lead-qualifier.ts`).
6. **Degradação graciosa (resolve M5):** IA OFF, sem chave, **OU qualquer falha da chamada Claude (timeout / erro / rate-limit do provedor)** → retorna só o motor determinístico. Nunca some, nunca dá erro, **nunca bloqueia a OS**.
7. **Modelo no caminho do vendedor:** Haiku por padrão (rápido/barato); Sonnet/Opus opção via seletor. Considerar streaming se latência incomodar (ou manter Haiku).
8. **Rate-limit (resolve M2):** herda exatamente o mecanismo do OCR (`/api/ocr/prescription`, `src/lib/rate-limit.ts`) — por usuário. Confirmar na implementação que o mecanismo é **durável** (não memória de processo, que não persiste entre invocações serverless da Vercel); se o do OCR for em memória, migrar para durável (Postgres/Upstash) ao integrar.

### Gancho de adoção — foto da receita → preenche OS

- Evolui o OCR existente (`/api/ocr/prescription` + `prescription-image-upload.tsx`).
- **Corrige o bug latente:** migrar de `new Anthropic()` para `getAnthropicKey()` + `logAiUsage(feature:"ocr_prescription")` + modelo configurável. Traz o OCR para a governança (liga/desliga, custo, modelo, rotação de chave).
- Resultado: vendedor fotografa a receita → campos da OS preenchidos → motor óptico roda em cima → sanity-check + sugestão aparecem. Zero digitação dupla.

### Onde aparece para o vendedor

Painel "Assistente de Lentes" embutido na **tela de OS** (não chat separado). Ao preencher/importar o grau, aparece o resultado do motor + (se IA ligada) a recomendação/argumento.

## Governança no Super Admin

`/admin/configuracoes/ia` ganha sub-abas (a tela de config de IA existente vira guarda-chuva).

### A) Aba "Base de Conhecimento" (ensinar a IA) — novo
Lista de documentos (título, escopo Global/ótica, tokens estimados, data, ativo). Adicionar = título + escopo + conteúdo (texto/markdown). Origem marcada para auditoria.

### B) Aba "Playground / Testar" — novo
Conversar com a IA e validar o motor antes de liberar. Escolhe a ótica-alvo num dropdown (ou "só global"). **Isolado de produção (resolve I1):** não passa por `assertAiAllowed`; grava uso com `companyId = null` (ver Modelo de dados) + `feature:"lens_advisor_playground"` → nunca toca cota/custo de cliente real nem polui os painéis das óticas (que filtram por companyId preenchido). Mostra resposta + tokens/custo do teste. É também onde o dono valida a planilha de calibração do motor e ativa a feature quando confiante.

**Faseamento do playground (resolve M3):** na Fase 2 (antes de existir `lens-advisor.service`), o playground testa **só o motor + a montagem de contexto** (sem chamada Claude). A parte "conversar com a IA" entra junto da Fase 3.

### C) Liga/Desliga — reuso + adição
Reusa `iaAvailable` + `iaEnabled`. **Adição:** botão "ligar/desligar para TODOS os clientes" (ação em massa), além do controle individual por ótica. A feature respeita as flags (IA OFF → lado determinístico ainda funciona).

### D) Seletor de modelo por feature — novo
`AiGlobalConfig.lensAdvisorModel` (allowlist Haiku/Sonnet/Opus já existente). Cada feature de IA tem seu modelo (lead qualification, lens advisor, OCR), afinando custo×qualidade por uso.

### E) Consumo de tokens — reuso (C2/C3, já deployado)
Super admin: custo real R$ + margem + lucro por ótica, com a linha `lens_advisor` aparecendo automaticamente. Admin cliente: tokens + R$ que paga (margem embutida), sem custo real nem %.

## Modelo de dados (tudo aditivo)

### `LensKnowledgeDoc` (novo)
```
id               String   @id @default(cuid())
companyId        String?  // null = GLOBAL; preenchido = só daquela ótica
title            String
content          String   @db.Text   // texto/markdown
tokensEstimate   Int      @default(0)
active           Boolean  @default(true)
createdByAdminId String?              // auditoria
createdAt        DateTime @default(now())
updatedAt        DateTime @updatedAt
@@index([companyId, active])
```

### `AiGlobalConfig` — campo novo (aditivo)
```
lensAdvisorModel String @default("claude-haiku-4-5")
```
> Validar o ID exato contra o que `ai-pricing`/`qualifierModel` já mapeiam (resolve M1) — usar a mesma allowlist/constante, nunca uma string nova não-mapeada (senão o uso não é medido).

### `AiTokenUsage` — tornar `companyId` opcional (aditivo, resolve I1)
Hoje `companyId` é NOT NULL com FK. Mudança aditiva: **`companyId` passa a ser opcional** (`String?`, FK opcional). Uso do **playground grava `companyId = null` + `feature:"lens_advisor_playground"`** — sem empresa-fantasma, sem tocar cota/cobrança/métricas/crons (que iteram `Company`). Os painéis C2/C3 já filtram por companyId preenchido por ótica, então linhas com `companyId = null` **não aparecem** em nenhum painel de cliente nem no agregado por ótica. Migração aditiva (afrouxar NOT NULL é seguro; nenhuma linha existente quebra). **Não criamos `Company` de sistema** (evita o risco de a empresa-fantasma vazar em listagens/cobrança/crons).

### Sem mudança (reuso)
`AiTokenUsage` continua aceitando qualquer `feature` (só ganha `companyId` opcional), `CompanySettings` (flags ia*/cota/markup), toda a camada C1/C2/C3/D. `LabPriceRange` já existe (não criar) — comparativo de preço depende de populá-la, fase posterior.

## Faseamento

- **Fase 1 — Motor óptico + governança base (sem IA no caminho crítico).** `lens-optics.ts` (faixas+disclaimer+sanity-check+falha fechada+guarda-corpos), testes de referência/calibração, painel na OS mostrando o motor, `lensAdvisorModel` no schema + seletor. Entrega: vendedor vê faixa de índice + alertas, custo zero, funciona com IA OFF.
  - **Fonte de calibração (resolve I7):** as faixas de índice/espessura devem ser ancoradas numa **fonte de verdade nomeada** — a tabela de um dos 4 laboratórios já cadastrados, ou referência óptica publicada — **não inventada no playground**. A planilha de calibração é **artefato de entrada da Fase 1** (gerada a partir dessa fonte e conferida pelo dono/óptico), não algo a descobrir depois.
- **Fase 2 — Governança de IA.** `LensKnowledgeDoc` + aba Base de Conhecimento; aba Playground (isolada); "ligar/desligar para todos".
- **Fase 3 — A IA por cima.** `lens-advisor.service.ts` (motor + base de conhecimento com cache + Claude via getAnthropicKey + rate-limit + anti-injeção + logAiUsage + degradação graciosa).
- **Fase 4 — Foto da receita → preenche OS.** Migrar OCR para getAnthropicKey + logAiUsage + modelo configurável; conectar foto → campos da OS → motor.

**Sequência de deploy:** Fase 1+2 juntas (motor + governança, dormente), depois 3+4 (IA ligada). Sempre `migrate status` contra o banco antes de deployar (lição dos blocos anteriores: a main fica defasada de prod; deploy via CLI working-tree).

## Segurança / cuidados

- Motor óptico falha fechada; nunca exibe número de produção sem disclaimer.
- Base de conhecimento por-ótica isolada por `companyId` obrigatório + teste anti-vazamento; sem PII de pacientes.
- Playground não usa cota nem custo de cliente real (empresa-sentinela + feature própria).
- Novo serviço e OCR usam `getAnthropicKey()` (respeita rotação de chave do super admin), `assertAiAllowed`, `logAiUsage`, rate-limit por usuário, defesa anti-injeção (nonce).
- Migrações aditivas (sem DROP). `ENCRYPTION_KEY` já em produção (Bloco D).
- **LGPD da receita (resolve M4):** a imagem da receita não é persistida além do necessário ao OCR; `logAiUsage` grava **só contadores** (tokens/custo), nunca o conteúdo; a transcrição vive apenas nos campos da OS, sob o consentimento já existente do cliente. (Coerente com a preocupação LGPD já registrada para o inbox de WhatsApp.)
- **Painel só em OS em edição/criação (resolve I6):** o Assistente aparece apenas em OS sendo criadas/editadas; OS já finalizadas (as 40 existentes) não são afetadas nem recalculadas retroativamente.

## Fora de escopo (v2+)

- Upload de PDF/planilha com extração (Vercel Blob + parser) — Fase inicial é texto.
- Comparativo de lente com preço/margem da loja — depende de popular `LabPriceRange` (vazio hoje); fase própria.
- Retrieval com tsvector/pgvector — só quando a base crescer além do contexto-no-prompt (gatilho documentado).
- Admin cliente subir documentos próprios; a IA atender o cliente final direto.

## Critérios de sucesso

- Fase 1: vendedor obtém faixa de índice + alertas de sanity-check a partir do grau, com a feature de IA desligada, sem custo de token; motor passa nos testes de referência calibrados.
- Fase 2: super admin sobe documento global e por-ótica; playground responde usando o corpus correto sem tocar cota/custo de cliente; liga/desliga em massa funciona.
- Fase 3: consulta gera recomendação em linguagem de venda usando motor + base de conhecimento; custo medido aparece nos painéis; degrada para só-motor quando IA OFF.
- Fase 4: foto da receita preenche os campos da OS; OCR medido e sob a chave cifrada do super admin.
