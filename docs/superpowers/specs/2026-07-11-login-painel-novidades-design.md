# Painel de novidades no login dos lojistas — Design

**Data:** 2026-07-11
**Branch:** `feat/login-painel-novidades` (a partir de `feat/login-redesign`)
**Origem:** forja (painel adversarial) → brainstorming

## Contexto

A tela `/login` (`src/app/(auth)/login/page.tsx`) é vista quase só por quem **já é cliente** — o dono da ótica entrando pra trabalhar. Prospects entram por `/registro` (rota separada). Há espaço vazio ao lado do card de login no desktop. Objetivo: aproveitar esse espaço pra **comunicar novidades ao cliente**, sem virar marketing e sem dívida de manutenção.

## Decisão de arquitetura (sobrevivente do painel adversarial)

Painel **estático**, alimentado por um arquivo TypeScript tipado. **Sem banco, sem endpoint público, sem migração.** O painel adversarial matou as alternativas dinâmicas:
- **Status ao vivo do sistema** foi CORTADO: o health-score interno é por-empresa (vazaria tenant num endpoint público sem sessão — mesmo padrão de IDOR já auditado) e um selo com polling na `/login` reabriria o incidente de Function Invocations que já pausou o projeto.
- **Model Prisma + CMS** foi adiado (YAGNI): construir mini-CMS pra trocar bullets que o dono deploya toda semana é desproporção.
- **Teste de CI que barra staleness** foi CORTADO: bloquearia PRs de bug por falta de changelog (marketing com veto sobre correção). Substituído por "há X dias" visível na UI.

## Componentes

### 1. `src/app/(auth)/login/login-panel-content.ts` — fonte de verdade

Objeto TypeScript tipado. O dono edita só isso e faz commit+deploy.

```ts
export interface LoginRelease {
  date: string;      // ISO "YYYY-MM-DD"
  title: string;     // linguagem de balcão, não release notes técnicas
  items: string[];   // 2-3 bullets curtos, TEXTO PURO (sem links — decisão de simplicidade)
}
export interface LoginPanelContent {
  releases: LoginRelease[];       // idealmente mais recente primeiro; o componente ordena defensivamente
}
```

Conteúdo escrito à mão em linguagem de balcão (decisão do dono: NÃO derivar do CHANGELOG.md técnico). **Itens são texto puro, sem links clicáveis** (item #4 do review — mantém simples).

**Suporte (WhatsApp):** o rodapé monta a URL a partir de `WHATSAPP_NUMBER` em `constants.ts` (não guarda URL pronta no content). Como `WHATSAPP_NUMBER` ainda é placeholder (`5585999999999`), o rodapé de suporte só renderiza quando o número for real — enquanto for o placeholder, **esconde o rodapé** (falha segura, sem link quebrado). Constante `SUPPORT_PLACEHOLDER = "5585999999999"` para o guard.

**i18n:** sem i18n. Strings fixas em pt-BR ("Novidades", "hoje", "há N dias"), consistente com o resto do app (mono-idioma).

### 2. `src/lib/relative-date.ts` — helper

- `daysAgo(date: string): number | null` — dias desde a data; `null` se inválida ou futura.
- `formatRelative(date: string): string` — "hoje", "há 1 dia", "há 12 dias".

Pequeno, isolado, testável.

### 3. `src/app/(auth)/login/login-side-panel.tsx` — apresentação

Ordena `releases` defensivamente por `date` desc (não confia na ordem do array — editor humano pode inserir fora de ordem), pega a mais recente, calcula a idade, decide:
- release mais recente com idade **≤ `MAX_RELEASE_AGE_DAYS` (=14)** → mostra card de novidade + rodapé suporte + marca Vis.
- idade **> 14**, data inválida/futura, ou sem release → novidade some; sobra painel discreto com identidade Vis + suporte. **Nunca mostra novidade velha** (defesa anti-abandono).
- **Renderiza apenas a release mais recente.** `releases[]` é array só para manter histórico no arquivo; o card mostra 1.
- Selo de recência usa a saída de `formatRelative` (que é "hoje" / "há 1 dia" / "há N dias") — no dia do deploy mostra "hoje", não "há 0 dias".

**Constante:** `MAX_RELEASE_AGE_DAYS = 14` nomeada (não literal solto).

**Acessibilidade:** o painel é um `<aside>` (landmark complementar — conteúdo tangencial ao login) com heading real `<h2>Novidades</h2>` (não texto solto). `hidden lg:flex` remove do DOM/a11y no mobile — **intencional** (conteúdo acessório; o form de login é o conteúdo principal e permanece completo).

### 4. Integração em `page.tsx` (visual apenas)

Container externo vira layout de 2 colunas em `lg+`:
- Desktop: card de login (INALTERADO) à esquerda + `LoginSidePanel` à direita, centralizados juntos, largura total controlada (`max-w-4xl`).
- Mobile/`<lg`: painel some; card volta a `max-w-md` centrado — **zero mudança visual no mobile**.

## Invariante de segurança (crítico)

A integração é **puramente visual**. O `LoginSidePanel` é irmão do card, sem `fetch`, sem estado compartilhado com o form. **NÃO toca** em `handleSubmit`, `signIn`, `signOut`, `formData` — lógica next-auth intocada (`email`/`password`/`redirect:false` preservados). O login sempre funciona mesmo se o painel falhar.

## Reaproveitamento visual

Tokens que o `announcement-bar.tsx` já usa: `--brand-primary`, `--brand-tint`, `--lp-border`, `--lp-muted`. Sem cores novas.

## Erros / casos-limite

- `releases` vazio → só marca + suporte. Não quebra.
- data inválida/futura → helper retorna `null` → esconde card (falha segura, nunca "há -3 dias").
- conteúdo malformado → barrado pelo tipo em compile-time.
- login independente do painel — painel quebrado não afeta auth.

## Testes (unitários)

- `daysAgo`/`formatRelative`: dia 0 → "hoje"; 1 dia → "há 1 dia"; 12 dias → "há 12 dias"; data futura → `null`; data inválida → `null`.
- regra `MAX_RELEASE_AGE_DAYS`: **fronteira exata** — 14 dias → mostra; 15 dias → esconde. Mais: 10 → mostra; sem release → esconde.
- ordenação defensiva: array fora de ordem → pega a de `date` mais recente, não `releases[0]`.
- componente: renderiza só a release mais recente quando fresca; esconde quando velha; mobile esconde o `<aside>` inteiro.
- guard de suporte: `WHATSAPP_NUMBER === SUPPORT_PLACEHOLDER` → rodapé de suporte não renderiza (sem link quebrado); número real → renderiza `wa.me/...`.

Sem teste de auth (não se toca no auth).

## Riscos aceitos

- Atualizar novidade = commit+deploy (é o fluxo atual do dono).
- Sem status de sistema (canal certo p/ "sistema no ar?" é o alerta de saúde por e-mail/WhatsApp que já existe, não a `/login`).

## Fora de escopo

- Model Prisma / CMS / endpoint público (adiado até haver múltiplos editores não-técnicos).
- Status ao vivo (morto pelo painel).
- Ativo visual gerado (Higgsfield/fal-ai) — painel é texto; se um dia quiser ilustração no topo, é adição pontual.
