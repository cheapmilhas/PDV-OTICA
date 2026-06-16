# WhatsApp — Anti-bloqueio (fila + ritmo de envio) — Fase 1

**Data:** 2026-06-15
**Branch (a criar):** `feat/whatsapp-anti-bloqueio` (a partir de `main` = `90565fa`)
**Status:** desenho aprovado pelo dono (seção a seção)

## Problema

Hoje o motor de automações (`whatsapp-automation.service.ts`) envia em **rajada**:
o cron das 9h varre os gatilhos e dispara `evolution.sendText` em loop, o mais
rápido que o `await` permite, a qualquer hora. **Não há nenhum controle de
ritmo, delay, teto diário ou janela de horário** (confirmado por busca no
código). Para WhatsApp não-oficial (Evolution/Baileys), rajada = marcado como
spam = **número bloqueado**. A própria memória do projeto lista "termo/
anti-bloqueio antes de liberar p/ óticas reais" como pendência.

## Solução (Fase 1)

Trocar "envia na hora" por **"enfileira → processa aos poucos"**, com 4
proteções controladas pelo super-admin (invisíveis para a ótica):

1. **Delay entre mensagens** (30s ± 15s aleatório).
2. **Horário comercial** (8h–18h America/Sao_Paulo; pula domingo + feriado nacional).
3. **Teto diário por ótica** (50/dia).
4. **Card de boas-práticas + checkbox "li e entendo"** antes do QR (educa o dono
   + registra o aceite).

### Decisões do dono
- Volume alvo: **baixo (~50/dia/ótica)**.
- Controle: **super-admin** define padrões globais; ótica **não** mexe.
- Fila: **reusa `WhatsappMessageLog`** (+ status `PENDING`), não cria tabela nova.
- Acionamento: **acionador externo grátis** (cron-job.org/GitHub Actions) a cada
  ~3 min, pois Hobby só permite cron 1×/dia. Cron nativo 1×/dia como rede de
  segurança.
- Botão "Processar agora": **enfileira agora + começa a soltar com ritmo**.
- Fase 1 usa **valores fixos no código**; tela `/admin` de ajuste = **Fase 2**.

## Arquitetura

O **ritmo é dado pelo intervalo do acionador externo**, NÃO por um sleep dentro
da função. Cada invocação solta **no máx. 1 mensagem por ótica** e retorna na
hora — sem segurar a função dormindo (decisão pós-revisão: sleep serverless é
desperdício e arriscado se a função morre no meio).

```
Cron diário (9h)                    Acionador externo (~cada 3min)
  varre gatilhos                      GET /api/cron/whatsapp-dispatch
  cria PENDING na fila        →       ① fora do horário comercial? → encerra
  (NÃO envia)                         ② p/ cada ótica dentro do teto:
                                         - CLAIM atômico: 1 PENDING → PROCESSING
                                           (lock; nenhuma outra invocação pega)
                                         - reavalia elegibilidade
                                           · inelegível → SKIPPED
                                           · ok → envia → SENT (ou FAILED)
                                      retorna (sem sleep). 1 msg/ótica/invocação.
```

### Componentes

**1. Migração (aditiva):**
- `enum WhatsappMessageStatus` += `PENDING` e `PROCESSING`.
- `CompanySettings` += `waPracticesAcceptedAt DateTime?` (decidido: CompanySettings,
  onde já vivem as flags wa*; evita migração nova depois).

**2. Enfileiramento — `whatsapp-automation.service.ts`:**
- O `dispatch` (já existe) ganha um 3º modo além de enviar/dryRun: **enqueue**.
  Em vez de `sendWhatsappMessage`, cria a linha `WhatsappMessageLog` com
  `status: PENDING` (após passar `checkWhatsappEligibility` — não enfileira
  inelegível).
- **Dedupe corrigido (C1):** o enqueue NÃO recria se já existe linha
  `(companyId,type,referenceId,periodKey)` em QUALQUER status não-final relevante.
  Implementação: `createMany({ skipDuplicates: true })` ou upsert por chave única
  (o `@@unique` impede a 2ª linha) — nunca `create` cru (que estouraria no unique
  contra PENDING/SENT existente). **E** o dedupe do `checkWhatsappEligibility`
  passa a considerar `status IN (PENDING, PROCESSING, SENT)`, não só SENT — assim
  uma linha enfileirada e ainda não solta não é recriada nem reenviada.
- O cron `/api/cron/whatsapp-messages` passa a rodar em modo enqueue.

**3. Processador — `whatsapp-queue-processor.ts` + `/api/cron/whatsapp-dispatch`:**
- **Freio ① horário comercial** (helper `isWithinBusinessHours(now)` em
  America/Sao_Paulo + feriados). Fora da janela → encerra sem enviar.
- Para cada ótica conectada com PENDING:
  - **Freio ② teto diário:** conta `status=SENT` com `sentAt` dentro do **dia civil
    em America/Sao_Paulo** (C/M1 — intervalo calculado nesse fuso, não UTC).
    `>= teto` → pula a ótica.
  - **CLAIM atômico (C3 — lock):** `updateMany` de **1** linha PENDING mais antiga
    → `PROCESSING` com `WHERE status=PENDING` (operação atômica do Postgres;
    duas invocações concorrentes não pegam a mesma linha). Relê a linha travada.
    Se nada foi travado, pula a ótica.
  - **Reavalia elegibilidade** (C/M4): `checkWhatsappEligibility` na hora de soltar.
    Inelegível (ex.: opt-out no intervalo) → marca a linha **SKIPPED** (não fica
    presa em PROCESSING nem volta p/ PENDING). Elegível → envia via Evolution →
    **SENT** (ou **FAILED** no erro).
- **Sem sleep, sem loop interno de delay:** 1 msg por ótica por invocação. O ritmo
  vem do intervalo do acionador. Retorna logo (cabe folgado no tempo da função).
- **Recuperação de PROCESSING preso (crash):** linhas em PROCESSING há mais de N
  min (ex.: 10) são devolvidas a PENDING no início de cada execução (a função pode
  ter morrido após claim e antes do envio). Como o envio ainda não ocorreu nesse
  caso, devolver é seguro; se o envio ocorreu mas o SENT não persistiu, o
  `evolutionMessageId`/janela de dedupe minimiza reenvio — risco residual baixo e
  documentado.

**4. Card + checkbox — aba Conexão (`whatsapp-connect-client.tsx`):**
- Card com as regras de ouro (número dedicado; começar devagar; só opt-in;
  horário; opt-out automático).
- Botão de conectar/QR desabilitado até marcar "Li e entendo".
- Aceite gravado em `waPracticesAcceptedAt` (via novo endpoint ou no connect).
  Uma vez aceito, não pede de novo.

**5. Acionador externo:**
- `/api/cron/whatsapp-dispatch` protegido por `Bearer CRON_SECRET`.
- Dono configura cron-job.org (URL + header + 3 min). Passo a passo entregue.
- Se o acionador parar, a fila só espera (nada se perde). Rede de segurança: cron
  nativo 1×/dia chama o mesmo endpoint (drena 1 msg/ótica — limitado, mas evita
  fila eterna).
- **Observabilidade (M2):** cada execução loga `{ claimed, sent, skipped, failed,
  pendingRestantes }`. Métrica simples p/ o dono perceber se a fila está crescendo
  (acionador caiu). Alarme automático fica p/ Fase 2.

### Valores fixos (Fase 1)
- Horário: 8h–18h America/Sao_Paulo, pula domingo + feriado nacional **de data
  fixa**. Teto: 50/ótica/dia. 1 msg/ótica/invocação (o ritmo vem do intervalo do
  acionador, ~3 min). **Sem sleep interno.**

### Dimensionamento
1 msg/ótica a cada ~3 min ⇒ ~20 msg/h/ótica × ~10h comerciais ⇒ ~200/dia de teto
físico (folga para os 50 alvo). Margem real menor se o acionador falhar — por isso
a observabilidade acima.

## Segurança / não-regressão
- Migração 100% aditiva; aplicada no deploy pelo checklist do dono (backup),
  nunca pelo Cursor.
- Botão "Processar agora" e prévia (já em prod) continuam: passam a enfileirar +
  iniciar o ritmo. Prévia (dryRun) inalterada.
- `sendWhatsappMessage` direto (share-link/recibo) **não** muda — continua envio
  transacional imediato; só as automações vão para a fila.

## Fora de escopo (Fase 2+)
- Tela `/admin` para ajustar delay/teto/horário sem deploy.
- Aquecimento progressivo de número novo.
- **Feriados MÓVEIS** (Carnaval, Sexta-feira Santa, Corpus Christi — mudam de data
  todo ano): Fase 1 cobre só os **nacionais de data fixa** (1/1, 21/4, 1/5, 7/9,
  12/10, 2/11, 15/11, 25/12). Móveis e municipais/estaduais ficam p/ Fase 2.
- Múltiplos números / API oficial (só se o volume crescer muito).
- Alarme automático de fila represada (Fase 1 só loga a métrica).

## Testes
- Enqueue: automações criam PENDING (não SENT); inelegível não entra; **não recria
  se já existe linha PENDING/PROCESSING/SENT da mesma chave** (C1).
- Dedupe: `checkWhatsappEligibility` considera PENDING/PROCESSING/SENT como "já na
  fila" (não recria).
- Processador: fora do horário → não envia; teto atingido → pula ótica; **claim
  atômico** trava 1 linha (PENDING→PROCESSING) e não há envio duplo sob 2 execuções
  (C3); reavalia ao soltar → inelegível vira SKIPPED (C/M4).
- Teto conta o dia civil em America/Sao_Paulo (M1), não UTC.
- Recuperação: PROCESSING preso > N min volta a PENDING.
- Helper de horário/feriado: domingo, feriado fixo, bordas 7h59/18h01.
- Card: QR bloqueado sem aceite; aceite persiste em `waPracticesAcceptedAt`.

## Disciplina
Branch a partir da `main`, aditivo, validar (tsc + testes + build via rtk proxy),
**deploy via CLI** (`vercel deploy --prod` — push não promove alias confiável
neste projeto), **PARAR antes do deploy** (dono decide). Migração no checklist.
