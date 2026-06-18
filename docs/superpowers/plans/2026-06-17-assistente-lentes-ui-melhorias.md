# Assistente de Lentes — Melhorias de Design · PADRÃO OURO (para ANALISAR e APROVAR)

> **Status:** análise feita com 3 lentes de design independentes (ui-ux-pro-max + impeccable/critique + web-interface-guidelines), todas sobre o CÓDIGO REAL das telas F1–F4. NADA implementado. Este doc é para o dono escolher o que aprovar.

**Telas auditadas:** painel da OS (`lens-advisor-panel.tsx` — a mais usada, voltada ao vendedor no balcão), playground (`playground-client.tsx`), config de IA (`ia-client.tsx`), base de conhecimento (`knowledge-client.tsx`).

**Princípio:** respeitar o design system EXISTENTE (tema claro, shadcn no `(dashboard)`, tokens Tailwind, acento teal, amber p/ avisos). Sem rebrand — só consistência, acessibilidade, clareza e polimento.

**3 lentes cruzadas:**
- `ui-ux-pro-max` → consistência de componente, toque, estados.
- `impeccable critique` (registro "product": a ferramenta deve sumir na tarefa) → hierarquia de confiança, microcopy, jornada emocional, riscos de "IA parece fato".
- `web-interface-guidelines` (Vercel) → conformidade fina de a11y/forms/typography.

**Premissa corrigida:** o `src/app/admin` inteiro usa `<select>`/`<input>` crus (não shadcn) — então as telas admin de lentes NÃO são exceção quebrada. O que é específico de lentes é a string de estilo duplicada (item E1).

---

## 🔴 NOVOS achados de ALTO impacto (só apareceram nas lentes extras — valem o ouro)

Estes dois NÃO estavam no plano anterior e são **risco de venda errada**, não polimento:

| # | O quê | Onde | Por que importa (vendedor no balcão) | Sev | Esf |
|---|---|---|---|---|---|
| **N1** | **O texto da IA NÃO é limpo quando o grau/armação muda.** O resultado do motor (useMemo) recalcula na hora, mas `aiText` fica na tela até o próximo fetch → a explicação da IA escrita p/ −2,00 pode ficar embaixo de um motor recalculado p/ −6,00. | lens-advisor-panel.tsx | A IA pode **contradizer ativamente** o motor na frente do cliente. Risco real de venda errada. | **P1 (bug)** | S |
| **N2** | **O bloco de FALHA ("Confira a receita" = motor se RECUSOU a recomendar) é visualmente idêntico ao alerta leve ("Atenção" = só confira o eixo).** Mesma cor, mesmo ícone. | lens-advisor-panel.tsx:238 vs 262 | O vendedor não distingue "não consigo recomendar lente p/ esses dados" de "confira um detalhe". É o momento de maior risco do painel, tratado como nota de rodapé. | P2 | S |

---

## GRUPO A — Acessibilidade (recomendo aprovar; contém o P1 clássico + conformidade Vercel)

| # | O quê | Onde | Sev | Esf |
|---|---|---|---|---|
| A1 | **8 campos de grau (OD/OE) + 2 de armação do playground sem `htmlFor`/`id`** — clicar no rótulo não foca, leitor de tela não associa. (confirmado por 2 lentes) | playground-client.tsx:91+ | **P1** | M |
| A2 | Cabeçalho colapsável do painel (`div role="button"`) **sem `focus-visible:ring`** → usuário de teclado não vê o foco. Idealmente `<button>` real + `aria-controls`/`id` na região. | lens-advisor-panel.tsx:176 | P2 | S |
| A3 | Ícones decorativos (`Eye`, `ChevronDown`, `AlertTriangle`×2, `Sparkles`) **sem `aria-hidden="true"`**. | lens-advisor-panel.tsx:191/194/241/265/286 | P3 | S |
| A4 | `<select>` crus sem `text-foreground` explícito (só `bg-background`) → risco de contraste em algumas plataformas. | playground/ia/knowledge | P3 | S |
| A5 | Em erro de submit, o foco não vai p/ o primeiro erro (banner não recebe foco). | playground/ia/knowledge | P3 | S |

---

## GRUPO B — Estados da IA (loading/erro) no painel da OS (recomendo aprovar; é a tela do vendedor)

| # | O quê | Onde | Sev | Esf |
|---|---|---|---|---|
| B1 | **Erro "IA indisponível" com o MESMO estilo (`text-xs muted`) do disclaimer neutro** → erro parece legendinha. Dar tratamento distinto (amber/`destructive` + ícone) E reescrever a copy (ver M1). | lens-advisor-panel.tsx:302 | P2 | S |
| B2 | **Sem spinner durante o fetch da IA** — só o label muda. No wifi do balcão, o vendedor não sabe se travou. Trocar `Sparkles`→`Loader2` girando + skeleton de 2 linhas na região `aria-live`. | lens-advisor-panel.tsx:286 | P2 | S |

---

## GRUPO C — Hierarquia de confiança (motor = fato, IA = comentário) (recomendo aprovar junto de N1/B1)

| # | O quê | Onde | Sev | Esf |
|---|---|---|---|---|
| C1 | **Resultado do motor (determinístico) e texto da IA usam o MESMO container `bg-muted/30`** → vendedor lê prosa da IA como fato calculado. Subordinar a IA visualmente: tirar o card, corpo `muted`, prefixo `Sparkles` + micro-legenda "Sugestão da IA · apoio à venda · confira sempre os dados acima". | lens-advisor-panel.tsx:59 vs 292 | P2 | S |
| C2 | Disclaimer da espessura em `text-xs muted` muito apagado (é aviso de precisão). Leve realce ou ícone de info. | lens-advisor-panel.tsx:259 | P3 | S |
| C3 | Números (espessura `min–max mm`, tokens) sem `tabular-nums`. | painel + playground | P3 | S |

---

## GRUPO D — Bug de interação real (o único duplo-submit de verdade)

| # | O quê | Onde | Sev | Esf |
|---|---|---|---|---|
| D1 | **Base de conhecimento: Ativar/Desativar/Excluir não desabilitam durante o PATCH/DELETE** → clique rápido = requisição duplicada. Travar por-linha. (confirmado por 2 lentes) | knowledge-client.tsx:67/86/195 | P2 | M |
| D2 | Esses botões são `text-xs` minúsculos e colados → abaixo de 44px de toque. Aumentar a área. | knowledge-client.tsx:198 | P2 | S |
| D3 | Título do documento na tabela sem `truncate`/`break-words` → título longo estoura o layout. | knowledge-client.tsx:178 | P3 | S |

---

## GRUPO E — Consistência / copy (valor menor; admin já é "cru" por convenção)

| # | O quê | Onde | Sev | Esf |
|---|---|---|---|---|
| E1 | String `inputClass` copiada VERBATIM nas 3 telas admin. Extrair `<AdminInput>`/`<AdminSelect>` (corrige as 3). | playground/ia/knowledge | P2 | M |
| E2 | Ajuda do OCR diz "Sonnet lê manuscrito melhor que Haiku" mas a lista ainda rotula Haiku como "padrão" → contraditório p/ o OCR. | ia-client.tsx:19 vs 345 | P2 | S |
| E3 | Banner de sucesso/erro no TOPO de form longo, botão Salvar embaixo → confirmação fora da tela. Ecoar perto do botão ou toast. | ia-client.tsx:135 vs 351 | P2 | S |
| E4 | Banner "info" do playground usa `sky-*` (fora dos tokens; é o "azul-info" default de UI gerada por IA). Trocar por `muted`/teal; erros num único token `destructive` em vez de `rose-*`. | playground-client.tsx:234 | P3 | S |
| E5 | Knowledge: `window.confirm` no excluir (o app usa shadcn `AlertDialog`); badges Ativo/Inativo hardcoded em vez do `StatusBadge`. | knowledge-client.tsx:87/185 | P3 | M |
| E6 | Status da chave usa emoji 🔑/⚠️ em vez de ícone lucide + `StatusBadge`. | ia-client.tsx:154/193 | P3 | S |
| E7 | Placeholders "opcional" não mostram exemplo (a guideline pede ex. terminando em "…", ex.: "ex.: 52…"). | painel + playground | P3 | S |

---

## ✏️ Microcopy (antes → depois) — barato e alto valor

| # | Onde | Antes | Depois (por quê) |
|---|---|---|---|
| M1 | erro da IA (painel) | "IA indisponível no momento." | "Não foi possível gerar a explicação agora. Os dados acima (índice e espessura) continuam válidos." — reassegura que o resultado REAL não falhou. |
| M2 | bloco de FALHA (painel, antes dos bullets) | _(sem frase de abertura)_ | "Não consigo recomendar uma lente com estes dados:" — deixa claro que o motor SE RECUSOU, não só cutucou (par com N2). |
| M3 | título do bloco da IA | "Explicação da IA" | "Sugestão da IA · apoio à venda" — enquadra como comentário, não autoridade (par com C1). |

---

## ❓ Pergunta estratégica (da crítica impeccable — vale decidir)
**O botão "Explicar com IA" se paga?** Cada geração consome créditos da ótica. Se o resultado determinístico já é completo e confiável, o que a prosa da IA faz que um tooltip estático "por que mais fino = mais confortável" não faça — a custo zero e risco zero de alucinação? → Opção futura: avaliar se a IA deve aparecer só num gatilho de upsell, ou virar conteúdo estático.

---

## O que JÁ está bom (não mexer) — confirmado pelas 3 lentes
- Os 3 botões primários (Explicar / Testar / Salvar) já desabilitam no async e trocam o label — sem duplo-submit nesses.
- O motor **falha fechada** e a UI honra: o botão da IA só aparece com `analysis.valid` → a IA nunca narra receita implausível.
- Validação client-side na config de IA evita o footgun de descarte silencioso.
- `aria-live` nas respostas da IA, alertas amber com ícone (não cor-sozinha), loading/empty states na base de conhecimento, inputs de senha com `autoComplete="new-password"`, grids responsivos a 375px, jargão técnico (`sagitta`, `equivalente esférico`) NÃO vaza pro vendedor.

---

## Pacotes para aprovação (escolha um ou misture)

**Pacote OURO — "Confiança do vendedor" (recomendado · ~S/M · baixo risco):**
N1 (limpar IA stale = bug) + N2/M2 (FALHA distinta) + C1/M3 (IA = comentário) + B1/M1 (erro da IA claro) + B2 (spinner) + D1/D2 (bug duplo-submit + toque) + A1 (a11y P1).
→ Resolve os 2 riscos de venda errada, o único bug real, o único P1 de a11y, e a confusão "IA parece fato" — tudo na tela mais usada. **É o conjunto que mais protege o vendedor e o cliente.**

**Pacote "Polimento completo":** Pacote OURO + A2, A3, A4, A5, C2, C3, E2, E3, E4, E7 (todos S).
→ Acabamento fino, conformidade Vercel, sem refator.

**Pacote "Consistência estrutural" (maior, opcional):** E1 (componente admin compartilhado) + E5 (AlertDialog/StatusBadge) + E6 + D3.
→ Reduz duplicação; toca padrão do admin (avaliar se vale agora).

---

## Como eu implementaria (se aprovado)
- Subagent-driven, item a item, com spec-review nos que tocam comportamento (N1, D1) e tsc/visual nos de pura UI.
- TODOS aditivos/cosméticos exceto N1 e D1 (lógica de estado) — zero migração, zero env.
- Parar antes do deploy (mesmo gate das fases anteriores) p/ seu OK.
- Sem mudar o design system — só aplicar com mais consistência o que ele já define.
