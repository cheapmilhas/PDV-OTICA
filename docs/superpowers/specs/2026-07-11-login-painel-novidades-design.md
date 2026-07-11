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
  items: string[];   // 2-3 bullets curtos
}
export interface LoginPanelContent {
  releases: LoginRelease[];       // mais recente primeiro
  support: { whatsappUrl: string };
}
```

Conteúdo escrito à mão em linguagem de balcão (decisão do dono: NÃO derivar do CHANGELOG.md técnico). Suporte: WhatsApp (número real a preencher — `WHATSAPP_NUMBER` em `constants.ts` ainda é placeholder `5585999999999`; deixar marcado TODO até o dono fornecer).

### 2. `src/lib/relative-date.ts` — helper

- `daysAgo(date: string): number | null` — dias desde a data; `null` se inválida ou futura.
- `formatRelative(date: string): string` — "hoje", "há 1 dia", "há 12 dias".

Pequeno, isolado, testável.

### 3. `src/app/(auth)/login/login-side-panel.tsx` — apresentação

Recebe o conteúdo, calcula a idade da release mais recente, decide:
- release mais recente **≤14 dias** → mostra card de novidade ("Novidades" + título + bullets + "há X dias") + rodapé suporte + marca Vis.
- **>14 dias, inválida, ou sem release** → novidade some; sobra painel discreto com identidade Vis + suporte. **Nunca mostra novidade velha** (defesa anti-abandono).
- Container usa `hidden lg:flex` → some no mobile.

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

- `daysAgo`/`formatRelative`: hoje, há 1 dia, há 12 dias, data futura, data inválida.
- regra 14 dias: 10 dias → mostra; 20 dias → esconde; sem release → esconde.
- componente: renderiza novidade fresca; esconde velha; mobile esconde tudo.

Sem teste de auth (não se toca no auth).

## Riscos aceitos

- Atualizar novidade = commit+deploy (é o fluxo atual do dono).
- Sem status de sistema (canal certo p/ "sistema no ar?" é o alerta de saúde por e-mail/WhatsApp que já existe, não a `/login`).

## Fora de escopo

- Model Prisma / CMS / endpoint público (adiado até haver múltiplos editores não-técnicos).
- Status ao vivo (morto pelo painel).
- Ativo visual gerado (Higgsfield/fal-ai) — painel é texto; se um dia quiser ilustração no topo, é adição pontual.
