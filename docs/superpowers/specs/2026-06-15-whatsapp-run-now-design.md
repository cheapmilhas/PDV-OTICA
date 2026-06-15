# WhatsApp — Botão "Processar agora" (disparo manual das automações)

**Data:** 2026-06-15
**Branch:** `feat/whatsapp-run-now` (a partir de `main` = `295f265`)
**Status:** desenho aprovado pelo dono

## Problema

As 4 automações de WhatsApp (óculos pronto, pós-venda, aniversário, crediário a
vencer) só disparam pelo cron diário `/api/cron/whatsapp-messages` às 9h. Não há
como o dono da ótica disparar na hora — nem para testar, nem para uso real
("marquei o óculos como pronto, quero avisar o cliente agora"). A aba Histórico
fica vazia até o cron rodar.

## Solução

Botão **"Processar agora"** na aba Automações que roda a mesma varredura do cron,
imediatamente, **limitada à ótica do usuário logado**. Reusa 100% do motor
existente (idempotente — não duplica envios já feitos no dia).

### Decisões do dono

- Comportamento: dispara **tudo que está pendente hoje** (todos os tipos ligados).
  Não há seleção item-a-item no MVP.
- Local: aba **Automações**, visível a **todos** os usuários da ótica que acessam
  a tela (gated por `settings.edit`, igual ao resto da tela).
- Escopo: **só a ótica de quem clicou** (companyId da sessão, nunca do body).
- Confirmação: **AlertDialog** antes de enviar (envia mensagens reais — evita
  disparo acidental quando óticas reais usarem).
- Feedback: **resumo por tipo** (enviadas/puladas/falharam) + **refresh
  automático** do Histórico.
- Prévia / modo "simular sem enviar": **fora do escopo** (fase seguinte).

## Componentes

### 1. Motor — `src/services/whatsapp-automation.service.ts`

Adicionar parâmetro opcional para limitar a varredura a uma ótica:

```ts
runWhatsappAutomations(now: Date = new Date(), options?: { companyId?: string })
```

- Sem `companyId` → comportamento **idêntico ao de hoje** (o cron das 9h não muda).
- Com `companyId` → o `whatsappConnection.findMany({ where: { status: "CONNECTED" } })`
  passa a `{ status: "CONNECTED", companyId }`.

Mudança aditiva, ~3 linhas. Não altera idempotência nem o cron existente.

### 2. Endpoint — `POST /api/whatsapp/run-now/route.ts`

Mesmo padrão de `src/app/api/whatsapp/automations/route.ts`:

- `const companyId = await getCompanyId();` — escopo da sessão (**nunca do body**).
- `await requirePermission("settings.edit");`
- `if (!isWhatsappEnabledForCompany(companyId)) throw forbiddenError(...)`.
- `const result = await runWhatsappAutomations(new Date(), { companyId });`
- Retorna `{ success: true, data: { sent, skipped, failed, byType } }`.
- `handleApiError` no catch.

### 3. UI

**`whatsapp-automations-client.tsx`** — card "Disparar mensagens agora" no topo:

- Botão "Processar agora" → abre `AlertDialog` (componente já existe em
  `src/components/ui/alert-dialog.tsx`).
- Texto do diálogo: "Isso vai enviar imediatamente todas as mensagens pendentes
  de hoje … Mensagens já enviadas hoje não são repetidas."
- Confirma → estado `running` (botão desabilitado + `Loader2`), anti-duplo-clique.
- `POST /api/whatsapp/run-now` → `toast` com resumo por tipo. Caso
  `sent === 0 && skipped === 0` → toast informativo "Nada pendente para enviar
  agora." (evita falsa impressão de erro).
- Recebe uma prop `onProcessed?: () => void` chamada no sucesso, para o pai
  incrementar o `refreshKey`.

**`page.tsx`** — eleva `refreshKey` (useState) passado ao `WhatsappHistoryClient`;
`onProcessed` do automations-client incrementa a chave → Histórico recarrega
automaticamente mesmo já montado.

**`whatsapp-history-client.tsx`** — aceita prop `refreshKey` no `useEffect` de
recarga (recarrega quando muda).

## Segurança

- `companyId` sempre da sessão (`getCompanyId()`), nunca do request body → uma
  ótica não dispara envios de outra.
- Mesma permissão (`settings.edit`) e flag (`isWhatsappEnabledForCompany`) que já
  protegem a tela e os outros endpoints WhatsApp.
- O motor (`sendWhatsappMessage`) já faz todas as checagens finais
  (conexão/consentimento/telefone/dedupe) e nunca lança.

## Testes

- Unit do motor: `runWhatsappAutomations(now, { companyId })` varre **só** aquela
  ótica (não toca em outra conectada). Mantém os testes existentes verdes (sem
  `companyId` = comportamento atual).
- Validação: `tsc --noEmit` + suíte de testes + `next build`.

## Fora de escopo (fase seguinte)

- Prévia / modo "simular sem enviar" (listar o que sairia sem enviar).
- Seleção item-a-item de quais mensagens disparar.

## Disciplina

Branch própria a partir da `main`, tudo aditivo, validar, **PARAR antes do
deploy** (o dono decide quando subir).
