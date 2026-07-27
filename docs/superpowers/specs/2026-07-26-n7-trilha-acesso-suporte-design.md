# N7 — Trilha de acesso de suporte no super admin do Vis

**Data:** 2026-07-26
**Status:** aprovado pelo dono (design), aguardando plano de implementação
**Entrega:** 7 (Operacional) do plano Vis Medical — N1 ✅, N2 ✅ (commit `5a9a252f`), **N7 = esta spec**
**Origem:** painel adversarial da forja (3 criativos × 3 críticos) + verificação no código

---

## 1. O problema

O acesso de suporte por código está em produção. O cliente autoriza, o operador do Vis
resgata e recebe uma sessão somente-leitura de 60 minutos, escopada e auditada. A trilha
imutável desse ciclo (`support_audit`, no Domus) é o artefato de consentimento da LGPD, e o
**cliente já a vê** na tela dele.

O **operador não vê**. O card de resgate no super admin (`company-support-access.tsx:87`)
apenas *menciona* que "fica registrado na trilha". A assimetria é o problema: o cliente sabe
mais sobre os acessos à clínica dele do que a empresa que os realizou.

**Escopo (decisão do dono):** trilha **da clínica**, no detalhe daquele cliente. Não é tela
global cross-tenant.

### 1.1 Por que não é só "renderizar uma lista"

Não existe leitura máquina-a-máquina do Vis para o Domus. Os três canais internos
(`/provision`, `/entitlements`, `/support/redeem`) são **todos POST de comando**. O único GET
interno do ecossistema vai na direção oposta (Domus→Vis) e usa Bearer estático — mecanismo
mais fraco, na direção errada. Este é o primeiro canal de leitura Vis→Domus, e ele lê de um
banco com PHI.

---

## 2. Decisões e o que as sustenta

Cada linha abaixo foi verificada no código, não inferida.

| Decisão | Por quê |
|---|---|
| **GET**, não POST | `canonical()` em `vis-provision-hmac.ts:8` é `version.method.path.nonce.ts.body`. `method` é campo assinado e o body de um GET é string vazia — assina e verifica com a primitiva **existente, testada, sem alteração**. A proposta original de "POST que lê" resolvia uma restrição inexistente. |
| `clinicId` em **header assinado**, não em querystring | O verificador recebe `path` como argumento e as rotas passam uma **constante de módulo** (`redeem/route.ts:28`) — nunca derivam de `req.url`. Assinar querystring exigiria reconstruir path+query no verificador, abrindo canonicalização (ordem de parâmetros, encoding, chaves duplicadas) que hoje não existe, e mudaria a chave `(nonce, path)` do anti-replay. Header assinado liga o tenant à requisição sem inventar normalização. |
| **Sem `consumeNonce`** | Anti-replay protege comando não-idempotente. Reexecutar uma leitura não concede nada. Mantê-lo faria **cada visualização gravar linha durável** em `vis_hmac_nonces` (banco com PHI) e transformaria retry de rede em `401 replay_detected` na tela usada durante incidente. |
| **Sem migração** | Promover `supportGrantId` a coluna foi rejeitado: o precedente citado (`GlobalAudit.planChangeOpId`) existe para carregar uma **constraint UNIQUE parcial** — garantia de integridade inexprimível sobre caminho JSON. Aqui haveria só lookup, sobre 16 linhas. Sem a constraint, o precedente não se aplica. |
| **Limite fixo, sem cursor** | Paginação por chave é **incorreta** aqui: `code_redeemed` (`support-redeem.ts:141`) e `token_issued` (`support-activate.ts:131`) são gravados na **mesma transação**, e `DEFAULT now()` é `transaction_timestamp()` — `created_at` byte-idêntico, garantido. `id` é uuid v4, não desempata cronologicamente. `<` perde linha, `<=` duplica. |
| **Allowlist de campos** | `details` é jsonb sem schema e `event` é `text` **sem CHECK constraint**. Whitelist por chave garante que campo novo fique de fora **por padrão** em vez de vazar por acidente. |
| **Nunca `actor_user_id`** | É identidade de funcionário **da clínica** em `code_generated` e nas revogações. O operador não tem o que fazer com ela. |
| **Nunca `ipAddress`/`userAgent`** | Verificado: são do **operador** (vêm do browser dele, `support-activate.ts:202-204`), não do paciente. Mas são dado pessoal de funcionário sem consumidor nesta tela; importá-los criaria superfície nova de PII no sistema que é PHI-free por desenho. |

---

## 3. Arquitetura

```
Vis (super admin)                          Domus (fonte da verdade)
─────────────────                          ────────────────────────
company-support-trail.tsx  ──clique──►  GET /api/internal/vis/support/audit
  (card, sob demanda)                        │  flag → janela de tempo → HMAC
        │                                    │  → guarda de host → projeção
        ▼                                    ▼
support-trail.service.ts                 listSupportAudit(clinicId, limit)  [JÁ EXISTE]
  junta em memória                           │
        │◄───────── projeção allowlist ──────┘
        ▼
  GlobalAudit (Prisma)  ← as recusas que o Domus não conhece
```

Nada é replicado. O Domus permanece fonte única; cópia de trilha imutável diverge em silêncio
e criaria segundo relógio de retenção e segunda obrigação de deleção sob LGPD.

### 3.1 Endpoint no Domus

`GET /api/internal/vis/support/audit`

Ordem das guardas — **a mesma do resgate**, que é o padrão maduro do repo:

1. Feature flag (`isSupportAccessEnabled`) → 503 sem efeito colateral
2. Validade do timestamp (`isValidHmacTimestamp`) → mata o bypass por `NaN`
3. HMAC path-bound (`verifyVisProvision`, segredo `VIS_DOMUS_SUPPORT_SECRET`) → 401
4. Guarda de host de banco (`isDbHostAllowed`) → 403
5. Validação do `clinicId` (uuid) → 400

O `clinicId` ser validado **por último** é intencional, não descuido: ele viaja num header
**assinado**, então no passo 3 já está autenticado — só chega aqui o que o Vis assinou. Validar
formato antes do HMAC daria resposta a quem não provou posse do segredo.

**Sem** `consumeNonce` e **sem** rate limit por clínica (a justificativa de ambos é
não-idempotência; ver §2). Leitura é `listSupportAudit(clinicId, LIMIT)`, já existente.

**`LIMIT = 200`, e o truncamento é VISÍVEL.** O Domus pede 201 linhas e devolve no máximo 200
mais um booleano `truncated`. Um número fixo sem sinal seria um defeito de correção, não de
interface: numa trilha de consentimento, uma lista cortada em silêncio leva o operador a
concluir que um acesso **não aconteceu**. Quando `truncated` é verdadeiro a tela diz que está
mostrando os 200 eventos mais recentes e que há mais história — é o quarto estado da tabela em
§3.4. 200 é folgado para o volume real (16 eventos hoje, ~7 por ciclo de acesso) e continua
sendo uma resposta pequena; se um dia apertar, a saída é cursor — que hoje seria **incorreto**
pelo motivo do §2, não apenas prematuro.

### 3.2 Projeção — o contrato de fronteira

Vive em `src/lib/support-audit-projection.ts` (Domus), ao lado da tabela que projeta.

**Sai:** `id`, `event`, `createdAt`, `grantId`, `visOperatorRef`
**De `details`, só:** `reason`, `expiresAt`
**Nunca sai:** `actorUserId`, `codeId`, `ipAddress`, `userAgent`, `details` cru, qualquer chave
não listada.

Implementação por allowlist explícita — jamais por deleção de campos indesejados, que falha
aberto quando alguém adiciona um campo novo.

`grantId` vem **null** em `code_generated` (o acesso ainda não existia; a linha é identificada
por `event` + `createdAt`). Isso é correto, não defeito de projeção — e é justamente por isso
que a lista não pode ser agrupada estritamente por acesso (§3.3).

#### Como o operador é exibido — `visOperatorRef` NÃO é o nome

`visOperatorRef` é `vis-op-<32 hex>`: um HMAC do id do admin sob `VIS_DOMUS_SUPPORT_SECRET`
(`support-redeem/route.ts:242-259`), opaco **de propósito**, porque é o que o cliente vê na tela
dele. Renderizar isso cru para o operador não serve a ninguém.

**A resolução acontece no Vis, por junção local:** o nome sai de `GlobalAudit`, que já grava
`actorId` (FK para `AdminUser`) e `metadata.adminEmail` **em texto claro**, correlacionado por
`supportGrantId`. Ou seja: `grantId` do evento → linha do `GlobalAudit` → operador real.

⛔ **NÃO recomputar o HMAC de todos os `AdminUser` para montar um mapa reverso.** Foi
explicitamente rejeitado no painel (§9): materializaria uma tabela pseudônimo→nome+e-mail de
toda a equipe, numa página cujo gate é frouxo. A junção local já dá o mesmo resultado sem
construir esse artefato.

Consequência aceita: eventos **sem** `grantId` (o `code_generated`, que é ato do cliente e não
do operador) não têm operador a exibir — e não deveriam ter. Eventos com `grantId` que não
casem com nenhuma linha do `GlobalAudit` (resgate feito antes desta feature, ou trilha do Domus
sem contraparte local) exibem o ref opaco como fallback, nunca em branco.

⚠️ **Sentido inverso, e não é o mesmo caso:** as linhas `SUPPORT_ACCESS_DENIED` do Vis carregam
um `supportGrantId` que **nunca chegou ao Domus** — o resgate foi recusado antes de o grant
existir (`support-redeem/route.ts:127-134`). Elas não são "trilha do Domus sem contraparte
local"; são o oposto, e são justamente o que o Domus não pode saber. Entram na lista pela origem
`vis`, com o operador já resolvido localmente, e **não** devem ser tratadas como junção órfã.

### 3.3 Junção no Vis

`src/services/support-trail.service.ts`, função pura com a chamada ao Domus injetada.

Entram: a projeção do Domus e as linhas de `GlobalAudit` da empresa filtradas por
`SUPPORT_ACCESS_GRANTED | SUPPORT_ACCESS_DENIED | SUPPORT_ACCESS_STUCK`. Cada item de saída
carrega sua **origem** (`medical` | `vis`), exibida na tela — os dois lados têm autoridades
diferentes.

**Ordenação — a restrição dos dois relógios.** Vis e Domus são deployments independentes com
relógios independentes; a própria camada HMAC tolera ±5 minutos. Ordenar estritamente por
timestamp poderia **inverter causa e efeito** (sessão ativada antes do código resgatado).
Portanto:

- Agrupamento **por dia**; dentro do dia, por horário.
- Nenhuma promessa de precisão de segundos **entre origens diferentes**.
- Eventos do mesmo `grantId` ficam encadeados na **ordem lógica do ciclo** (tabela abaixo),
  não na ordem deduzida do horário.

**Ordem lógica do ciclo — a tabela é normativa** (é o único desempate possível quando
`created_at` é idêntico, o que acontece **sempre** entre `code_redeemed` e `token_issued`):

| Rank | Evento | Observação |
|---|---|---|
| 1 | `code_generated` | Consentimento do cliente. **Sem `grantId`** — não entra em nenhuma cadeia; ancora pelo horário. |
| 2 | `code_redeemed` | Mesma transação do rank 3. |
| 3 | `token_issued` | **Reemissível**: é o único que de fato repete para o mesmo grant. |
| 4 | `session_activated` | Mutuamente exclusivo com 6 (ou virou sessão, ou morreu antes). |
| 5 | `pending_access_revoked` | O acesso morreu **antes** de virar sessão. Exclusivo com 4, **não** com `access_denied`. |
| 6 | `access_denied` | **Sem rank fixo — ordena por `createdAt`.** Ver abaixo. |
| 7 | `session_revoked` | Terminal. `details.reason` distingue cliente / operador / expirado. |

🔑 **`access_denied` NÃO tem posição fixa na cadeia, de propósito.** Ele é escrito quando o
token é válido mas o grant não está mais em `TOKEN_ISSUED` (`support-activate.ts:240-268`), o
que inclui uma corrida ordinária: o cliente revoga enquanto o operador abre o link. Nesse caso a
revogação marca o grant como `REVOKED` e grava `pending_access_revoked`
(`support-revoke.ts:120-144`), e o clique seguinte do operador grava `access_denied` para o
**mesmo grant** — ou seja, *depois*, e **causado por** ela. Um rank fixo colocaria a recusa antes
da revogação que a provocou, invertendo causa e efeito no artefato de LGPD — exatamente o que
esta ordenação existe para impedir. Como os dois eventos são escritos pelo **Domus**, sob um
único relógio, `createdAt` os ordena corretamente sozinho.

**Regra geral que decorre disso:** o rank só desempata eventos com `createdAt` **idêntico**
(o caso garantido é `code_redeemed` × `token_issued`, mesma transação). Havendo diferença de
horário **dentro da mesma origem**, o horário vence o rank. O rank nunca reordena eventos que o
Domus já distinguiu no tempo.

Desempate **entre repetições do mesmo evento** (`token_issued` reemitido é o caso real): por
`createdAt` crescente e, se idêntico, pela ordem em que o Domus retornou — `listSupportAudit` já
ordena por `created_at DESC` de forma estável. Não inventar critério novo.

Evento **fora desta tabela** (o vocabulário não tem CHECK constraint no banco): vai para o fim
da cadeia do seu grant, com rótulo genérico. Nunca descartado — trilha de LGPD não some com
evento que não se reconhece.

**O evento de consentimento.** `code_generated` grava `codeId` e **não** `grantId`
(`generate-support-code/index.ts:60`) — o acesso ainda não existia. Por isso a unidade da lista
é o **evento**, não o acesso: agrupar estritamente por acesso deixaria órfão justamente o
registro de que o cliente autorizou, que é o item mais relevante para LGPD.

`SUPPORT_ACCESS_STUCK` é tratado como possível-mas-raro: provavelmente inalcançável desde que a
emissão do token passou para dentro da transação do resgate (`support-redeem.ts:154-163`). A
tela sabe renderizá-lo; nada é construído em volta dele.

### 3.4 Tela

Segundo card, irmão do de resgate, na aba "Clínica" (só cliente medical). Fechado por padrão,
abre com "Ver histórico de acessos" — assim a ficha do cliente **não paga a ida ao Domus** para
quem não quer a trilha, e lentidão do Medical não atrasa a página inteira.

**Quatro** estados, e a distinção entre eles é requisito, não estética:

| Estado | O que mostra |
|---|---|
| Com dados | Lista agrupada por dia: horário, descrição em linguagem simples, operador, origem. Nos encerramentos, o **motivo** em destaque (cliente cortou / expirou / operador encerrou) — a informação que a tela do cliente não exibe. |
| Vazio real | "Nenhum acesso de suporte registrado para esta clínica." |
| Falha | Aviso explícito de que o Medical não respondeu **+ a metade que o Vis conhece**. **Nunca lista vazia** — trilha vazia que significa erro de rede leva a concluir que não houve acesso. |
| Truncado | Os 200 mais recentes **+ aviso de que há mais história** (§3.1). Mesma razão do estado de falha: silêncio aqui vira conclusão errada sobre um artefato de LGPD. |

Herda o design do repo: mesmo card, mesmos ícones, e os rótulos de evento reaproveitados de
`support-audit-labels.ts` (módulo folha, sem `db` no bundle) — as duas telas contam a mesma
história com as mesmas palavras.

### 3.5 Autorização

**Só SUPER_ADMIN e ADMIN** (decisão do dono: quem pode conceder o acesso pode auditá-lo).

Isto exige gate **próprio**, porque a página usa `requireSupportScope`, que **não checa papel**
por desenho (docstring explícita em `admin-session.ts:104`) — e `AdminUser.role` tem default
`SUPPORT` com `scopeAllCompanies` default `true`. Sem gate próprio, a trilha nasceria visível
para SUPPORT e BILLING em todas as empresas.

Checagem no **servidor**, no bloco **e** na rota de dados. Esconder a interface não é gate.
Papéis sem permissão não recebem o card.

> ⚠️ Isto não é furo existente: as ações sensíveis (resgate, impersonate) já usam
> `requireCompanyScope`, que checa papel. Ver [[admin-gates-scope-vs-role]].

---

## 4. Erros

**Vis → Domus** — resultado discriminado em três, porque cada um gera mensagem diferente:
`ok` | `unavailable` (fora do ar, lento, canal mal configurado) | `not_provisioned`. Timeout de
5s, igual ao canal existente. **Falha nunca vira lista vazia.**

**Domus** — 503 (flag off), 401 (assinatura/janela), 403 (host), 400 (clinicId inválido).

---

## 5. Testes

Restrição real: **teste de integração novo é inviável hoje** — `TEST_DATABASE_URL` não está
configurada no `.env` do Domus, e `hasTestDatabase()` só checa se a variável existe (não se
conecta), então testes de integração **falham** em vez de serem pulados. Cobertura por unidade e
fakes.

> Nuance verificada nesta revisão: o guarda de host já aceita **dois** bancos de teste
> (`ep-dawn-haze` e `ep-round-lab`, `db-host-guard.ts:11`), então o bloqueio é **falta de
> credencial configurada**, não host proibido. Se o dono provisionar a credencial, o teste de
> integração deixa de ser inviável — mas isso não é pré-requisito desta entrega.

| Teste | Propriedade travada |
|---|---|
| **Projeção** (o mais importante) | Linha crua com campos extras em `details` e `actor_user_id` preenchido → saída não contém nenhum dos dois. É o contrato de fronteira: falha se alguém adicionar campo novo achando que passa direto. |
| **Junção** | Consentimento sem `grantId` aparece na posição certa; eventos do mesmo grant encadeados na ordem lógica; origem preservada em cada item. |
| **Gate de papel** | SUPPORT e BILLING não recebem os dados — testado **na rota**, não só no componente. |
| **Ordem das guardas** | Mesma abordagem dos testes já existentes do resgate. |
| **Degradação** | Falha do Domus produz estado `unavailable` com a metade Vis — nunca `[]`. |

**Regra de método:** onde a propriedade for estrutural, **sabotar o código para ver o teste
falhar** antes de considerá-lo pronto. Isto não é zelo abstrato: nesta mesma sessão, a primeira
versão do teste do reaper passou com um `catch` mal posicionado que tornaria a falha
100% silenciosa. Teste que não falha quando o código está errado não protege nada.

---

## 6. Fora de escopo

- Tela global cross-tenant de acessos (decisão do dono: trilha da clínica).
- Status ao vivo com contagem regressiva — rejeitado no painel: duplica banner que o Domus já
  mostra ao cliente em toda página, exige polling num projeto que a Vercel já pausou uma vez por
  invocations, e a contagem cruza dois relógios com tolerância de ±5min (errado num display de
  kill-switch).
- Registrar `SUPPORT_TRAIL_VIEWED` a cada visualização — escrita não limitada numa trilha de
  auditoria, inflada por refresh/prefetch/StrictMode; polui o sinal que o log existe para dar.
  Reavaliar se auditoria de leitura virar requisito, com controle de repetição.
- Retry durável da auditoria do reaper (dívida registrada, ver §7).

---

## 7. Dívidas e riscos aceitos

| Item | Situação |
|---|---|
| Trilha depende da disponibilidade do Domus | Aceito. Mitigado pelo carregamento sob demanda e pelo aviso explícito + metade local. A alternativa (replicar) foi rejeitada: cópia de trilha imutável diverge em silêncio. |
| Falha de auditoria no reaper é permanente | **Dívida registrada** (SERIOUS do Codex, escopo próprio): o tick seguinte não reprocessa e não há outbox/alerta, só log crítico com os grantIds. Mesmo padrão já em produção na revogação manual. |
| Divergência de vocabulário de eventos | A migration 0053 comenta 8 eventos; o tipo TS tem 7; não há CHECK constraint. A projeção **não** depende de lista fechada — evento desconhecido é repassado e a tela usa rótulo genérico. |
| Índice DESC divergente | `schema.ts:6310` declara sem `DESC`, o SQL tem `DESC`. Inerte (btree varre nos dois sentidos), mas um `drizzle-kit push` futuro pode emitir DROP/CREATE numa tabela append-only. Fora do escopo; anotado. |
| **A tela do CLIENTE engole falha de leitura** | `get-support-access-state.ts:88-91` faz `.catch(→[])` — exatamente o anti-padrão que §3.4 proíbe para o operador. Foi decisão consciente lá (não conseguir **encerrar** o acesso seria pior que perder o histórico), mas o resultado é que o cliente pode ver trilha vazia por erro de rede. Assimetria **deliberada e agora documentada**; revisitar junto com o retry durável. |

---

## 8. Pré-requisitos

Nenhum. A Entrega 3 está em produção e verificada no banco (migration 0053 aplicada, 3 triggers
de imutabilidade ativas, 16 eventos reais), e a correção do reaper está commitada
(Domus `6230224`). `VIS_DOMUS_SUPPORT_SECRET` já existe nos dois lados — o canal novo reusa o
segredo do canal de suporte, sem segredo adicional.

---

## 9. Rastreabilidade do painel

Registrado porque as **razões** foram tão úteis quanto as conclusões:

- **MVP-first (só `GlobalAudit` local)** — WOUNDED. Diferencial morto: propunha desanonimizar o
  operador recomputando HMAC, mas `GlobalAudit` já grava `actorId` e `adminEmail` em claro
  (`support-redeem/route.ts:190-201`). Materializar o mapa criaria tabela reversa
  pseudônimo→nome de todos os operadores. E não fecharia a assimetria: mostraria só o resgate.
- **User-first (GET com querystring assinada + status ao vivo)** — KILL pelos três críticos.
  Assinar querystring exigiria alterar o verificador **compartilhado** com provisionamento e
  entitlements, e quebraria a chave do anti-replay.
- **Data-first** — SURVIVES, base desta spec, com **as duas justificativas derrubadas**
  (POST desnecessário; promoção de coluna injustificada). Sobrevive o essencial: fonte única,
  junção em request time, allowlist, degradação honesta.
- **Enxertos aceitos:** banner de degradação explícita (user-first) e gate de papel no bloco
  (achado do crítico de segurança, que nenhum criativo viu).
- **Bug corrigido de brinde:** o reaper não gravava na trilha ao expirar sessão — acesso
  encerrado aparecia como aberto na tela do cliente (Domus `6230224`).

Relacionado: [[entrega3-acesso-suporte-f36]], [[admin-gates-scope-vs-role]],
[[vis-medical-gestao-acesso-plano]].
