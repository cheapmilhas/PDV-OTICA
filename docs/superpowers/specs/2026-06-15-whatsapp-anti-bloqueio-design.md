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

```
Cron diário (9h)                    Acionador externo (~cada 3min)
  varre gatilhos                      GET /api/cron/whatsapp-dispatch
  cria PENDING na fila        →       processa um lote pequeno respeitando:
  (NÃO envia)                           ① horário comercial? (senão: encerra)
                                        ② teto diário da ótica? (senão: pula ótica)
                                        ③ solta 1 → SENT → delay 30s → próxima
                                        para quando: tempo da função / fila vazia
```

### Componentes

**1. Migração (aditiva):**
- `enum WhatsappMessageStatus` += `PENDING`.
- `CompanySettings` (ou `WhatsappConnection`) += `waPracticesAcceptedAt DateTime?`.

**2. Enfileiramento — `whatsapp-automation.service.ts`:**
- O `dispatch` (já existe) ganha um 3º modo além de enviar/dryRun: **enqueue**.
  Em vez de `sendWhatsappMessage`, cria a linha `WhatsappMessageLog` com
  `status: PENDING` (após passar `checkWhatsappEligibility` — não enfileira
  inelegível). Idempotência via `@@unique` continua valendo.
- O cron `/api/cron/whatsapp-messages` passa a rodar em modo enqueue.

**3. Processador — `whatsapp-queue-processor.ts` + `/api/cron/whatsapp-dispatch`:**
- Pega PENDING mais antigas, agrupadas por ótica.
- Freio ① horário comercial (helper `isWithinBusinessHours(now)` + feriados
  nacionais fixos). Fora da janela → encerra sem enviar.
- Freio ② teto diário: conta SENT de hoje por ótica; >= teto → pula ótica.
- Freio ③ solta 1 (reusa a parte de envio Evolution do `sendWhatsappMessage`),
  marca SENT, espera delay, repete até estourar o tempo da função ou esvaziar.
- **Reavalia elegibilidade ao soltar** (opt-out entre enfileirar e soltar é
  respeitado).

**4. Card + checkbox — aba Conexão (`whatsapp-connect-client.tsx`):**
- Card com as regras de ouro (número dedicado; começar devagar; só opt-in;
  horário; opt-out automático).
- Botão de conectar/QR desabilitado até marcar "Li e entendo".
- Aceite gravado em `waPracticesAcceptedAt` (via novo endpoint ou no connect).
  Uma vez aceito, não pede de novo.

**5. Acionador externo:**
- `/api/cron/whatsapp-dispatch` protegido por `Bearer CRON_SECRET`.
- Dono configura cron-job.org (URL + header + 3 min). Passo a passo entregue.
- Se o acionador parar, fila só espera (nada se perde); cron nativo 1×/dia drena.

### Valores fixos (Fase 1)
- Delay: 30s ± 15s · Horário: 8h–18h, pula domingo+feriado nacional · Teto: 50/
  ótica/dia · Lote: o que couber em ~50s (~1-2 msg/execução).

### Dimensionamento
Delay 30s + função ~50s ⇒ ~1-2 msg/execução. Acionador a cada 3 min ⇒ ~20 msg/h
× ~10h comerciais ⇒ capacidade ~200/dia (folga para os 50 alvo).

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
- Feriados municipais/estaduais (Fase 1 = nacionais fixos).
- Múltiplos números / API oficial (só se o volume crescer muito).

## Testes
- Enqueue: automações criam PENDING (não SENT); inelegível não entra.
- Processador: respeita horário (fora → não envia), teto (>= limite → pula),
  delay (chamado entre envios), reavalia elegibilidade ao soltar.
- Helper de horário/feriado: casos de borda (domingo, feriado, 7h59/18h01).
- Card: QR bloqueado sem aceite; aceite persiste.

## Disciplina
Branch a partir da `main`, aditivo, validar (tsc + testes + build via rtk proxy),
**deploy via CLI** (`vercel deploy --prod` — push não promove alias confiável
neste projeto), **PARAR antes do deploy** (dono decide). Migração no checklist.
