# Plano de execução — Vis Medical: paridade de gestão + acesso do cliente

**Data:** 2026-07-24
**Status:** rascunho para aprovação (aguarda decisões de escopo do dono)
**Origem:** [[unificacao-operadora-arquitetura]] (8 fases aprovadas 22/07) · [[f1-superadmin-product-aware]] · [[f2-provisionamento-medical]]

## Objetivo (nas palavras do dono)

O **Vis** é a operadora (gerencia os clientes do SaaS no super admin). O **Domus** é o sistema clínico em si. O dono quer:
1. Gerenciar os clientes **Vis Medical** no super admin com a **mesma paridade** que gerencia os **Vis Optical**.
2. Cliente novo (Vis Medical) acessa o sistema por `medical.vis.app.br`; cliente Domus antigo continua por `app.domussaude.com.br`.
3. **UM projeto Vercel só** (o do Domus) servindo os 2 domínios — sem criar segundo projeto.

## Estado atual (o que JÁ está pronto — não refazer)

Confirmado por varredura de código (2 análises):

**Gestão (super admin do Vis) — F1 entregou muito:**
- Lente de produto (VIS_APP | VIS_MEDICAL) já propagada em: Dashboard, Clientes (lista), Assinaturas, Financeiro/Faturas/Inadimplência, Relatórios, Saúde (mostra "indisponível" p/ medical), Usuários, Suporte/Tickets, e o dashboard cross-produto `/admin/grupo`.
- Ações de assinatura funcionam p/ medical E espelham no Domus: bloquear/desbloquear, cancelar, reativar, trocar plano, estender trial, trocar ciclo, cobrar/nova cobrança, editar limites.
- Criar cliente medical: seletor de produto, validação produto×plano, alocação de `domusClinicId`, validação de `tier` (fail-closed), provisionamento automático (fast-path + outbox durável), geração de convite, skip do finance ótico. **É a parte mais madura.**

**Acesso (Domus) — F2 + hoje:**
- Provisionamento automático da clínica no Domus (validado em prod: "CLINICA TESTE" ficou PROVISIONED, convite gerado).
- Página `/aceitar-convite` completa no Domus (define senha + login automático).
- Template de e-mail "Vis Medical" pronto (branded, teal, botão "Definir minha senha").
- `auth-client.ts` já tornado relativo (commit `0cae8e9`) → o mesmo bundle serve os 2 hosts no browser.
- DNS `medical.vis.app.br` já configurado (CNAME na Cloudflare).

## Gaps (o que falta — o plano)

### FASE A — Destravar o acesso do cliente medical (bloqueadores)
Sem isto, o cliente medical NÃO consegue entrar. Alto risco (toca auth de produção com PHI) → revisão Codex obrigatória.

- **A1. `trustedOrigins` no Domus** (`src/lib/auth.ts`): adicionar `medical.vis.app.br` e `app.domussaude.com.br` como origens confiáveis. Com 1 projeto Vercel, o `BETTER_AUTH_URL` é único; sem `trustedOrigins`, o login por senha vindo de `medical.vis.app.br` é rejeitado por CSRF/origin. **É o item que a decisão de 1-projeto reintroduz e que hoje NÃO existe.** Código pequeno, mas é o coração do login → Codex.
- **A2. Confirmar domínio no projeto Domus:** `medical.vis.app.br` apontando para o projeto Vercel do Domus (o `domus-saude` atual — NÃO criar outro projeto). Confirmar env `MEDICAL_APP_URL=https://medical.vis.app.br` no Vis.
- **A3. Entregar o convite ao cliente — OS DOIS (decisão do dono):** (a) ligar `MEDICAL_INVITE_EMAIL_ENABLED=true` (envio automático do e-mail "Vis Medical"); (b) exibir o `medicalInviteUrl` no detalhe do cliente no super admin para o operador copiar/reenviar. Feito junto com B2/B3.
- **A4. Corrigir vazamento "PDV Ótica" ao criar medical** (`create/route.ts:393-410` + `new-client-form.tsx`): o bloco de convite envia e-mail "Bem-vindo ao PDV Ótica" com link `/activate` (fluxo ótico) SEM guard de produto; e o form não esconde "senha admin / enviar convite por e-mail" para medical. Se o operador preenche senha, **fura o fluxo de convite** (cria user direto). Gate por produto: para medical, esconder esses campos e nunca disparar o e-mail ótico. **Importante — pode corromper o onboarding medical.**

### FASE B — Paridade de gestão no super admin (o foco do dono)

- **B1. Catálogo de Planos product-aware + `tier`** (`configuracoes/planos`): hoje a tela edita `maxUsers/maxBranches/maxProducts` (ótico), SEM seletor `platformProduct` e SEM campo `tier`. Como criar cliente medical exige `plan.tier`, **não dá para criar um plano medical pela UI hoje** — só via banco, e se o operador criar um plano medical pela tela, a criação de cliente aborta. Adicionar: seletor de produto + campo tier (clinic_full | ophthalmology | specialist) quando produto=medical. **Funcionalidade administrável nova, crítica.**
- **B2. Detalhe do cliente medical — seção "Clínica" (Domus):** hoje o detalhe é 100% ótico (Vendas, PDV, Filiais, Rede, IA, WhatsApp). Para medical, criar uma aba/seção mostrando: `domusClinicId`, estado do provisionamento (PROVISIONING / provisionada / falha), link de convite (copiar), entitlements publicados (writeAllowed, tier). E esconder/adaptar as abas óticas que não se aplicam.
- **B3. Reenviar/regenerar convite** (ação no detalhe): não existe. Uma clínica criada hoje fica sem caminho de UI para reenviar o convite. Adicionar botão.
- **B4. Gate de produto nas ações óticas:** "Acessar como empresa" (impersonar ótico) e "Re-sincronizar setup" são óticas — aparecem no cliente medical e falham/não fazem sentido. Esconder para medical.

### FASE B2 — Acesso de suporte por código de autorização (decisão do dono)
Modelo de consentimento explícito para o operador acessar a clínica no Domus (dá suporte tocando PHI só com autorização ativa do cliente). Substitui a impersonation cega. Alto valor, toca PHI + cross-system → candidata a forja própria antes de codar.
- **Domus:** aba "Suporte" no sistema da clínica onde o admin gera um **código temporário** (TTL curto, ex. 15 min, uso único). Grava o código (hash) + validade + quem gerou.
- **Vis (super admin):** no detalhe do cliente medical, campo para inserir o código. O Vis valida o código no Domus via canal HMAC; se válido, o Domus concede uma **sessão de suporte temporária** (escopo e duração limitados) e registra auditoria (operador, clínica, código, início/fim).
- **Auditoria:** log imutável de cada acesso de suporte (LGPD/CFM). O cliente vê no histórico dele quando o suporte acessou.
- Princípio: sem código do cliente, o operador NÃO acessa o PHI. O acesso é consentido, temporário e auditado.

### FASE C — Branding "Vis Medical" no Domus (F4 — polimento, não bloqueia acesso)
Por host/produto, para o cliente que entra por `medical.vis.app.br` não ver "Domus":
- **C1.** metadata/title/favicon (`layout.tsx`), tela de login (`authentication/page.tsx` — logo + rodapés "Domus Saúde"), fallbacks de sidebar/mobile-header.
- **C2.** URLs hard-coded `app.domussaude.com.br` em `online-booking-settings.tsx:27`, `tv-panel-settings.tsx:126,206`, e as que herdam `NEXT_PUBLIC_APP_URL` (logo-proxy CORS, survey).
- **C3.** Copy "ótica" no form de criar cliente medical (labels "Dados da ótica", "Administrador da Ótica").

### FASE D — Funil público medical (CONFIRMADO no escopo)
Decisão do dono: além do super admin, quer o cadastro de trial no SITE, igual ao das óticas.
- **D1.** Front-end público medical: landing "Vis Medical" + página de preços (planos medical) + formulário de registro de trial que consome `POST /api/public/register-medical` (a API já existe e está órfã). Espelhar o fluxo do trial das óticas (`/registro`), mas com branding e planos medical.
- **D2.** Branding do funil: hoje o checkout/e-mails do fluxo público dizem "PDV Ótica" (genérico). Adaptar para "Vis Medical" no caminho do trial medical.

### FASE E — Robustez (não bloqueia)
- **E1.** Reset de senha ("esqueci minha senha") no Domus para medical — não existe fluxo. Como medical não usa Google, um admin que perca a senha fica sem auto-recuperação (hoje o super admin reseta manualmente).

## Ordem recomendada
A (destravar acesso) → B (paridade gestão) → C (branding) → D/E (conforme decisão).
A e B entregam o pedido central do dono (gerenciar + cliente acessa). C/D/E são incrementais.

## Riscos e guardrails
- A1 (trustedOrigins) toca o login de TODOS os usuários do Domus (116 pacientes) → mudança pequena mas revisão Codex + teste dos 2 hosts obrigatórios; NÃO habilitar `crossSubDomainCookies` (inútil entre apex diferentes).
- Migrações: o Vis tem invariante `prisma/` — confirmar se B1 (tier no plano) exige migração e tratar pelo processo manual.
- PHI: nenhuma leitura de dado clínico vai para o Vis; branding/gestão não cruzam essa fronteira.

## Decisões do dono (tomadas 2026-07-24)
1. **Cadastro:** super admin **E** funil público de trial no site (igual às óticas). → Fase D no escopo.
2. **Convite:** os dois (e-mail automático + link visível/reenviável no super admin). → A3.
3. **Acesso de suporte:** por **código de autorização gerado pelo cliente** (consentimento explícito, auditado), não impersonation cega. → Fase B2.

## Sequenciamento em entregas

**Entrega 1 — Cliente medical consegue ENTRAR (MVP de acesso).** A1 trustedOrigins + A2 domínio/envs + A4 corrigir vazamento PDV Ótica + A3 convite (e-mail + link no admin). Resultado: cria no super admin → cliente recebe convite → entra por medical.vis.app.br → define senha → usa o Domus. **Alto risco (auth) → Codex.**

**Entrega 2 — Paridade de gestão no super admin.** B1 Planos product-aware + tier (destrava criar plano medical pela UI — crítico) · B2 aba "Clínica" no detalhe (clinicId, estado do provisionamento, entitlements, link de convite) · B3 reenviar convite · B4 esconder ações óticas que quebram.

**Entrega 3 — Acesso de suporte por código de autorização** (Fase B2 acima). Feature nova cross-system + PHI → **forja própria antes de codar.**

**Entrega 4 — Funil público de trial medical no site.** D1 landing + preços + registro consumindo a API existente · D2 branding "Vis Medical" no funil.

**Entrega 5 — Branding "Vis Medical" no Domus** (Fase C) por host.

**Entrega 6 — Reset de senha medical** (Fase E).

Entregas 1+2 cobrem o pedido central (gerenciar + acessar). 3 é a ideia do código. 4 é o trial no site. 5/6 incrementais.

## Esforço relativo (grosso, não são horas)
- Entrega 1: **pequena-média** (1 linha de auth + Codex + config + gate no create). O maior valor pelo menor esforço.
- Entrega 2: **média** (2 telas novas: planos com tier, aba Clínica; + ações). O foco de "gerenciar como ótica".
- Entrega 3: **média-grande** (feature cross-system nova, forja + Codex, toca PHI).
- Entrega 4: **média** (front-end público, a API já existe).
- Entrega 5: **pequena-média** (branding por host, mecânico).
- Entrega 6: **pequena**.
