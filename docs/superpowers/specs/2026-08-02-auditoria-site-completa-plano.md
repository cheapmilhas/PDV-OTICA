# Auditoria completa do site — achados e plano de correção

**Data:** 2026-08-02 · **Método:** 3 lentes paralelas (copy/conversão, design/tokens, SEO/a11y/técnica) sobre as 17 páginas públicas, código + HTML de produção. 65 achados brutos; os críticos re-verificados um a um antes de entrar aqui. Governança: skill `design-vis` + contrato de design.

**Estado de partida honesto:** o que os PRs #55 e #56 entregaram passou limpo — hierarquia ≥3 degraus em toda página, zero teal, CTAs primários consistentes, links todos válidos, `target=_blank` seguro. Os problemas abaixo são **herdados** das seções antigas ou **estruturais**.

---

## ONDA 0 — Ações que só o dono pode fazer (sem código)

| # | Ação | Por quê |
|---|---|---|
| 0.1 | **Fornecer o número real de WhatsApp** | `constants.ts:7` tem `"5585999999999" // TODO: TROCAR PELO NÚMERO REAL`. Hero, FinalCta, exit popup, footer, botão flutuante, CTA do plano Rede e a página /contato mandam leads para número inexistente. **É o maior vazamento de conversão do site** — verificado. |
| 0.2 | Conectar o Higgsfield (Settings → Connectors → `https://mcp.higgsfield.ai/mcp`) | Destrava a Onda H (assets de vídeo/imagem). Verificado: ainda não conectado. |
| 0.3 | Nomear 2-3 sites cujo design admira | Preenche o `references.md` da arquitetura de design (vazio desde a criação). |
| 0.4 | Decisão jurídica: privacidade/termos ainda dizem "PDV Ótica" e os e-mails legais apontam `dpo@pdvotica.com.br` | Bloqueio conhecido p/ tráfego médico; o canal LGPD pode estar quebrado se a caixa antiga não existir. |

## ONDA 1 — Sangramentos de conversão (correções pequenas, impacto direto)

| # | Achado (verificado) | Correção | Arquivo |
|---|---|---|---|
| 1.1 | "Já tem conta? Entrar" do cadastro **médico** aponta para `/login` **ótico**, que não autentica médico — beco sem saída no funil | Trocar por `MEDICAL_LOGIN_URL` (já existe em constants) | `registro-medical/page.tsx:516` |
| 1.2 | Exit popup oferece "**7** dias grátis" enquanto todo o resto diz 14/`trialDays` — dois prazos na mesma sessão | Unificar com a fonte real | `exit-intent-popup.tsx:22` |
| 1.3 | Exit popup só tem variante ótica; na home (2 públicos) diz "Sua ótica no controle" | Variante neutra de dois caminhos | `exit-intent-popup.tsx:38` |
| 1.4 | Fetch de planos do `/registro` engole erro (`catch(() => {})`) → spinner **infinito** no último passo se a API falhar | Estado de erro + retry (o medical já faz certo) | `registro/page.tsx:79,333` |
| 1.5 | Grid de preços da ótica: sem skeleton e com catch silencioso → página de preços vazia para sempre em falha | Espelhar `medical-pricing` (skeleton + `role="alert"`) | `pricing-section.tsx:26-31` |
| 1.6 | Mensagem pré-preenchida do WhatsApp diz "sistema de gestão para **óticas**" inclusive na `/medical` | Mensagem consciente de rota | `constants.ts:8-10` |
| 1.7 | `/contato`: card "Comece grátis… Crie sua conta agora" **sem link nem botão** | CTA para `/registro` e `/registro-medical` | `contato/page.tsx:243-254` |
| 1.8 | `/contato` recebe leads dos 2 produtos mas o form diz "Nome da **ótica**" | Copy neutra ou seletor de segmento | `contato/page.tsx:63-64,141` |
| 1.9 | Pós-cadastro ótico despeja o usuário no `/login` para redigitar o que acabou de criar | Auto-login ou e-mail pré-preenchido | `registro/page.tsx:167-174` |
| 1.10 | Na `/medical`, "Planos" do header abre a aba **ótica** de `/precos` (R$ 149,90 vs 189,90) | Header consciente de rota → `/precos?produto=clinica` | `constants.ts:52` |
| 1.11 | `/precos` na aba **clínica** termina com FAQ "dono de ótica" e FinalCta "Sua ótica merece" → funil ótico | Condicionar ao produto ativo | `precos/page.tsx:54-55` |

## ONDA 2 — SEO e compartilhamento (verificado em produção)

| # | Achado | Correção | Onde |
|---|---|---|---|
| 2.1 | **Zero `og:image`** em /oticas, /medical, /precos, /contato, /funcionalidades, /vis-vs-planilha e /blog — `openGraph` próprio sem `images` descarta o do RootLayout. Compartilhar no WhatsApp = card sem imagem | `images` em cada `openGraph` (ou `opengraph-image.tsx` por segmento) | 7 páginas |
| 2.2 | **Zero `<h1>`** em /precos, /funcionalidades, /blog e /vis-vs-planilha — `SectionHeading` sempre rende `<h2>` | Prop `as="h1"` no primeiro uso de cada página | `section-heading.tsx:18` |
| 2.3 | `/registro` no sitemap (priority 0.9) mas com canonical apontando a home — "indexe-me" e "sou duplicata" ao mesmo tempo | Canonical próprio (`/registro` e `/registro-medical`) | `sitemap.ts:60` + layouts |
| 2.4 | `/privacidade` e `/termos` herdam canonical da home | `alternates.canonical` próprios | 2 páginas |
| 2.5 | `/login` sem metadata (title = home) e indexável, contradizendo `robots.ts` | `title: "Entrar"` + `robots: noindex` | layout do (auth) |
| 2.6 | O único og:image do site diz "gestão clara da sua **ótica**" — servido também na home de 2 produtos e no registro médico | Atualizar arte/alt para os 2 produtos (candidato a Higgsfield) | `opengraph-image.tsx` |

## ONDA 3 — Promessas que o código não garante (copy honesta)

| # | Promessa no ar | Realidade | Correção |
|---|---|---|---|
| 3.1 | "Integração com certificado A1 e A3 para emissão fiscal" | NFe/NFC-e ainda **aguarda aprovação**, sem credenciais | Remover o card até existir | 
| 3.2 | "Resposta em menos de 2 horas" | A própria FAQ diz "horário comercial" | Alinhar com a FAQ |
| 3.3 | "Diferencial **exclusivo**" + chips Essilor/Hoya/Zeiss sugerindo parceria | É um campo de laboratório na OS | "Funciona com qualquer laboratório" |
| 3.4 | ROI calculator: 60% / +5% / 30% viram "recupere até R$ X/mês" | Multiplicadores sem fonte | Premissas ajustáveis ou rótulo claro de simulação |
| 3.5 | "LGPD Compliant / Conformidade **total**" | Afirmação jurídica inverificável (e legais desatualizados) | Fórmula já usada no site: "dados tratados conforme a LGPD" |
| 3.6 | "Prontuário **assinado** por quem atendeu" | Se não há assinatura digital ICP-Brasil, promete demais em contexto médico | Verificar; senão "registrado por quem atendeu" |
| 3.7 | Migração "sem interrupção da sua operação" | Processo não formalizado (import P.S Vision pendente) | Prometer só a ajuda |
| 3.8 | "Um diferencial que **só o Vis tem**" vs, 3 bullets abaixo, "que **poucos** sistemas oferecem" | Contradição na mesma página | Manter a versão honesta |

## ONDA 4 — Tokens quebrados sob `.landing-scope` (a dívida estrutural)

O mecanismo (confirmado): `--lp-*` guarda **hex**, o Tailwind compila `hsl(var(--x))` → `hsl(#0A1F44)` é inválido → a cor cai para herança/`currentColor`. **31 ocorrências em 11 arquivos** renderizam errado em produção hoje — títulos do footer, H2 da FAQ (3 páginas), divisor do footer em cor cheia, hovers que pulam para a cor errada.

**Decisão de arquitetura (recomendo forja antes de codar):** converter os `--lp-*` para HSL (conserta a classe inteira, mexe no contrato de cor da landing toda) **ou** utilities custom por ponto (cirúrgico, mas perpetua o sistema duplo). Inclui no mesmo pacote: dois verdes de "success" divergentes (`#16A34A` vs `#10B981` hardcoded), `hover:bg-brand-hover` que **não existe** (botão Aceitar da LGPD sem hover), `shadow-glow-lg` inexistente (exit popup sem sombra), e o gradiente da marca duplicado como string inline em **8 pontos**.

## ONDA 5 — Consistência visual e a11y

- `/medical` respira diferente da landing ótica sem razão: `max-w-*` vs `.container-custom` (16px vs ≥20px de gutter no mobile), `py-20` fixo vs `.section-padding` fluido, H1 em `--text-h1` vs `--text-hero` da ótica (medical parece página secundária). Igualar.
- CTAs de card do medical-pricing com 48px vs padrão 52px; exit popup usa `Button` shadcn (`rounded-md` sólido) destoando de todo CTA da landing (`rounded-xl` gradient). Alinhar.
- Login mistura `slate-*` cru com tokens shadcn no mesmo card; `/registro` tem backdrop com **roxo** (fora da paleta) e stepper `bg-green-500` cru. Migrar para tokens.
- A11y: exit popup sem `role="dialog"`/focus-trap/Esc (teclado fica preso); menu mobile sem `aria-expanded`; hover da nav via JS sem equivalente de foco; `/contato` pula h1→h3; tablist de `/precos` sem navegação por setas.

## ONDA 6 — Limpeza

- **Deletar `src/components/pages/*`**: 766 linhas de código morto (zero imports) carregando mais 24 classes quebradas.
- **Deletar `public/vis-logo.png`** (766 KB, zero referências — tudo usa a versão de 7 KB).
- Announcement bar "Novo: o Vis já está no ar" — notícia velha na faixa mais nobre. Rotacionar.
- Enxugar os 8 cortes de Google Fonts para os pesos realmente usados.
- **Restaurar `.claude/design.md`** — o contrato de design ficou órfão na branch antiga (`38db008b`) quando o trabalho foi refeito sobre produção. Cherry-pick do arquivo.

## ONDA H — Higgsfield (depende da Onda 0.2)

Propostas de assets, nesta ordem de valor: og:images por segmento (fecha 2.1/2.6 com arte real), hero visual da `/medical` (hoje é só texto), vídeo curto de demo para a home institucional.

---

## Sugestão de sequência

**Semana 1:** Onda 0 (suas ações) + Onda 1 inteira (11 correções pequenas, todas de conversão) + itens 2.2–2.5 de SEO (mecânicos).
**Semana 2:** Onda 3 (copy honesta — rápida, mas cada item merece sua confirmação) + 2.1/2.6 (og:images, idealmente já com Higgsfield).
**Semana 3:** Onda 4 (com forja para a decisão HSL vs utilities) + Onda 5.
**Contínuo:** Onda 6 na primeira janela ociosa.

## O que NÃO está neste plano (já registrado em outra frente)

ThemeProvider sem cleanup · Button global `/90` (184 arquivos) · "14 dias" hardcoded vs `trialDays` (aparece aqui só via 1.2) · dívidas do painel de design (DataTable, migração de 603 hardcoded).
