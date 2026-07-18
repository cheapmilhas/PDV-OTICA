# P3 — Assinatura sai de `usersTable.plan` → clínica, com o Vis como fonte de verdade

**Status:** aguardando aprovação do dono
**Data:** 2026-07-17
**Risco:** ALTO (cobrança + 2 bancos + produto clínico com 116 pacientes reais)
**Método:** meu plano + plano independente do Codex, sintetizados. As divergências foram resolvidas **medindo o banco**, não discutindo.

---

## O que a medição mudou

Antes de planejar, medi o banco de produção do Domus. Três achados redefiniram a tarefa:

**1. Não há gating para migrar.** `users.plan` é `NULL` em 17/17 usuários e não bloqueia nada — nem middleware (`src/middleware.ts:5` só vê cookie), nem o HOC (`with-authentication.tsx:13`), nem o action client (`next-safe-action.ts:32`). O único leitor é um badge na tela `/subscription`. **O P3 não é mover um bloqueio: é construir o primeiro.** O nome da tarefa mentia.

**2. Há uma bomba armada no Stripe.** O botão "Assinar agora" está vivo e alcançável por URL (`/subscription`), chama `createStripeCheckout` (`actions/create-stripe-checkout/index.ts:11`) — e o webhook não fecha o ciclo: o checkout manda `client_reference_id` (:19), o webhook lê `subscription.metadata.userId` (`api/stripe/webhook/route.ts:46`), que nunca é setado. **Alguém pode pagar e o sistema não registrar.** Corrigi minha própria leitura aqui: eu havia concluído "Stripe é código órfão, pode morrer"; o Codex provou que está vivo, e que matar só o webhook **piora** (deixa o botão cobrando sem processar).

**3. O maior risco do plano do Codex não existe.** Ele apontou que `auth.ts:42` escolhe `clinics[0]` sem ordenação — com usuário multi-clínica, o entitlement cairia na clínica errada. Medi: **zero usuários com mais de um vínculo**, e a clínica real é inequívoca:

| clínica | pacientes | agendamentos | users |
|---|---|---|---|
| **Domus Saude** (`7110db1b`) | **116** | **190** | 11 |
| Clínica Domus Saúde (`790d21c1`) | 0 | 0 | 1 |
| Clínica Domus Saúde (`42600503`) | 0 | 0 | 0 |

O risco era real como raciocínio e está **desarmado como fato**. Isso permite cortar a complexidade de `activeClinicId` deste plano.

---

## Contrato Vis → Domus

**Escolha: espelho local no Domus, alimentado por webhook assinado, reparado por pull diário.**

No **Vis** (`Company`): `domusClinicId String? @unique` — só preenchível quando `platformProduct = VIS_MEDICAL`.

No **Domus**, tabela nova `clinic_entitlements` (PK = FK `clinics.id`, 1:1 — é isto que significa "a assinatura mora na clínica"):

```
clinic_id            uuid PK FK clinics.id
vis_company_id       text UNIQUE NOT NULL
subscription_status  text NOT NULL      -- exibição
write_allowed        boolean NOT NULL   -- a DECISÃO, calculada pelo Vis
decision_reason      text NOT NULL
source_updated_at    timestamptz NOT NULL
synced_at            timestamptz NOT NULL
deny_verified_until  timestamptz NULL
last_event_id        text NULL
```

Mais `vis_entitlement_events` (`event_id` PK) para idempotência.

**O Vis decide, o Domus executa.** O payload carrega `entitlement.writeAllowed` já calculado pela regra canônica do Vis. O Domus **não** replica trial/dunning/reconciliação — os 8 campos de estado da `Subscription` continuam com um dono só. Espelhar os 8 campos seria criar a segunda implementação das regras de cobrança, que é exatamente o que a forja apontou como golpe fatal em C e D.

**Por que não as alternativas:** só webhook (entrega não garantida → Domus congela em estado velho); pull a cada request (toda escrita clínica vira chamada remota); claim no JWT (sessão better-auth dura 7 dias com cache de cookie → claim obsoleto, e não cobre público/token/cron).

**Segurança do webhook:** HMAC SHA-256 sobre `timestamp + "." + rawBody`, rejeitando timestamp > 5min, assinatura inválida, `platformProduct != VIS_MEDICAL`, `companyId` divergente do vínculo gravado, remapeamento de clínica, e snapshot mais velho que `source_updated_at`.

---

## Quando a sincronização falha: **fail-open**

> O Domus só bloqueia escrita quando confirma uma decisão explícita e recente de bloqueio. Ausência, erro ou incerteza **libera** e alerta.

Esta é a pergunta que a forja deixou em aberto ("corta acesso de quem pagou, ou libera de graça?"). A resposta é liberar, e a razão não é técnica: uso indevido por algumas horas é reversível — dinheiro se cobra depois. Impedir um médico de registrar um atendimento por falha de integração não é reversível, e num sistema sob CFM 1.821 é risco clínico e jurídico. A assimetria decide.

Com um detalhe que evita o outro extremo (manter bloqueado quem acabou de pagar): quando o espelho diz `write_allowed=false` e o `deny_verified_until` já venceu, o Domus faz **um** pull curto ao Vis antes de responder 403. Confirmou bloqueio, renova por 5 min e bloqueia; Vis fora do ar ou timeout, **libera e alerta**. Assim o caminho feliz nunca depende do Vis em request-time — só uma clínica já bloqueada revalida.

Acompanham: kill switch global (`ENFORCE_VIS_ENTITLEMENTS=false`), bypass por clínica para emergência, e alerta quando `synced_at` passar de 24h.

---

## Onde o Domus bloqueia escrita

**Não** em `protectedWithClinicActionClient` — ele atende muita **leitura** de prontuário, e cobrança ali violaria a restrição dura (CFM 1.821: vencimento bloqueia escrita, nunca leitura).

Política central única — `assertClinicWriteAllowed(clinicId)` em `src/lib/billing/` — conectada a clientes derivados de escrita (`clinicWriteActionClient` etc.). Leitura continua nos clientes atuais, intocada.

Os bypasses que o Codex inventariou e eu confirmei precisam de conexão explícita:

- **Agendamento público** (`add-public-appointment/index.ts:107`): guard antes de criar paciente/agendamento. `available-times` é leitura, continua.
- **APIs por token** (`api/tv-panel/[token]/complete/route.ts:55`): guard após resolver o token → `clinicId`.
- **Crons**: decisão *por item*, nunca abortando o batch. Bloqueia o que gera serviço novo (lembretes); **continua** o que é integridade ou obrigação legal sobre dado já produzido (cadeia do ponto, NSR, fechamento de sessão).
- **Seed na renderização** (`clinic-settings/page.tsx:202`): sai da renderização de qualquer jeito — uma página GET não deveria criar especialidades e convênios. Vira provisionamento idempotente.

**Teste de arquitetura** que inventaria actions com `insert/update/delete`, rotas `POST/PUT/PATCH/DELETE`, GETs que escrevem, crons e rotas por token, exigindo classificação explícita (`BILLABLE_WRITE` / `SYSTEM_MAINTENANCE` / `SECURITY_WRITE` / `READ`). Sem isso, a próxima action nasce sem gate — é a classe de bug que se repete sozinha.

---

## Ordem de execução

**Commit 1 — desarmar o Stripe (antes de tudo).** Tirar o "Assinar agora" e fazer `createStripeCheckout` falhar explícito ("contratação gerenciada pela operadora"). Pequeno, isolado, reversível, e impede que alguém pague sem receber. **O webhook fica de pé por ora** — desligar só o botão para novas cobranças; o webhook é a única coisa que processaria uma assinatura já existente.

⚠️ **Antes disso, conferir o painel do Stripe.** Os zeros no banco do Domus não provam que o Stripe nunca cobrou — provam que o Domus nunca registrou. É exatamente o que o vínculo quebrado produziria. Se houver assinatura ativa lá, há alguém pagando por um sistema que não sabe disso. **Isso é do dono** (também: as chaves na Vercel são `sk_test` ou `sk_live`? Não consigo ver — `env pull` mascara Sensitive).

**Commit 2 — schemas aditivos.** `Company.domusClinicId` no Vis; `clinic_entitlements` + `vis_entitlement_events` no Domus. Nullable, sem gate ativo, sem remover nada. Reversível.

**Commit 3 — mapear identidade.** Vincular `Company` ↔ `7110db1b` (Domus Saude) manualmente, **nunca por nome**. As duas clínicas vazias ficam sem mapeamento e **sem exclusão**.

**Commit 4 — contrato em shadow mode.** Projetor + endpoint de pull no Vis, webhook receptor + cron diário no Domus. Publica em: evento Asaas, dunning, fim de trial, cancelamento, ação do super admin. Nenhum bloqueio ainda.

**Commit 5 — guard em observação.** Conectar tudo com `enforcement=false`: registra `WOULD_BLOCK` e permite. Rodar dias, confirmar que nenhuma leitura foi classificada como escrita e que nenhuma clínica legítima seria bloqueada.

**Commit 6 — ligar.** Clínica de teste primeiro, depois a real. Kill switch pronto antes. Exercitar: ACTIVE, PAST_DUE, pagamento após suspensão, Vis fora do ar, snapshot ausente.

**Commit 7 — limpeza.** Só com o fluxo estável: remover Stripe inteiro (action, componentes, webhook, envs), remover `plan`/`stripe_*` do schema e do better-auth, `/subscription` passa a ler `clinic_entitlements`. **A remoção de coluna é o único passo pouco reversível — por isso é o último**, com pelo menos um deploy sem leitores antes.

---

## Corte de escopo consciente

Fora deste plano: unificar bancos/ORMs · mover qualquer prontuário · SSO/migração de identidade · fila de eventos · duplicar dunning no Domus · gating por feature (começa binário: escreve ou não) · apagar/mesclar as clínicas duplicadas · abrir `/registro` para médicos (hoje provisiona `VIS_APP` + finance de ótica — é fatia da Fase 1) · qualquer tentativa de bloquear leitura/export de prontuário.

Também **não** faço `activeClinicId`/switcher agora: a medição mostrou zero usuários multi-clínica. Se aparecer o primeiro, isso volta a ser pré-requisito **antes** do enforcement.

---

## Onde eu e o Codex divergimos

| Ponto | Eu | Codex | Resolução |
|---|---|---|---|
| Stripe é órfão? | "morto, pode apagar" | "vivo e alcançável; matar só o webhook piora" | **Codex certo** — verifiquei o botão e a action. Virou o Commit 1. |
| Maior risco | webhook perdido | `clinics[0]` + clínicas duplicadas → bloquear a clínica errada | **Codex certo no raciocínio, mas medi: risco não existe hoje** (0 multi-clínica). Corta escopo. |
| Guard no action client | — | não colocar no `protectedWithClinicActionClient` (atende leitura) | Aceito — é o que protege a restrição do CFM. |

---

## Verificação (ponta a ponta)

Assinatura muda no Vis → webhook chega no Domus (replay rejeitado, evento fora de ordem rejeitado) → `clinic_entitlements` reflete → escrita clínica bloqueada com `SUBSCRIPTION_WRITE_BLOCKED` → **leitura de prontuário continua funcionando** → pagamento libera em ≤5 min → **Vis fora do ar: escrita permitida + alerta** (fail-open) → kill switch destrava tudo.
