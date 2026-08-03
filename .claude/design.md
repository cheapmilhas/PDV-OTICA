# Contrato de design — PDV ÓTICA

Gerado por `/design-init` em 2026-07-31 a partir do código real. Para atualizar, rode
`/design-init` de novo — não edite as seções 1–3 à mão.

## 1. Tokens canônicos

Precedência resolvida pelo **seletor CSS de escopo**, não por diretório de rota.

| Seletor | Papel | Vars |
|---|---|---|
| `:root` (bloco 1) | Design system da landing: `--lp-*`, `--brand-*` | 22 |
| `.landing-dark` | Variante escura da landing (não é o default) | 8 |
| `:root` (bloco 2) | shadcn/ui em HSL | 36 |
| `.dark` | Tema escuro do dashboard | 35 |
| `.landing-scope` | Aliases da landing que **não** colidem com o Tailwind | 4 |

**A regra que não pode ser quebrada (custou 28 pontos errados em produção):**
existem duas convenções de cor, e o mesmo identificador nunca pode servir às duas.

| Grupo | Formato | Como se consome |
|---|---|---|
| `--lp-*`, `--brand-*` | cor completa (hex/rgba) | crua: `bg-[var(--lp-surface)]` |
| vars do shadcn (`--background`, `--foreground`, `--muted`, `--border`…) | tripla HSL | só dentro de `hsl()` — é o que o `tailwind.config` faz: `foreground: "hsl(var(--foreground))"` |

Redefinir um nome do segundo grupo com um valor do primeiro produz `hsl(#0A1F44)`:
CSS inválido, **declaração descartada em silêncio**. Sem erro de build, sem warning,
sem teste vermelho — a cor cai para herança e só aparece no site, para o visitante.
Era o que `.landing-scope *` fazia até 2026-08-02, matando `text-foreground`,
`border-border` e as três utilities de sombra dentro da landing.

**Consequência prática:** um componente que vive dentro e fora de `.landing-scope`
deve consumir **os nomes do shadcn dentro de `hsl()`** e deixar o escopo escolher a
paleta via utility (`:where(.landing-scope) .text-foreground`). Nunca redefina um
nome do shadcn com valor de cor completa para "fazer funcionar nos dois lugares".

`scripts/check-landing-colors.cjs` verifica as duas metades disso por compilação:
nenhuma var de cor completa dentro de `hsl()`, e toda classe custom citada no JSX
existindo no CSS de saída. Rode-o depois de mexer em cor.

Marca: `--brand-primary #2E6BFF` (azul Vis, ações), `--brand-navy #0A1F44`,
`--brand-accent #22C3E6` (ciano, realce raro).

Breakpoint próprio: `tab: 834px` (iPad), pareado com `src/hooks/use-media-query.ts`.

## 2. Inventário — `src/components/ui/` (37 componentes)

Consulte antes de escrever qualquer componente. Reescrever o que existe é o erro mais caro.

| Componente | Importadores |
|---|---|
| `button` | 184 |
| `card` | 117 |
| `label` | 95 |
| `input` | 87 |
| `select` | 71 |
| `badge` | 70 |
| `table` | 67 |
| `dialog` | 65 |
| `responsive-table` | 58 |
| `textarea` | 37 |
| `popover` | 22 |
| `alert` | 19 |
| `tabs` | 19 |
| `calendar` | 18 |
| `alert-dialog` | 16 |
| `checkbox` | 16 |
| `avatar` | 11 |
| `gradient-text` | 10 |
| `separator` | 10 |
| `switch` | 9 |
| `decimal-input` | 6 |
| `progress` | 5 |
| `sheet` | 5 |
| `collapsible` | 3 |
| `command` | 3 |
| `confirm-reason-dialog` | 3 |
| `form` | 3 |
| `dropdown-menu` | 2 |
| `toast` | 2 |
| `animated-counter` | 1 |
| `scroll-area` | 1 |
| `status-badge` | 1 |
| `toaster` | 1 |
| `bento-card` | 0 |
| `combobox` | 0 |

Destaques que evitam retrabalho:

- **`card` aplica `shadow-card`** (`src/components/ui/card.tsx:12`) — usar `<Card>` já traz
  o token da marca, sem precisar escrever a classe.
- **`responsive-table`** tem modo cards para mobile via `data-label` — 58 telas já usam.
  Antes de montar tabela nova, verifique se ela resolve.
- **`combobox` e `bento-card` existem e têm 0 importadores** — estão disponíveis e
  esquecidos, não ausentes.

## 3. Realidade medida

Cada número com o comando que o gerou. **Contagem textual mede citação, não adoção.**

| Métrica | Valor | Comando |
|---|---|---|
| `shadow-card` (citações) | 4 | `grep -roE 'shadow-card[a-z-]*' src --include='*.tsx' \| wc -l` |
| `shadow-lg\|md\|sm\|xl` | 77 | `grep -roE 'shadow-(lg\|md\|sm\|xl)' src --include='*.tsx' \| wc -l` |
| Importadores de `ui/card` | 117 | `grep -rl 'components/ui/card' src --include='*.tsx' \| wc -l` |
| Hardcoded neutro | 603 | `grep -roE '(bg\|text\|border)-(slate\|gray\|zinc\|neutral)-[0-9]+' src --include='*.tsx' \| wc -l` |
| Semânticas | 3677 | `grep -roE '(bg\|text\|border)-(muted\|primary\|foreground\|card\|accent\|secondary\|destructive)[a-z-]*' src --include='*.tsx' \| wc -l` |

**Não conclua que "o token perde".** `shadow-card` tem 4 citações textuais mas alcança 117
telas por herança de `<Card>`. O sinal legítimo é *default usado onde o token já estava
disponível* — `shadow-lg` em arquivo que poderia usar `<Card>` —, não placar bruto.

**Escala de espaçamento:** o projeto **não define `spacing` próprio** em
`tailwind.config.js`. Por isso o sinal 3 do gate fica inativo aqui.

<!-- design-init:keep -->
## 4. Exceções

Caminhos onde a regra de token **não se aplica**, com o motivo.

- **Impressos e comprovantes** (`**/imprimir/**`, `**/comprovante-*`) — usam cor hardcoded
  (`bg-slate-100` etc.) **de propósito**. Impresso não tem dark mode e precisa de cor
  determinística que sobreviva ao `print` do navegador. Trocar por `bg-muted` quebraria os
  PDFs de OS, venda e orçamento que vão para o cliente final.

  Os arquivos mais afetados são exatamente esses: `comprovante-movimentacao.tsx` (46),
  `ordens-servico/[id]/imprimir` (44), `vendas/[id]/imprimir` (26),
  `orcamentos/[id]/imprimir` (26).

- **`teal-*` (99 ocorrências)** — resto do rebrand teal→azul Vis. **Não trate como legado
  proibido sem triagem**: parte pode ser marca legítima do produto médico. Migração exige
  decisão caso a caso, não lint.
<!-- /design-init:keep -->
