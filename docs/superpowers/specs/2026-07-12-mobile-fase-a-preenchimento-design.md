# Fase A "Preenchimento" — Design / Spec

**Data:** 2026-07-12
**Contexto:** Overhaul mobile/iPad do PDV Ótica. Após as 6 fases do overhaul em produção (PR #52), a auditoria de UX mobile das 87 telas do dashboard isolou 5 frentes de maior alavancagem. Esta spec cobre a primeira — **Preenchimento** — priorizada pelo dono. Passou por painel adversarial (skill `forja`): 3 abordagens criativas + 3 críticos + plano independente do Codex. A abordagem A (só botão ±) foi reprovada como FATAL clínico (mantém divergências por design); a B (keypad com estado-espelho) foi reprovada como FATAL de contrato (dessincroniza na edição); a base é a **C (data-first)** com enxertos das outras.

**Risco:** ALTO. Toca receita óptica (valor errado = lente errada fabricada) e o save path clínico. Cada sub-fase é revisada pelo Codex antes de produção. Teste é a autoridade final.

---

## Problema

A auditoria confirmou o relato do dono e o painel achou um problema mais grave que o original:

1. **Dioptria negativa é impossível de digitar no celular.** Os campos esf/cil/adição usam `inputMode="decimal"`; o teclado decimal do iOS não tem tecla de menos. O código *aceita* o sinal na sanitização, mas o operador não consegue inseri-lo — miopia (esf negativo) e cilíndrico negativo ficam intocáveis no iPhone/iPad.

2. **O servidor grava a receita como texto cru, sem validar faixa.** Verificado no código:
   - `service-order.schema.ts:30` → `prescription: z.string().max(5000)` (string opaca; o backend nunca olha os campos).
   - `grau/route.ts:14-21` → cada campo `z.string().optional()`, sem faixa.
   - Resultado: **quatro comportamentos clínicos divergentes** —
     - OS `nova/page.tsx:350-389`: bloqueia no submit com faixas **erradas** (cil −10..**0**, dnp 20..**40**, altura 10..**45**).
     - OS `editar/page.tsx:319`: **não valida nada** — `JSON.stringify` direto; grava cil +5,00, altura 99.
     - `PrescriptionGradeForm:139`: pinta erro vermelho mas **não bloqueia** o submit.
     - Dialog do Livro `prescription-grade-dialog.tsx:42-65`: **ignora** `validateGrade`.
   - As faixas corretas existem em `prescription-grade-validation.ts:38-45` (esf −30..+30, cil −10..+10, add +0,50..+4,00, eixo 0..180, dnp 20..80, altura 10..40) e no Zod `prescription.schema.ts`, mas **nenhum save de OS/grau os usa**.

3. **154 inputs `type="number"` em 58 arquivos** quebram a vírgula decimal pt-BR no iOS e não têm sinal. O padrão correto (`type="text"` + `inputMode="decimal"` + sanitização) já existe inline em `pdv/modal-finalizar-venda.tsx` e `funil/novo-lead-modal.tsx`, mas está copiado, não centralizado — e `financeiro/modal-receber-conta.tsx:269` ainda usa o anti-padrão `type="number"`.

---

## Decisões travadas (dono)

- Alvo do overhaul mobile: **web app polido** (não PWA).
- Teclado-calculadora ± **só na dioptria**, layout **calculadora clássica (A) + faixa fina de chips de valores comuns** por cima. Digitação livre é a via principal; atalhos ±0,25 e chips aceleram.
- **Blindar o servidor junto** (não adiar) — validação de faixa server-side + submit bloqueante.
- Passo 0,25: **digitação livre + atalhos ±0,25** — o teclado nunca arredonda sozinho (cobre laudo atípico).
- Sinal: **começa neutro, ± explícito** — sem sinal-default pré-preenchido (evita normalizar o negativo e induzir erro no astigmatismo transposto positivo, ex. cil +0,75).
- Campo **adição**: mesmo teclado, **sem** botão ± (faixa +0,50..+4,00, sempre positivo).
- Dados legados fora da faixa: **validar só o que for editado** — abrir OS antiga não quebra a leitura; ao salvar, o servidor exige a faixa. Sem migração de dados.
- Fatiamento: **3 sub-fases incrementais**, cada uma um diff revisável e deploy independente.

---

## Arquitetura — 3 sub-fases

### A1 — Teclado-calculadora óptico (`DiopterKeypad`)

**Unidade:** um bottom-sheet que abre ao tocar num campo de dioptria, opera sobre estado string controlado e emite string sanitizada.

- **Componente novo:** `src/components/prescriptions/diopter-keypad.tsx` (client). Usa o `Sheet`/`Dialog` do shadcn já no projeto — **sem dependência nova** (nenhuma lib de máscara; nenhuma está no `package.json` e o `replace` de 3 linhas basta).
- **Layout (A + chips):**
  - Visor no topo: valor formatado (`−2,25 D`) + feedback de faixa ao vivo (verde dentro / vermelho fora).
  - Faixa fina de chips de valores comuns (aceleradores, secundários).
  - Teclado numérico (via principal): dígitos, vírgula, apagar, limpar.
  - Coluna de atalhos `−0,25` / `+0,25`.
  - Botão `±` **explícito**, começa **neutro** (não pré-seleciona sinal). **Ausente no campo adição.**
  - Botões ≥ 44px (`size="touch"`/`icon-touch`).
- **Contrato (mata o furo FATAL do painel):**
  - Props: `value: string`, `onChange: (raw: string) => void`, `field: "esf" | "cil" | "adicao"` (governa presença do ± e a faixa do feedback), `label` (ex. "OD · Esférico").
  - **Sem estado-espelho.** O keypad deriva a exibição do `value` prop a cada render; não mantém magnitude/sinal internos que possam dessincronizar. Ao editar OS com `−3,00` salvo, ou quando o form muda o value por fora (OCR), o visor reflete a prop.
  - Emite string já passada por um **sanitizador de sinal** que colapsa sinais múltiplos e força `−` na posição 0 → `--2,25`/`2-,25`/`+-2,25` nunca ocorrem.
- **Gate de ativação:** capacidade de toque (`coarse pointer`, ex. `matchMedia("(pointer: coarse)")` via hook SSR-safe), **não largura de tela**. Garante o teclado no **iPad** (estação de trabalho do dono). No desktop com mouse, o campo permanece input normal.
- **Ligações:** substituir os inputs de esf/cil/adição por um gatilho (botão-visor no toque; input direto no mouse) em `prescription-grade-form.tsx` (layout phone e, via gate coarse, também iPad) e nas grades das OS **após** a unificação A2.

**Utilitário puro novo:** `src/lib/diopter-input.ts` — `flipSign(raw)`, `sanitizeSign(raw)`, `formatDiopter(raw)`. Testável isoladamente.

### A2 — Núcleo clínico (servidor + unificação + submit bloqueante)

Três mudanças que andam juntas por tocarem o mesmo save path.

**(a) Fonte única de faixas + validação server-side.**
- Centralizar a tabela de faixas de `prescription-grade-validation.ts` como fonte única reutilizável por cliente **e** servidor (esf −30..+30, cil −10..+10, add +0,50..+4,00, eixo 0..180, dnp 20..80, altura 10..40).
- Aplicar validação de faixa Zod real em `service-order.schema.ts` e em `grau/route.ts`, contra a fonte única de faixas.
- **Formato de payload por save path (cravar no plano):** hoje `editar/page.tsx` envia `prescription` como **string JSON** dentro do payload da OS, enquanto a rota `grau` já recebe **objeto estruturado**. O plano deve declarar explicitamente a forma que cada caminho adota — o Zod da OS ou faz `.transform`/`JSON.parse` da string e valida o objeto resultante, ou o wire format da OS muda para objeto estruturado. Escolher um e escrever o schema uma vez contra contrato conhecido.
- **Validar só o que for editado:** a validação roda no payload de escrita; leitura de dado legado não é bloqueada. Sem migração.

**(b) Unificar a grade da OS no `PrescriptionGradeForm`.**
- `nova/page.tsx` e `editar/page.tsx` param de rolar a tabela de dioptria inline e passam a consumir o componente compartilhado.
- **Preservar campos que o form não conhece:** a OS carrega prisma, base, olhoDominante, pantoscopicAngle, vertexDistance, ceratometria (8 subcampos), dnpPerto (injetado `as any`), e o cálculo automático esf-perto = esf-longe + adição (`nova:783-786`). O form emite só o patch `{od, oe, adicao}`; o parent faz o merge preservando o resto.
- Remover os sanitizers duplicados (`nova:95`, `editar:239`) → importar da lib.

**(c) Submit bloqueante.**
- `PrescriptionGradeForm`, o dialog do Livro e as OS unificadas **bloqueiam o submit** quando `validateGrade` falha (hoje só pintam vermelho / ignoram).

Resultado: os quatro comportamentos divergentes viram um só, validado no cliente **e** no servidor.

### A3 — `DecimalInput` sistêmico

- **Componente novo:** `src/components/ui/decimal-input.tsx` — congela `type="text"` + `inputMode="decimal"` + sanitização numa fonte única; preset `money` (prefixo R$, 2 casas no blur). Contrato string-first: `value: string`, `onValueChange: (raw: string) => void`. Remove o `type="number"` (anti-padrão de `modal-receber-conta`).
- **Dois parsers separados** em `src/lib/decimal-parse.ts`, nunca um só:
  - `parseMoneyPtBR` — ponto = milhar: `"1.234,56"` → 1234.56.
  - `parseDiopter` — ponto = decimal: `"2.25"` → 2.25 (o placeholder da grade é `+0.00`, ensina ponto decimal).
- **Migração incremental por telas quentes, NÃO big-bang.** Ordem: PDV/preço, caixa (abertura/sangria/reforço/fechamento). O restante dos 154 migra oportunisticamente quando a tela for tocada. Cada lote com revisão por tela — sem substituição automática cega (muitos dos 154 são inteiros/não-monetários).

---

## Fluxo de dados

Dioptria: `value` (string, ex. `"-2,25"`) vive no estado do form → `DiopterKeypad` exibe/edita → emite string sanitizada → `PrescriptionGradeForm` faz merge do patch `{od,oe,adicao}` → parent da OS preserva demais campos → submit valida via fonte única (cliente) → request valida via fonte única (servidor). Sem conversão string→number no meio; parse só na validação.

Dinheiro: `value` (string) → `DecimalInput` sanitiza on change → consumidor parseia via `parseMoneyPtBR` no ponto de envio.

---

## Erros e casos-limite

- Sinal múltiplo/mal posicionado (`--2,25`, `2-,25`): normalizado por `sanitizeSign` antes de emitir.
- Toggle ± sobre campo vazio: não gera `"-"` órfão inválido (define comportamento no util — vazio permanece vazio até haver dígito).
- Valor fora do passo 0,25 (laudo): aceito por digitação livre; nunca arredondado.
- Astigmatismo positivo (cil +0,75): possível porque o sinal começa neutro e o ± é explícito.
- Adição negativa: impossível (sem ± no campo).
- OS legada fora da faixa: abre e lê normal; só bloqueia ao salvar campo editado fora da faixa.
- Merge da grade na OS: teste de regressão garante que nenhum campo não-conhecido some.
- Ambiguidade ponto milhar vs decimal: resolvida por parsers separados por domínio.

---

## Testes (autoridade final)

**Puros/unitários:**
- `diopter-input.ts`: `flipSign`/`sanitizeSign` (`--2,25`→`-2,25`, `2-,25`→`-2,25`, toggle sobre vazio), `formatDiopter`.
- `decimal-parse.ts`: tabela — `parseMoneyPtBR("1.234,56")=1234.56`, `parseDiopter("2.25")=2.25`, `"-1,75"`→-1.75, `""`→null, `"abc"`→null.
- Faixas: fonte única cliente e servidor produzem o mesmo veredito.

**Regressão (trava a unificação A2):**
- Salvar OS pela grade unificada e assertar prisma/base/ceratometria/olhoDominante/dnpPerto/cálculo-perto **intactos** — nenhum campo some no merge. ⚠️ O plano deve **conferir o conjunto completo de campos contra os objetos de estado reais de `nova`/`editar`** — o `dnpPerto` é injetado via `as any` (`nova:820-827`), sinal de que o shape do estado da OS é mais frouxo que o patch tipado do form; é onde um campo pode ser silenciosamente descartado.

**Bloqueio:** grau fora da faixa não passa no cliente nem no servidor.

**E2E (crítico):** Playwright — digitar miopia `-2,25` no teclado no viewport mobile; editar OS existente com valor negativo salvo.

---

## Ordem de deploy

1. **A1** (teclado ±) — destrava miopia no celular. Isolado no form, baixo risco, valor imediato. Codex revisa o diff.
2. **A2** (servidor + unificação + bloqueio) — núcleo clínico. Só vai a prod **após o teste de regressão do save passar**. Diff revisado a fundo pelo Codex (alto risco).
3. **A3** (`DecimalInput`) — incremental, telas quentes primeiro.

Todas as sub-fases são 100% UI + validação de request. **Zero migration de banco** (A2 mexe em schema Zod de request, não em tabela).

---

## Fora de escopo (fases futuras da auditoria mobile)

- ~14 tabelas largas cruas → `ResponsiveTable cards`.
- Alvos de toque <44px fora de PDV/checkout.
- Aposentar o hamburger deslizante (8 rotas só nele → sheet "Mais" da bottom-nav).
- Hydration error `/admin/clientes/novo` (bug separado, [[hydration-error-clientes-novo]]).
- NF-e (adiado por decisão do dono).
