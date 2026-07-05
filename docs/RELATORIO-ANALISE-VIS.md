# Relatório de Análise Profissional — Site VIS (vis.app.br)

**Data:** 04/07/2026
**Método:** navegação real no site (desktop 1440px + emulação de celular 390px), medição de performance no Chrome DevTools (Core Web Vitals) e leitura completa do código do site no repositório. **Nenhuma linha de código foi alterada.**

---

## 1. Resumo executivo

O site do VIS está **acima da média do setor de sistemas para ótica**: copy excelente na língua do dono de ótica, preço transparente (raríssimo no mercado), fluxo de teste grátis sem cartão e visual moderno e limpo. A base é muito boa — o problema não é refazer, é **consertar 4 falhas que sabotam a venda hoje**: (1) o botão "Falar com consultor" aponta para um **número de WhatsApp falso/placeholder**; (2) **não existe nenhuma prova social** (zero depoimentos, zero números de clientes); (3) o conteúdo da página **nasce invisível e depende do JavaScript carregar** — em celular/conexão lenta o visitante encara uma tela em branco por vários segundos; (4) no celular, o **menu fica escondido** atrás do banner de anúncio e o botão de WhatsApp **tapa o botão "Rejeitar" dos cookies**. Corrigindo isso, o VIS tem tudo para parecer (e ser) "de outro nível" frente aos concorrentes de site datado.

**Nota geral: 72/100** — fundação forte, derrubada por bugs de conversão e ausência de prova social.

---

## 2. Notas por categoria

| # | Categoria | Nota | Comentário curto |
|---|-----------|------|------------------|
| 1 | Primeira impressão | **72** | Headline forte ("A gestão clara da sua ótica."), mas o "print" do sistema é um mockup desenhado em CSS, não o produto real — e o hero pode aparecer em branco (ver 🔴 C3). |
| 2 | Tipografia | **78** | Plus Jakarta Sans com hierarquia fluida bem feita. Limpa e legível, mas é uma família só para tudo — falta um toque de personalidade no display. |
| 3 | Paleta e identidade | **70** | Landing tem identidade consistente (navy #0A1F44 + azul #2E6BFF + ciano #22C3E6). Porém o **app logado usa verde-teal** — na tela de registro os dois sistemas se misturam (passos em teal, botão em azul). |
| 4 | Hierarquia e estrutura | **85** | Narrativa exemplar: problema → para quem → funcionalidades → diferencial (lente) → segurança → confiança → como funciona → calculadora ROI → preço → FAQ → CTA. Bate o olho e entende. |
| 5 | Clareza da oferta | **90** | Copy na língua do lojista: "Quando o cliente liga perguntando da lente, você responde na hora", "sem montar planilha de madrugada". Excelente. |
| 6 | Prova social | **35** | **Não existe.** Nenhum depoimento, nome, foto, contagem de óticas, logo de cliente ou avaliação do Google. A seção "Confiança que se verifica" é honesta e bem escrita, mas lista atributos do produto — não substitui gente de verdade dizendo que usa. |
| 7 | Preço | **80** | R$ 149,90/mês na tela, toggle anual −17%, "sem fidelidade, sem taxa de implantação" — **a maior brecha contra o líder de mercado, bem explorada**. Perde pontos porque 3 dos 4 planos estão "Em breve" com colunas quase vazias (passa sensação de produto incompleto). |
| 8 | CTA | **65** | "Começar grátis" → cadastro self-service em 3 passos, sem cartão: ótimo. **Mas "Falar com consultor" (e o botão flutuante) apontam para número de WhatsApp placeholder — lead que clica ali morre.** |
| 9 | Mobile | **60** | Layout responsivo bom e legível, mas: logo+menu escondidos atrás do banner de anúncio de 2 linhas no topo; banner de cookies ocupa ~30% da tela; botão verde de WhatsApp sobrepõe o "Rejeitar". |
| 10 | Performance | **80** | Medido: LCP 1,7s, CLS 0,00, ~548 KB transferidos (438 KB de JS). Muito bom para o padrão do setor. O risco: 81% do LCP é "render delay" — a página depende do JS hidratar para mostrar conteúdo. |
| 11 | Microinterações | **70** | Hovers, glass no header, animações spring — polido. Porém as animações de entrada são lentas: rolando rápido, seções inteiras aparecem em branco por ~1s; e os contadores exibem "0%" e "<0h" antes de animar (vi "0% na nuvem" na tela — o certo seria 100%). |
| 12 | Acessibilidade | **68** | `prefers-reduced-motion` respeitado (raro, parabéns), contraste do texto principal bom. Contra: conteúdo invisível sem JS, botão flutuante cobrindo controles, cinza claro #94A3B8 em textos pequenos beira o limite de contraste. |
| 13 | Copy | **92** | A melhor categoria. Específica, voz ativa, zero promessa vazia ("Sem números inflados nem promessas vazias"). FAQ responde exatamente o que dono de ótica pergunta. |

---

## 3. O que já está bom (manter e proteger)

1. **Copy e posicionamento** — todo o texto fala de OS de lente, laboratório, caixa, DRE, bloquinho. Nenhum concorrente comunica tão bem. Não deixar ninguém "genericar" esse texto.
2. **Preço transparente + sem fidelidade** — é a cunha competitiva certa contra o líder (que esconde preço e prende em contrato de 12 meses). Está bem sinalizado em 4 lugares da página.
3. **Autoatendimento real** — `/registro` com wizard de 3 passos, sem cartão, trial claro. A maioria do mercado obriga "falar com consultor".
4. **Estrutura da landing** — a ordem das 13 seções está profissional; a calculadora de ROI interativa é um diferencial que quase ninguém tem.
5. **Seção "a lente"** — tratar a OS de lente como o diferencial nº 1 é a decisão de marketing certa; a menção a Essilor/Hoya/Zeiss dá contexto de mercado.
6. **Fundação técnica** — SEO caprichado (JSON-LD de Organization/SoftwareApplication/FAQ, sitemap, robots, OG image dinâmica, llms.txt), preços dinâmicos vindos do banco (nunca desatualizam), PostHog com funil tipado, Sentry, CLS zero.
7. **Segurança/LGPD como argumento** — seção dedicada + Livro de Receitas Digital (Decreto 24.492/1934) + certificado A1/A3. Receita é dado de saúde; isso gera confiança e ninguém do setor comunica.

---

## 4. Problemas encontrados (priorizados)

### 🔴 Críticos — atrapalham venda/confiança HOJE

**C1. WhatsApp placeholder engole leads.**
`src/lib/constants.ts` → `WHATSAPP_NUMBER = "5585999999999"` (comentário no código: "Trocar pelo número real"). Afeta: botão "Falar com consultor" do hero e do CTA final, o botão flutuante verde presente em TODAS as páginas, o CTA do plano Rede e o link do rodapé. **Qualquer lead que prefira conversar antes de se cadastrar cai num número inexistente.** É a correção de maior retorno de todo este relatório (1 linha).

**C2. Zero prova social.**
Não há um único depoimento, nome de ótica, foto, número de clientes ou avaliação. Para um dono de ótica desconfiado (que já ouviu promessa de todo vendedor de sistema), isso é o que falta para acreditar. Os líderes do setor abrem o site com "X mil óticas atendidas" e depoimentos com nome e cidade. Enquanto não houver volume: usar depoimentos dos primeiros usuários reais (ex.: a ótica que já usa em produção), com nome, cidade e foto — 2 ou 3 já mudam o jogo. Nunca inventar.

**C3. Conteúdo nasce invisível e espera o JavaScript.**
Todas as seções (inclusive o hero) usam animação de entrada do framer-motion partindo de opacity 0. Em duas visitas de primeira carga eu vi **a página em branco por mais de 7 segundos** (só header e fundo), até interagir. Com cache quente renderiza na hora — ou seja, quem sofre é exatamente o visitante novo em 4G/celular modesto, que é o seu comprador. A medição confirma: 81% do LCP (1,36s de 1,68s) é "render delay", não rede. Correção de padrão: conteúdo visível por default no HTML (SSR) e animação só como aprimoramento progressivo (ex.: animar apenas transform, nunca esconder com opacity inicial 0 sem fallback).

**C4. Mobile: menu inacessível e botões sobrepostos.**
- No topo da página, o header fixo (logo + hambúrguer) fica **atrás do banner de anúncio** de 2 linhas ("Novo: o Vis já está no ar…"). Verificado no DOM: na posição do logo, o elemento clicável é o banner. O menu só aparece depois de rolar.
- O banner de cookies ocupa ~30% da tela do celular e o **botão flutuante de WhatsApp cobre o botão "Rejeitar"** (no desktop também). Além de irritar, recusar cookies ficar difícil é problema de LGPD.

### 🟡 Importantes — melhoram bastante

**I1. Hero mostra um desenho, não o produto.**
O "print" do dashboard é um mockup HTML/CSS com dados fake (BrowserFrame com barra de URL falsa). O produto real existe e é bonito — os líderes do setor mostram o sistema de verdade. Um print real (ou GIF/vídeo de 20s: venda de lente → OS criada sozinha → status no Kanban) converte mais e é honesto. O mockup CSS foi uma boa solução provisória, mas hoje é teto de conversão.

**I2. Identidade visual dividida (azul × teal).**
Landing: azul #2E6BFF/ciano. App logado: verde-teal (`--primary: 172 60% 32%`). Na tela de registro os dois se encontram: indicador de passos e focus em teal, botão "Próximo" em azul. O cliente percebe (mesmo sem saber explicar) que "o site é um e o sistema é outro". Decidir UMA cor de marca e migrar gradualmente.

**I3. Preços: 3 de 4 planos "Em breve" com colunas vazias.**
O card Básico tem 14 bullets; os outros três são colunas praticamente em branco com "Quero ser avisado". Visualmente desequilibrado e passa "produto incompleto". Sugestão: cards "Em breve" compactos (metade da altura, empilhados) ou uma linha "roadmap" separada, dando protagonismo ao Básico + Básico NF.

**I4. Página de login abandona o visitante.**
`/login` não tem "Esqueci minha senha" nem link "Criar conta grátis". Quem chega ali por engano (ou lembra do site mas não tem conta) fica sem saída. E "Limpar Sessão Anterior" é jargão técnico exposto ao usuário final.

**I5. Links legais quebrados no cadastro.**
No rodapé do `/registro`, "Termos de Uso" e "Política de Privacidade" apontam para `href="#"` (as páginas `/termos` e `/privacidade` existem!). Num passo em que a pessoa está entregando dados, link quebrado corrói confiança — e é ruim para LGPD.

**I6. Contadores exibem valores sem sentido.**
A seção "Feito para durar" anima números a partir do zero: na tela aparecem "**0%** na nuvem" e "**<0h** suporte" até a animação rodar (capturei os dois na tela; deveriam ser "100%" e "<2h"). Quem rola rápido, copia o texto ou usa leitor de tela vê os valores errados. Além disso, "número gigante + rótulo pequeno + gradiente" é exatamente o padrão-clichê a evitar — essas 4 métricas seriam mais fortes como frases curtas com ícone.

**I7. Emissão de NF-e é obrigatória no mercado e está "Em breve".**
O plano "Básico + NF" (R$ 189,90) só coleta interesse. Concorrentes tratam NFC-e/NF-e como recurso básico. Enquanto não lançar: dar visibilidade de roadmap ("previsto para [mês]") — silêncio gera desconfiança de vaporware. (Nota: medição pupilar por foto, comum nos líderes, também não aparece — só mencionar quando existir; o OCR de receita por IA já é um contra-argumento bom e exclusivo.)

**I8. Animações de scroll lentas demais.**
Rolando em velocidade normal, várias seções aparecem como área em branco por ~1s antes do fade-in (registrei isso em 4 seções diferentes). Reduzir duração/threshold (entrar ~50-100ms após 10-15% visível) mantém o charme sem esconder conteúdo.

### 🟢 Refinamentos — polimento

**R1.** `public/vis-logo.png` tem **766 KB** no repositório para um logo de 90×30px (o next/image serve otimizado, mas o source merece virar SVG).
**R2.** Exit-intent popup fala "7 dias grátis" hardcoded enquanto o resto do site usa `trialDays` dinâmico do backend — risco de divergência.
**R3.** Banner de anúncio: encurtar o texto para caber em 1 linha no mobile (resolve metade do C4).
**R4.** O botão flutuante de chat é verde-WhatsApp — ok por reconhecimento, mas avaliar deslocá-lo para não conflitar com banners (ligado ao C4).
**R5.** O CTA da calculadora ROI é verde-escuro, único elemento dessa cor na página — alinhar ao azul de marca (a proposta de design da §7 reserva o papel de "elemento-assinatura" para o hero, e o verde para valores de dinheiro).
**R6.** DevTools apontou DOM grande como insight de performance — consequência dos mockups CSS; resolve-se junto com I1.
**R7.** Placeholder do login diz "Seu login" — se é e-mail, dizer "seu@email.com" (consistência com o cadastro).

---

## 5. Benchmark — o que os melhores fazem e onde o VIS está

| Padrão profissional do setor | Líderes | VIS hoje |
|---|---|---|
| Print/vídeo REAL do sistema no hero | ✅ | ⚠️ Mockup CSS bonito, mas fake |
| Funcionalidade descrita como benefício do lojista | ⚠️ (metade fala "módulos") | ✅ **Melhor que os líderes** |
| NF-e/NFC-e | ✅ básico do mercado | ⚠️ "Em breve" |
| Integração com laboratório | ✅ | ✅ Seção dedicada + marcas |
| Medição pupilar pela foto | ✅ vários têm | ❌ Não mencionado |
| Prova social (nº de óticas, depoimentos, Google) | ✅ forte | ❌ **Zero — maior gap** |
| Preço na tela | ❌ escondem, contrato 12m | ✅ **Maior vantagem do VIS** |
| Sem fidelidade / sem adesão | ❌ | ✅ Bem explorado |
| IA (OCR de receita, relatórios) | ❌ quase ninguém | ✅ Exclusivo — pode gritar mais |
| Teste grátis self-service | ⚠️ maioria exige consultor | ✅ |
| Site rápido/moderno | ❌ sites datados | ✅ (após corrigir C3) |
| LGPD/segurança comunicada | ❌ raro | ✅ Seção dedicada |

**Leitura estratégica:** o VIS já venceu nas brechas certas (preço, fidelidade, IA, UX). O que falta é o básico que os líderes têm de sobra: **prova social e produto de verdade na tela**. É correção de gap, não reinvenção.

---

## 6. Recomendações detalhadas (as 5 que mais mudam resultado)

1. **Trocar o número de WhatsApp (C1).** Uma constante. Cada dia com o placeholder é lead queimado no canal preferido do dono de ótica brasileiro.

2. **Colocar 2-3 depoimentos reais + um número honesto (C2).** Ex.: foto, nome, cidade e uma frase concreta ("Hoje sei em que laboratório está cada lente — Fulana, Ótica X, Fortaleza/CE"). Posição: logo após "Problemas que resolvemos". Complementar com o selo "óticas usando desde 2026" quando o número for apresentável. O tom "confiança que se verifica" continua — depoimento real É verificável.

3. **Conteúdo visível sem depender de JS (C3).** Regra: o HTML que chega do servidor já mostra tudo; animação só embeleza. No framer-motion, evitar `initial={{opacity: 0}}` em conteúdo above-the-fold (ou usar `whileInView` com fallback CSS `no-js`). Ganho direto no LCP (de 1,7s para ~0,8s potencial) e elimina a tela branca em 4G.

4. **Print/vídeo real do produto no hero (I1).** Print da dashboard real (dados demo), tratado (moldura, sombra, fundo). Segunda etapa: GIF/vídeo mudo de 15-20s do fluxo "venda de lente → OS automática → Kanban". É o que transforma "promessa" em "quero isso".

5. **Arrumar a casa mobile (C4 + R3).** Banner de anúncio de 1 linha; header sempre acima dele (z-index/offset); banner de cookies compacto (barra fina); FAB do WhatsApp com offset quando houver banner ativo. O público-alvo navega à noite, do celular.

---

## 7. Direção de design (proposta — no papel, nada implementado)

### 7.1 Diagnóstico estético em uma frase

O site é **"SaaS azul competente"**: limpo, moderno, bem executado — mas intercambiável. Trocando o logo, poderia ser um sistema de academia ou de clínica. A boa notícia: ele **não** caiu nos clichês de site gerado por IA (nada de fundo creme + serifada + terracota, nada de layout de jornal). O único clichê presente é o de "números gigantes com gradiente" na seção Feito para durar. O que falta não é reforma — é **uma camada de identidade própria** sobre a base que já existe.

### 7.2 Conceito: "Clareza óptica"

O VIS já tem o conceito dado de graça e não está usando: **o produto se chama Vis (visão), o slogan é "a gestão CLARA da sua ótica" e o cliente vive de lentes e foco.** A direção proposta é fazer o design *encenar* esse conceito — clareza, foco, nitidez — sem nunca ser literal/brega (nada de óculos desenhado no fundo):

- **Metáfora central:** desfocado → em foco. O que o Vis faz com a gestão da ótica é o que uma lente faz com a visão.
- **Tradução visual:** interface quieta e nítida, com UM momento de "foco óptico" como assinatura (abaixo, 7.5). Todo o resto ganha disciplina, não enfeite.

### 7.3 Cor — resolver o conflito azul × teal (decisão de marca)

Hoje existem duas identidades: landing em azul `#2E6BFF` + ciano `#22C3E6`, app logado em verde-teal (`hsl(172 60% 32%)`, herança do tema shadcn). Proposta:

| Papel | Cor | Uso |
|---|---|---|
| **Marca (única)** | Azul `#2E6BFF` | CTAs, links, marca — site E app |
| Acento | Ciano `#22C3E6` | Só no gradiente de marca e detalhes pontuais |
| Tinta | Navy `#0A1F44` | Títulos e texto forte (já é assim) |
| Semânticas | Verde sucesso / âmbar alerta / vermelho erro | Estados, dinheiro, avisos — nunca como "cor da marca" |

**Por que o azul vence o teal:** a landing já consolidou o azul em todo o material público (site, OG image, `themeColor`), e o teal do app nunca foi uma decisão de marca — foi o default do template. Migração do app pode ser gradual (tokens `--primary` num PR só de tema, telas continuam idênticas). Resultado: quem sai do site e entra no sistema sente que é a mesma empresa.

### 7.4 Tipografia — corpo fica, display ganha personalidade

- **Corpo: manter Plus Jakarta Sans** (400–600). Já carregada, legível, ótima em números e formulários.
- **Display (novo): uma segunda família SÓ para H1/H2 da landing.** Sugestão principal: **Bricolage Grotesque** (Google Fonts, grátis, suporta pt-BR) em SemiBold com tracking −2% — tem personalidade humanista sem cair no clichê editorial serifado. Alternativa mais técnica: Space Grotesk. Custo: +1 arquivo woff2 (~25 KB) via `next/font`, zero impacto de layout se os `clamp()` atuais forem mantidos.
- **Números tabulares** (`font-feature-settings: "tnum"`) nos KPIs do mockup/produto — números que não "dançam" passam precisão financeira.
- Regra de contenção: a fonte display **não entra no app logado** (lá a densidade manda) nem em botões/labels.

### 7.5 Elemento-assinatura — ousar em UM lugar só

**Proposta: o "momento de foco" no hero.** A headline "A gestão clara da sua ótica." entra levemente desfocada (blur 4–6px) e **foca em ~400ms**, terminando com a palavra "clara" no gradiente atual. Uma vez só, sem loop.

- É a metáfora do produto inteiro em meio segundo, no primeiro contato.
- Regras duras (aprendidas no C3): o texto nasce **visível e nítido no HTML do servidor** — o desfoque é aplicado e removido só quando o JS carrega (aprimoramento progressivo); `prefers-reduced-motion` pula direto para o estado final. Nunca opacity 0.
- Versão estática de fallback (se preferirem zero movimento): um traço de "lente" sutil — círculo de contorno fino atravessando a palavra "clara", ecoando as duas elipses do logo.
- **Contrapartida:** adotando essa assinatura, o resto da página fica mais quieto (7.6). Um só gesto ousado.

### 7.6 Refinamentos por seção (antes → depois)

| Seção | Hoje | Proposta |
|---|---|---|
| Hero | Mockup CSS fake; badge + título + CTAs ok | Print real (I1) + momento de foco (7.5). Nada mais muda |
| Problemas que resolvemos | 3 cards iguais | Manter; apenas unificar raio/sombra com o resto (`rounded-2xl`, sombra `card`) |
| Feito para durar | 4 números gigantes com gradiente (clichê + bug do "0%") | Virar **1 linha de fatos**: 4 frases curtas com ícone ("Funciona 100% na nuvem", "Suporte humano em menos de 2h"…), sem contador animado |
| Como funciona | 01/02/03 | **Manter numeração** — aqui É uma sequência real (regra respeitada) |
| Calculadora ROI | Ótima; CTA verde-escuro isolado | Manter a calculadora como está; CTA muda para o azul de marca (o verde fica reservado para valores de dinheiro dentro do cálculo) |
| Preços | Básico com 14 bullets × 3 colunas vazias | Básico protagonista com 8 bullets + "ver lista completa" expansível; planos "Em breve" viram cards compactos de meia altura |
| CTA final | Gradiente + ruído, ok | Manter — já é o segundo momento mais expressivo, e pode continuar sendo o único além do hero |
| Ritmo vertical | Gaps brancos irregulares entre seções (piorado pelas animações lentas) | Padronizar respiro entre seções (ex.: 96px mobile / 128px desktop) e alternância de fundo branco ↔ `#F5F7FA` consistente |

### 7.7 Movimento — regras da casa

1. Entrada de seção: máx **300ms**, deslocamento máx 16px, dispara com 10–15% visível; stagger entre cards máx 60ms.
2. **Nunca** esconder conteúdo com opacity 0 esperando JS (regra do C3 — vale para qualquer animação futura).
3. Animar o contêiner da seção, não cada card individualmente (menos trabalho do navegador, menos "efeito dominó").
4. Estados de foco de teclado visíveis e consistentes: anel azul 2px em tudo que é clicável (hoje varia).
5. `prefers-reduced-motion` continua zerando tudo (já feito — manter como cláusula pétrea).

### 7.8 Guard-rails anti-clichê (checklist permanente)

Para qualquer mudança futura de design, recusar se: fundo creme + serifada + terracota ▪ layout de jornal com linhas finas ▪ número gigante + rótulo pequeno + gradiente decorativo ▪ marcadores 01/02/03 sem sequência real ▪ segundo "elemento ousado" na mesma página ▪ enfeite sem função nomeável ▪ cards dentro de cards.

---

## 8. Plano de execução em fases

### Fase 1 — "Estancar o sangramento" (1-2 dias de trabalho, retorno imediato)
| Item | Esforço | Impacto |
|---|---|---|
| Trocar `WHATSAPP_NUMBER` pelo número real (C1) | Baixo (1 linha) | 🔥 Altíssimo |
| Corrigir links `href="#"` de Termos/Privacidade no registro (I5) | Baixo | Alto (confiança/LGPD) |
| Contadores sem estado "0%"/"<0h" — iniciar no valor final e animar só o excedente (I6) | Baixo | Médio |
| "Esqueci minha senha" + "Criar conta grátis" no /login; remover "Limpar Sessão Anterior" da vista (I4) | Baixo | Médio |
| Banner de anúncio 1 linha + header visível no mobile (C4a) | Baixo | Alto |
| Cookie banner compacto + FAB sem sobreposição (C4b) | Baixo | Alto |

### Fase 2 — "Converter mais" (1-2 semanas)
| Item | Esforço | Impacto |
|---|---|---|
| Depoimentos reais + número honesto de óticas (C2) | Médio (depende de coletar) | 🔥 Altíssimo |
| Conteúdo SSR-visível; animação como enhancement (C3) | Médio | Alto |
| Print real do produto no hero no lugar do mockup CSS (I1) | Médio | Alto |
| Animações de scroll mais rápidas (I8) | Baixo | Médio |
| Reequilibrar seção de preços (cards "Em breve" compactos) (I3) | Médio | Médio |
| Reformular "Feito para durar" de números-gigantes para "linha de fatos" (I6b + §7.6) | Baixo | Médio |
| Fonte display nos H1/H2 da landing (Bricolage Grotesque) (§7.4) | Baixo | Médio (identidade) |
| Regras de movimento aplicadas (300ms, sem opacity 0, focus ring) (§7.7) | Baixo | Médio |

### Fase 3 — "Marca de outro nível" (contínuo)
| Item | Esforço | Impacto |
|---|---|---|
| Unificar identidade azul × teal (uma cor de marca em site + app) (I2 + §7.3) | Alto | Alto (longo prazo) |
| Elemento-assinatura "momento de foco" no hero (§7.5) | Médio | Alto (marca memorável) |
| Ritmo vertical padronizado + alternância de fundos (§7.6) | Médio | Médio |
| Vídeo/GIF do fluxo venda→OS→Kanban no hero | Médio | Alto |
| Roadmap público de NF-e com data + coleta de interesse (I7) | Baixo | Médio |
| Conteúdo no blog (SEO "sistema para ótica" etc.) usando as páginas /funcionalidades/[slug] já existentes | Alto | Alto (composto) |
| Google Reviews / avaliações quando houver base | Médio | Alto |
| Refinos: logo SVG (R1), trial dinâmico no exit-popup (R2), placeholder do login (R7) | Baixo | Baixo |

---

## 9. Próximos passos (aguardando sua aprovação)

Minha recomendação de ordem, se você aprovar:

1. **Hoje:** Fase 1 inteira — são 6 correções pequenas, quase todas de 1 arquivo, e duas delas (WhatsApp e mobile) estão custando lead todos os dias. *Única informação que preciso de você: o número de WhatsApp comercial real.*
2. **Esta semana:** começar a Fase 2 pelo item de maior alavanca que não depende de terceiros: conteúdo SSR-visível (C3) + print real no hero (I1).
3. **Em paralelo (só você pode):** coletar 2-3 depoimentos de usuários reais (frase + nome + cidade + foto) para destravar o C2, que é o maior gap contra os concorrentes.

**Nada foi alterado no código.** Este relatório é o único arquivo criado. Aguardo seu OK para executar qualquer fase (ou itens avulsos).

---

*Evidências citadas: screenshots de navegação em desktop 1440px e mobile emulado 390px (hero, seções, preços, FAQ, rodapé, /precos, /login, /registro); trace de performance Chrome DevTools (LCP 1.686ms, TTFB 323ms, render delay 1.364ms = 81%, CLS 0,00; ~548 KB transferidos, 438 KB JS); inspeção de DOM no mobile (header sob o announcement bar); e leitura do código em `src/app/(landing)/`, `src/components/home/`, `src/components/landing-layout/`, `src/lib/constants.ts`, `src/app/globals.css`, `tailwind.config.js`.*
