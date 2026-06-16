# Integração — Anti-bloqueio WhatsApp sobre a base de PRODUÇÃO (v2)

> Plano de retomada. Se o contexto encher no meio, retomar daqui. NÃO deployar,
> NÃO pushar, banco INTOCADO além das 2 migrations já aplicadas (GATE 2).

## Branch desta integração
`feat/integra-anti-bloqueio-v2` (tip do merge `0893f99`), criada a partir da
`feat/c1-medicao-ia-deploy` (`019180b`) + merge de `feat/whatsapp-anti-bloqueio-fase1`.
(A v1 `feat/integra-anti-bloqueio` ficou obsoleta — pode ser apagada.)

## Contexto / drift
Produção roda a branch `feat/c1-medicao-ia-deploy` (`019180b`), deployada mas
nunca mergeada na `main`. Contém: medição/gestão de IA (Bloco C) + funil
"porteira" + Bloco D (áudio Whisper, seletor de modelo, margem) + reconcile que
trouxe SÓ schema+migration `whatsapp_queue` (sem código). A nossa branch tem o
anti-bloqueio completo (fila/dispatch/horário/teto/card).

## Migrations no banco de prod
- `20260616053505_ai_global_config` ✅ aplicada (GATE 2)
- `20260616120000_whatsapp_queue` ✅ aplicada (GATE 2; idêntica nos 2 lados)
- `20260616060000_ai_model_audio_margin` (Bloco D) ⏳ PENDENTE — aditiva
  (ADD COLUMN markupPercentOverride/openaiKeyEnc/qualifierModel). **Só aplicar
  em mini-GATE com aprovação do dono, ANTES do deploy do código.**

## Resolução dos 6 conflitos (FEITA — investigação Opção C confirmou)
Os 4 arquivos de núcleo do WhatsApp são o MESMO trabalho-base; a nossa versão é
SUPERSET (a da c1 é a pré-anti-bloqueio). Salvaguarda verificada: a c1 NÃO tinha
nenhuma lógica exclusiva nesses 4 — só a versão antiga. Resolução:
1. 4 núcleos → ficou com a NOSSA versão inteira (`git checkout --theirs`):
   whatsapp-send.ts, whatsapp-automation.service.ts, run-now/route.ts,
   whatsapp-automations-client.tsx.
2. `prisma/schema.prisma` → manteve os dois (iaAvailable/iaEnabled/
   iaMonthlyTokenLimit/markupPercentOverride + waPracticesAcceptedAt +
   processingAt). Schema valida OK.
3. `vercel.json` → manteve os dois crons (whatsapp-qualify + whatsapp-dispatch).
   Total 13 crons (limite Hobby = 100, OK).

## Validação
prisma generate · tsc 0 erros · suíte verde · next build foreground verde +
rotas no manifest (whatsapp-dispatch, accept-practices, whatsapp-qualify, ai-*).

## Falta para o deploy (gates futuros)
- mini-GATE: aplicar `ai_model_audio_margin` no banco (aprovação do dono).
- GATE 3: avançar `main` (`079fab3`, ancestral → fast-forward) p/ a v2 + push (= deploy).
- GATE 4-6: deploy READY, dispatch 401 sem auth, cron-job.org (dono), smoke (flags OFF).
- Plano B crons: remover whatsapp-dispatch do vercel.json e re-pushar se a Vercel reclamar.

## Rollback / segurança
- Tag git `backup/main-antes-anti-bloqueio-2026-06-16` → `079fab3`.
- Branch Neon de backup (criado pelo dono antes do GATE 2).
- A c1 é LOCAL e outras sessões podem mexer — reconferir `git rev-parse c1` ao retomar.
