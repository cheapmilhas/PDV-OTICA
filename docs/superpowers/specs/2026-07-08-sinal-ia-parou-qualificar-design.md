# Sinal de Saúde "IA parou de qualificar" — Design

**Data:** 2026-07-08
**Tela:** `/admin/configuracoes/saude` ("O Pulso")
**Origem:** diagnóstico de bug ([[funil-ia-parou-chave-anthropic]]) → forja enxuto (2 criativos ⚔ 1 crítico) → esta spec.

## Motivação

A IA que qualifica conversas de WhatsApp e cria leads parou em 02/07 (chave Anthropic ausente em prod) e **ninguém percebeu por 6 dias** (61 leads perdidos). O cron `whatsapp-qualify` diz "ok" no heartbeat porque a falha é por-conversa e silenciosa — o monitoramento só sabe "o cron respondeu", não "a IA produziu resultado". Este sinal fecha esse buraco: mede **resultado** (última qualificação com sucesso), não execução.

## Objetivo

Adicionar um 6º `HealthSignal` (`key: "ai"`) que detecta "a IA parou de qualificar" e, via o mecanismo já existente, dispara e-mail de alerta ao dono.

## Regra (limiar chapado, sem lógica de horário)

Duas leituras baratas:
- `lastQualifiedAt` = `MAX(createdAt)` em `AiTokenUsage` where `feature = "lead_qualification"`.
- `anyAiEnabled` = existe alguma `CompanySettings` com `iaEnabled = true`.

Estados (`HealthState`):
- **`unknown`** (cinza) — `anyAiEnabled === false`. Detail: "IA de qualificação está desligada em todas as óticas." Sem alarme, sem e-mail (o cron ignora `unknown`). Distingue "escolha" de "quebra".
- **`critical`** — `anyAiEnabled === true` **E** (`lastQualifiedAt === null` OU `now - lastQualifiedAt > 24h`). Detail: "A IA parou de transformar conversas em oportunidades — sem qualificações desde DD/MM." Action: "Verifique a configuração de IA no super admin (chave Anthropic) ou avise o suporte técnico."
- **`healthy`** — `anyAiEnabled === true` E `now - lastQualifiedAt <= 24h`. Detail: "A IA está transformando conversas em oportunidades — última há Xh."

Sem `warning` intermediário (YAGNI para N=1 ótica). O limiar de 24h cruza o fim de semana sem falso-positivo (domingo→segunda). Fuso: comparar por **delta de tempo** (`Date.now() - createdAt.getTime()`), NUNCA horário de parede — o repo tem histórico de bugs de fuso.

## Fora de escopo (o painel adversarial matou, com justificativa)

- Janela de horário comercial (fuso = dívida garantida neste repo; valor nulo — o incidente durou dias, não horas).
- Gate de demanda por `COUNT` de inbound (query extra no Neon scale-to-zero que só aumenta falso-negativo; `iaEnabled` já basta).
- Contador de "quantas conversas perdidas" (query cara, valor de decisão nulo — o dono age igual sabendo 40 ou 120).
- Sinal por-ótica / limiar ancorado em volume (infra para N=1; um agregado global responde hoje).
- Botão manual "avisar suporte" (redundante — o critical já e-maila via cron).
- Reescrever o sinal `integrations` existente (regressão em sinal vivo; sinal novo isolado tem superfície menor).

## Componentes

### 1. `summarizeAiQualification()` em `system-health.service.ts`
Nova função no padrão dos 5 sinais existentes (`checkVercel`, `checkSentry`, etc.). Retorna `HealthSignal` com `key: "ai"`. Assíncrona (faz as 2 queries). Fail-safe: erro de leitura → `unknown` (não derruba o snapshot inteiro), no mesmo espírito dos outros sinais.

### 2. Adicionar `ai` ao snapshot
- `SystemHealthSnapshot.signals` ganha o campo `ai: HealthSignal`.
- `getSystemHealthSnapshot` chama `summarizeAiQualification()` (junto com os outros, no `Promise.all` existente) e o inclui no objeto `signals`.
- Incluir o sinal `ai` na agregação de `businessAreas` — mapear para a área **`whatsapp`** (a IA de qualificação é do funil/WhatsApp, é onde o dono espera ver "minhas conversas viram oportunidades"). Confirmar no plano como `buildBusinessAreas` mapeia sinais→área e adicionar `ai` ali.

### 3. Renderização em `pulso-view.tsx`
Adicionar `snapshot.signals.ai` ao array `signals` que já é mapeado em `<SignalCard>`. Escolher um ícone lucide (ex. `BrainCircuit`, já usado na Central de IA) no `SIGNAL_ICONS`. Nenhum componente novo.

### 4. E-mail de alerta (o ponto que NÃO é de graça — exige 1 linha)
O cron `health-alert` converte sinais `critical`/`warning` em `SystemEvent` e e-maila. MAS ele usa **`SOURCE_BY_SIGNAL`** (allowlist por `key` de sinal) e pula qualquer sinal ausente (`if (!severity || !source) continue;`). Portanto:
- Adicionar `ai: "ai"` a `SOURCE_BY_SIGNAL` em `health-alert/route.ts`. Sem isso, o critical do sinal `ai` **nunca** vira e-mail — este é o passo que fecha o laço.
- `SystemEvent.source` é `String` livre (schema) — `"ai"` não exige migração. Verificar o type `SystemEventSource` em `system-event.service.ts` e adicionar `"ai"` se for uma união fechada.
- Verificar `dedupeFor(source)` no cron (usado na reconciliação de eventos que voltaram ao verde) — garantir que `"ai"` produz o mesmo `dedupeKey` `ai:auto` usado na criação, senão eventos resolvidos não fecham.

## Fluxo de dados

`getSystemHealthSnapshot()` → `summarizeAiQualification()` faz `MAX(createdAt)` + `EXISTS(iaEnabled)` → devolve `HealthSignal{key:"ai"}` → entra em `snapshot.signals.ai` → (a) renderiza card em "O Pulso"; (b) o cron `health-alert` (1×/h) lê o snapshot, e com `ai` em `SOURCE_BY_SIGNAL`, um estado `critical` vira `SystemEvent{source:"ai", dedupeKey:"ai:auto"}` → `maybeSendAlert` e-maila (idempotente por `alertedAt`). Volta ao `healthy` → o evento auto é resolvido.

## Testes

- **`summarizeAiQualification`** (unit, mockando prisma): (a) sem IA ligada → `unknown`; (b) IA ligada + `lastQualifiedAt` null → `critical`; (c) IA ligada + última há 30h → `critical`; (d) IA ligada + última há 2h → `healthy`. Verificar `key === "ai"` e que o detail do critical menciona a data.
- **`health-alert`** (ajuste no teste existente, se houver): um snapshot com `signals.ai` critical produz um `SystemEvent` com `source: "ai"` (prova que a allowlist reconhece o novo sinal). Se o teste do cron não cobre isso, adicionar um caso mínimo.

## Verificação

Sem migração (`SystemEvent.source` é String livre). Typecheck limpo, testes verdes, build OK.
