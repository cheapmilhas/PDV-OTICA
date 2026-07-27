# Entrega 8 — Conversão de trial (N4 + N5 + N6)

> Spec de design. Escrita em 2026-07-27, depois de painel adversarial (3 criativos + 3 críticos)
> e challenge do Codex. **Aguarda aprovação do dono.** Nenhuma linha de código escrita.

## Por que esta entrega existe

Hoje o Vis não sabe responder duas perguntas de negócio: **"os trials medical estão virando
cliente pagante?"** e **"a clínica que está em trial chegou a usar o produto?"**. O operador
descobre que perdeu um trial quando ele já expirou.

A entrega fecha as duas, mais um alerta que interrompe o operador a tempo de agir.

---

## Escala real (o fato que decidiu o desenho)

**UMA clínica medical em produção. UM operador (o dono).**

Isso matou a abordagem mais vistosa do painel (fila de trabalho com baldes Quente/Morno/Frio,
snapshot histórico de 90 dias, cron próprio): é UI cuja premissa — triagem de volume — não
existe. Toda decisão abaixo prefere *estender o que existe* a *construir o que escalaria*.

Quando houver dezenas de trials, a fila volta à mesa. Não antes.

---

## N4 — Métrica de conversão

### O que muda

**`/admin/assinaturas`** — a coluna "Trial expira" já existe (`assinaturas/page.tsx:97,127`) e
mostra data absoluta. Ganha valor **relativo** ("em 3 dias") e o parâmetro de **ordenação** por
`trialEndsAt`. Não criar segunda coluna equivalente.

**`/admin/relatorios`** — nova seção de conversão, product-aware como o resto da página
(`getProductContext()` + `buildDashboardFilters(product)`).

### As fórmulas (onde estão os defeitos)

**Numerador — quem converteu.** `activatedAt != null`. Mas `activatedAt` tem dois problemas
verificados:

- `checkout-status.ts:35` grava `activatedAt` em signup de **cartão que nasce ACTIVE e nunca
  teve trial** → infla.
- `faturas/[id]/workflow/route.ts:59-85` (`mark_paid`) promove `TRIAL → ACTIVE` dentro de
  `$transaction` e **não grava `activatedAt`** → some com quem converteu por fatura manual.

→ **Correção obrigatória:** o `mark_paid` passa a gravar `activatedAt` (padrão do webhook:
`where: { activatedAt: null }`, para não sobrescrever a primeira ativação). E o numerador exige
`trialStartedAt != null`, que exclui quem nunca trialou.

**Denominador — quem era elegível.** NÃO usar "todos os trials": cada signup novo derrubaria a
taxa antes de ter chance de converter. Elegíveis = **convertidos + não-convertidos cujo trial já
terminou** (`trialEndsAt < now`).

**Tempo médio até converter.** Pares com `activatedAt >= trialStartedAt`, **sem filtrar por
status atual** — assinatura que converteu e depois cancelou continua sendo conversão histórica.

### ✅ DECISÃO 1 (dono, 2026-07-27) — taxa por ASSINATURA-TRIAL

`Subscription` tem só `@@index([companyId, status])`, **sem unique em `companyId`** — uma
empresa pode ter várias assinaturas. As duas fórmulas divergem quando alguém cancela e assina de
novo.

**Decidido: por ASSINATURA-TRIAL.** É a unidade que de fato tem um trial e uma conversão; por
empresa, um cliente que trialou duas vezes viraria "uma conversão" e esconderia que a primeira
tentativa falhou. **Rotular na tela como "trials convertidos", nunca "clientes convertidos"** —
o rótulo é parte da decisão, não detalhe de UI.

### Índices

`Subscription` não tem índice em `trialEndsAt` nem `activatedAt`. Na escala atual é seq-scan
sobre dezenas de linhas — **não vale migração agora**. Reavaliar quando a tabela passar de
alguns milhares.

### ⚠️ Limite honesto (contar ao dono, não descobrir depois)

**O histórico de trials JÁ expirados é irrecuperável.** O instante da transição
`TRIAL → TRIAL_EXPIRED` não existe em lugar nenhum: não há `expiredAt`, `updatedAt` foi
sobrescrito por escritas posteriores, e `SubscriptionHistory` não é escrita nem pelo webhook nem
pelos dois caminhos de expiração. **A série começa no dia do deploy e não há backfill possível.**

---

## N5 — Alerta ao operador

### 🚨 O defeito que quase passou

Notificação **global** (`adminId: null`) é lida por todos (`notifications/route.ts:14` faz
`OR: [{adminId: admin.id}, {adminId: null}]`) mas **não pode ser marcada como lida por ninguém**:
`read-all/route.ts` e `[id]/read/route.ts` excluem `adminId: null` **de propósito** — marcar uma
global faria a linha sumir para todos os outros admins.

Com o `NotificationBell` repolando a cada 2 minutos (`NotificationBell.tsx:45,74`), o alerta
voltaria como não-lido **para sempre**. Sino que não apaga é pior que sino nenhum: o operador
aprende a ignorá-lo.

→ **N5 emite notificação DIRECIONADA por admin, nunca broadcast.**

Consequência em Postgres: **várias linhas com `adminId = NULL` não colidem num unique** — um
unique parcial sobre broadcast não deduplicaria nada. Direcionada resolve os dois problemas de
uma vez.

### Migração

`AdminNotification` ganha `periodKey String?` + `@@unique([adminId, type, periodKey])`.

**`periodKey` mal escolhido quebra em silêncio:**

| Forma | Defeito |
|---|---|
| `"trial-ending"` fixo | um alerta na vida inteira |
| só a data (`"2026-08-01"`) | trials distintos que expiram no mesmo dia colidem |
| só `subscriptionId` | extensão de trial nunca realerta |

→ **Usar `trial:${subscriptionId}:${trialEndsAt.toISOString()}`.** Extensão de trial muda
`trialEndsAt`, logo muda a chave, logo realerta — que é o comportamento correto.

**Destinatário:** uma linha por admin com papel que deve ser alertado. Critério determinístico,
nunca "o primeiro admin". Na escala atual (um operador) é uma linha.

### Onde emitir

**Dentro do cron `subscription-watch` que já roda** — ele já seleciona exatamente os trials
relevantes e já calcula a janela. Cron novo duplicaria seleção e criaria corrida. (E a Vercel já
pausou este projeto por excesso de invocations: cron novo precisa justificar por que não é
piggyback.)

**Só no ramo `TRIAL_ENDING`, nunca no ramo que vira o status.** Assim o alerta não participa da
transição de estado do cliente: falha do alerta não pode segurar `TRIAL_EXPIRED`, e a virada de
status não pode ser revertida por falha de notificação.

Isolamento de falha: o `catch` do cron é por assinatura
(`subscription-watch/route.ts:34,86`) — uma falha interrompe só aquela iteração, os trials
seguintes continuam. `P2002` (colisão do unique) é **duplicata esperada**, não erro: tratar como
no-op silencioso.

### Contexto de produto no link

O cron varre os **dois** produtos e o sino é cross-product, mas `clientes/[id]/page.tsx:65` faz
`notFound()` quando o produto da empresa ≠ cookie `admin.product` ativo. **Alerta medical clicado
com o painel em VIS_APP dá 404.** O link da notificação precisa trocar o contexto antes de
navegar (ou passar por rota intermediária que o faça).

### Defeito pré-existente encontrado (NÃO corrigir aqui)

`notifyCompany` engole falha e devolve `FAILED`/`SKIPPED`, e o cron **ignora o retorno**
(`subscription-watch/route.ts:44,80`) → e-mail que falhou não impede `TRIAL_EXPIRED` e não é
retentado. O comentário no código que diz o contrário está errado. **Escopo próprio** — anotar,
não consertar junto.

### Nota de fuso

`0 9 * * *` em `vercel.json:34` é **09:00 UTC = 06:00 em Fortaleza**. O alerta chega de manhã
cedo, antes do expediente. Aceito (o sino é assíncrono), mas registrado para não surpreender.

---

## N6 — Checklist de onboarding via canal de uso

### O gap

`onboardingChecklist` **não existe no Domus** (varredura do repo inteiro: zero ocorrências). O
que existe é `OnboardingChecklist`/`OnboardingStep` **no Vis**, com steps hardcoded ÓTICOS
(`FIRST_BRANCH`, `PRODUCTS_IMPORTED`, `FIRST_SALE`), criado só no create manual, UI read-only,
sem nenhum emissor de runtime.

**O Vis sabe se a clínica PAGA. Não sabe se ela USA.**

### Desenho: 5º canal M2M de leitura

Espelha o N7 (`/api/internal/vis/support/audit`), que é o único canal de leitura existente.

**Do N7, HERDAR:**
- `vis-provision-hmac` — canonical `version.method.path.nonce.ts.body`, path+method-bound.
- `PATH` estático, idêntico nos dois repos, dentro da assinatura.
- Normalização da barra final da URL base (`vis-support-audit-client.ts:39`) — **a barra já
  quebrou a assinatura uma vez** e o sintoma foi `http_401`, que se lê como "segredo errado".
- `clinicId` em header **assinado** `x-vis-clinic-id`, ocupando o slot `body` (GET tem corpo vazio).
- Timeout obrigatório + `cache: "no-store"`.
- Resultado discriminado `ok | unavailable` — **nunca lista vazia em falha**.
- Autorização e resolução do `domusClinicId` **no Vis**, nunca a partir de valor do navegador.
- Sem `consumeNonce`: leitura idempotente não concede nada. (Confirmado: sem consumo o canal não
  escreve em `vis_hmac_nonces` nem dá trabalho ao reap. O nonce vira só entropia; quem limita
  replay é o timestamp.)

**Do N7, NÃO herdar:**
- ❌ `VIS_DOMUS_SUPPORT_SECRET` → **segredo próprio `VIS_DOMUS_USAGE_SECRET`**. Aquele autentica
  `support/redeem`, o endpoint que **cunha grant de acesso a PHI**; o próprio N7 documenta que a
  separação existe para conter vazamento.
- ❌ `VIS_SUPPORT_ACCESS_ENABLED` → **flag própria**. Aquela gateia a UI de **consentimento do
  cliente**; ligar uma para destravar a outra habilitaria geração de código de suporte sem querer.
- ❌ O fallback permissivo de campo ausente (`vis-support-audit-client.ts:91` converte `truncated`
  ausente em `false`). Aqui: campo ausente, string numérica, `null`, negativo, decimal ou flag
  fora de `0|1` **invalida a resposta inteira**.
- ❌ O carregamento manual por botão. Aqui carrega automático **ao montar a aba** (ver abaixo).

### 🚨 Onde a chamada NÃO pode ficar

`clientes/[id]/page.tsx:39-145` faz tudo em `await` **serial**, sem `Suspense`. As abas são
estado **client-side** (`company-tabs.tsx:48,91`): o servidor renderiza tudo antes de saber que
"Clínica" não está visível.

Colocar a leitura no server component significaria: a ficha inteira espera o Domus mesmo com o
operador olhando o "Resumo"; timeout/401/429/DNS derrubam a página no error boundary
(`(painel)/error.tsx:23`); e `ClientesTable.tsx:97` usa `Link` **sem `prefetch={false}`** — o
prefetch dispararia leituras sem clique humano.

→ **Client component dentro do `TabPanel` da aba "Clínica"**, que chama uma rota do Vis. Molde
exato: `company-support-trail.tsx:108`.

### Autorização

Rota `GET /api/admin/companies/[id]/clinic-usage` com **`requireCompanyScope`** — o mesmo gate do
N7, e pelo mesmo motivo: `requireSupportScope` **não checa papel de propósito**, e `AdminUser.role`
tem default `SUPPORT` com `scopeAllCompanies` default `true`. Herdá-lo abriria dado de uso de
clínica para SUPPORT e BILLING em todas as empresas.

**Esta rota é o ÚNICO ponto de autorização do canal** — o endpoint do Domus é autenticado mas não
autorizado (quem tem o segredo assina qualquer `clinicId`). Documentar isso no docblock, como o
N7 faz.

⚠️ O docblock do N7 põe uma **condição** na isenção que ele mesmo usa: *"se este canal um dia
expuser conteúdo clínico, passa a precisar de autorização por grant aqui dentro"*. Contagem de uso
é dado **comportamental de clínica**, não artefato de consentimento — a isenção não transfere de
graça. Ela se sustenta aqui porque a projeção é de escalares agregados e o gate de papel no Vis é
mais estrito que o da página.

### Projeção — allowlist fechada de escalares

Tipo de retorno `number` em todas as métricas. Isso impede exfiltrar identificador; **não** impede
inferência (`patients.total = 3` compila e, numa clínica de 3 pacientes, diz algo). A defesa real
é a **revisão do catálogo**, não o tipo — não tratar o tipo como garantia completa.

**Soft delete é obrigatório em toda métrica.** `doctors:331`, `patients:423`, `appointments:542`
têm `deletedAt`; `doctors:329` e `usersToClinics:199` têm `isActive` **separado**. `COUNT(*)`
ingênuo marcaria "tem médico ✓" numa clínica que deletou todos. Cada métrica declara
explicitamente seu predicado.

**Nunca inventar zero.** Falha de leitura = `desconhecido`, jamais `0`. Zero e desconhecido são
fatos diferentes; confundi-los faz o checklist mentir. Como a resposta é só de escalares, uma
falha parcial não tem como ser representada → o endpoint é **all-or-nothing**: se uma consulta
falhar, a resposta inteira é indisponível. **Proibido `catch(() => 0)`.**

**Checklist derivado, nunca marcado.** Não escrever em `OnboardingChecklist`/`OnboardingStep` —
derivado gravado em coluna de fato asserido foi o que matou a abordagem B no painel (escrita
irreversível a partir de amostragem lossy, no mesmo campo que um humano preenche).

### Estados da UI (todos explícitos)

| Situação | O que o operador vê |
|---|---|
| Sem `domusClinicId` | "ainda não provisionada" |
| Flag/canal desligado | "dados indisponíveis" |
| Carregando | skeleton só do checklist |
| Timeout / 401 / 429 / 5xx / resposta inválida | "não foi possível consultar; valores desconhecidos" + botão tentar de novo |
| Sucesso | números reais, **incluindo zero quando a consulta retornou zero** |

### ✅ DECISÃO 2 (dono, 2026-07-27) — `patients.total` EXATO, sem piso de k-anonimato

Contagem agregada de clínica **pequena** não é anônima. Nenhuma das três abordagens do painel
tinha piso.

**Decidido: número exato, com escopo restrito.** As demais métricas (nº de médicos, usuários por
papel, dias de horário configurado, flags de configuração) descrevem **a operação da clínica**,
não pacientes. `patients.total` exato é o sinal mais útil para saber se a clínica começou a usar
de verdade, e o operador já tem canal auditado (Entrega 3) para dado real quando precisa.

⚠️ **Risco aceito e documentado:** numa clínica de poucos pacientes, o número exato permite
inferência. Aceito porque o consumidor é o operador (SUPER_ADMIN/ADMIN, gate revalidado no banco),
o dado não sai da tela, e nada é persistido. **Se um dia esse canal alimentar algo público,
exportável ou persistido, a decisão precisa ser revista** — a alternativa pronta é publicar em
faixa (`0` / `1-10` / `11-50` / `50+`).

### ✅ DECISÃO 3 (dono, 2026-07-27) — retenção: nada persiste

O desenho **não persiste nada** (leitura sob demanda), então não há retenção a definir hoje. A
posição está registrada em `contratos-pendencias-juridicas` (item 8) **antes** de alguém propor
cache/snapshot: no dia em que virar cache, a retenção vira cláusula contratual, não detalhe de
implementação.

---

## O que esta entrega NÃO faz (escopo próprio)

- **Não** unifica os caminhos que expiram trial (cron + lazy em `subscription.ts`) numa porta
  única que escreva `SubscriptionHistory`. É a melhor ideia que o painel produziu e é dívida real
  — mas é refatoração de caminho crítico de billing e não deve viajar de carona numa entrega de
  dashboard. **Commit próprio, teste próprio.** (`SubscriptionHistory.adminId`/`adminName` são
  `String` NOT NULL: expiração pelo sistema não tem admin → exige nullable ou sentinela.)
- **Não** conserta `notifyCompany` engolindo falha (defeito pré-existente descrito acima).
- **Não** mexe em `OnboardingChecklist`/`OnboardingStep` nem no `Company.onboardingStep` do tenant.
  Há 4 fontes de uso/onboarding no Vis hoje; esta entrega **não cria a 5ª** — deriva e descarta.
- **Não** cria índice em `Subscription`.
- **Não** faz backfill de conversão (impossível, ver limite honesto).

---

## Ordem de execução

1. **N4** — sozinha, sem dependência externa. Inclui o fix do `mark_paid`.
2. **N5** — migração de `periodKey` (manual, script `.cjs`, o dono roda) + emissão no cron.
3. **N6** — Domus primeiro (endpoint inerte, atrás de flag), Vis depois. **Ordem importa**: o
   card do Vis chama endpoint que só existe após o Domus subir.

Cada fatia: commit isolado, teste próprio, revisão do Codex antes de fechar.

**Pré-requisito do dono para a N6:** cadastrar `VIS_DOMUS_USAGE_SECRET` (mesmo valor) nos dois
projetos Vercel.

---

## Aprovação

- [ ] Decisão 1 — taxa por assinatura (recomendado) ou por empresa
- [ ] Decisão 2 — `patients.total` exato (recomendado) ou em faixa
- [ ] Decisão 3 — retenção registrada em contratos (é registro, não bloqueia)
- [ ] Escopo geral e ordem de execução
