# Vis Medical — Fluxo de atendimento igual ou melhor que o Domus

> **Status: AGUARDANDO APROVAÇÃO DO DONO.**
> Origem: pedido do dono ("quero um fluxo de atendimento igual ou melhor que o do Domus", 2026-07-16), mapeamento comparativo Domus × Vis por leitura de código, e revisão adversarial do Codex (fase plano).
> **Reordena** o roadmap `2026-07-16-vis-medical-roadmap-melhorias-domus.md`, que colocava timeline (F1) antes de velocidade (F2). Aquele roadmap continua válido do F4 em diante.
> Regra do jogo: Domus é mina de requisitos, nunca port de código.

---

## 0. A meta, em número

O Domus fecha um atendimento em **~4 cliques**: Chamar → Duplicar → Finalizar → fechar diálogo.
O Vis hoje: **~9-10 cliques** e **é impossível assinar** — não existe o botão.

"Igual ou melhor" = **bater os ~4 cliques** e ganhar onde o Domus não tem como competir:
refração **tipada e comparável** (o Domus é texto livre — nunca terá evolução de grau) e
`issuerSnapshot` **congelado** (o Domus reimprime com dado vivo: CRM muda → documento antigo sai adulterado).

---

## 1. Por que integridade vem antes de velocidade

Três achados **confirmados no código** (Codex na fase plano; conferidos por mim linha a linha).
Os dois primeiros seriam **causados** pelo plano ingênuo; o terceiro **já existe hoje**.

### 1.1 O `PATCH` é overwrite total, não merge — perda de dado clínico
`src/app/api/clinical/encounters/[id]/route.ts:74-83` monta o payload com `body.campo ?? null`.
**Campo omitido vira `null`.** Um auto-save de campo parcial apagaria os outros oito campos do SOAP.

### 1.2 `sign: true` retorna ANTES de salvar — assinatura de conteúdo velho
`route.ts:44-47` — ao detectar `body.sign`, chama `signEncounter` e retorna imediatamente.
Um botão "salvar e assinar" numa requisição só **assinaria o texto antigo**, descartando o que o médico
acabou de digitar. Assinatura é **irreversível** (não há unsign; `encounter.service.ts:15-19` só manda
criar retificação). Armadilha médico-legal.

### 1.3 `signEncounter` tem corrida read-then-update — **bug já presente no worktree**
`src/services/encounter.service.ts:202-216`: lê o status (l.202), valida (l.207), escreve (l.209) —
**sem condição atômica na escrita**. `createOrUpdateEncounter` (`:134-161`) tem a mesma janela.
Sequência possível: auto-save lê `OPEN` → assinatura grava `SIGNED` → auto-save escreve **por cima do
prontuário já assinado**. Viola o princípio nº 3 (imutabilidade clínica).
Hoje não se manifesta porque não há botão de assinar nem auto-save concorrente — **a Fase A ligaria
exatamente as duas peças que acordam o bug**.

> Conclusão: velocidade sem integridade = prontuário assinado errado, com paciente na sala.
> As correções são pequenas (o backend está quase todo pago). Custa uma fatia, não um mês.

---

## 2. Correções ao meu próprio diagnóstico (registro honesto)

- **Rascunho por usuário já existe.** Reportei ao dono que dois profissionais no mesmo aparelho se
  sobrescreveriam. **Errado.** `atendimento-client.tsx:110` chaveia `${userId}:${encounter.id}` —
  o caller faz o que o hook não faz. Retirado.
- **`listPatientEncounters` NÃO serve para duplicar.** `clinical-history.service.ts:18-31` seleciona só
  `chiefComplaint` e `diagnosis`, ordena por `createdAt` e não filtra assinados. Duplicar exige service novo.

---

## 3. Decisões do dono (travadas)

1. **Duplicar copia TUDO** (como o Domus), **não** só antecedentes/medicações.
   Rejeitado o meio-termo do Codex: bloquear diagnóstico faz o campo mais importante do retorno nascer
   vazio → o médico redigita sempre → para de usar o botão → feature morre. O dono atende com o Domus
   (que copia 10 campos) e "não tem nada a xingar nele" — evidência de campo real.
2. **Onde ganhamos do Domus:** campo copiado nasce **marcado** ("copiado da consulta de DD/MM — confira"),
   marca some ao tocar no campo. Endereça a inércia clínica sem custar clique. O Domus copia e não avisa.
3. **Ordem:** integridade → velocidade → timeline.

---

## FASE A — Integridade do ciclo (pré-condição, ~1 fatia)

**Nada de velocidade entra antes disto.** Sem UI nova relevante; é o alicerce.

**Escopo:**
- **`PATCH` vira merge parcial de verdade:** só grava as chaves presentes no body
  (`Object.hasOwn`/schema `.partial()`), nunca `?? null` em campo ausente. Distinguir "não enviei"
  de "limpei o campo" (envio explícito de `null`).
- **Assinatura atômica:** `signEncounter` passa a escrever condicionalmente —
  `updateMany({ where: { id, companyId, status: "OPEN" }, ... })` e trata `count === 0` como
  "já assinado/não editável" (erro de regra de negócio, não 500). Mesmo tratamento no write de
  `createOrUpdateEncounter`: condicionar a `status = OPEN` **na própria escrita**.
- **Optimistic locking:** `Encounter.updatedAt` já existe (`@updatedAt`, schema l.~1446).
  Cliente manda `expectedUpdatedAt`; divergência → 409 com "este atendimento mudou em outro
  dispositivo" (sem last-write-wins silencioso).
- **Finalizar = 1 operação transacional no servidor:** rota/service que, em `$transaction`,
  salva SOAP + refração **e** assina — condicional a `OPEN`. Fim do `sign:true` que retorna cedo
  (`route.ts:44-47`) e das 3 requisições sequenciais não-atômicas.
- **Ownership:** hoje PATCH e assinatura exigem só `clinical.encounter.create` e **não** repetem a regra
  de proprietário que a leitura aplica (`encounter.service.ts:235-243`). Alinhar: quem não realizou o
  atendimento (nem é o médico/admin) não edita nem assina. **Achado real do Codex.**
- **Auto-save no servidor a cada ~30s** (padrão Domus), condicionado a `signedAt IS NULL`, com guard de
  reentrada. **localStorage permanece como fallback offline** — não é "trocar", é somar
  (correção do Codex aceita). Migração dos rascunhos locais órfãos: detectar chave existente,
  comparar com o servidor, oferecer "recuperar/descartar", só limpar após confirmação do servidor.
- **Botão Assinar na UI** com revisão final: mostra pendências + autor + aviso de irreversibilidade.

**Migrations:** nenhuma. **Testes:** corrida (auto-save em voo vs. assinatura) deve falhar com erro,
não gravar; merge parcial não pode zerar campo ausente; finalizar incompleto não assina.

---

## FASE B — Velocidade: bater os 4 cliques (~1-2 fatias)

- **Duplicar última consulta assinada:** service novo (o existente não serve, ver §2), escopado
  `companyId + customerId`, filtrando `status = SIGNED`, ordenando por **`signedAt`** (não `createdAt`),
  trazendo os 10 campos. Botão só aparece em atendimento novo e vazio (padrão Domus). Campos copiados
  nascem **marcados** (§3.2).
- **Snippets `#`:** tabela `TextSnippet` (`companyId, userId?, shortcut, body`), expansão nos textareas
  clínicos (Enter/Tab aplica, Esc fecha), CRUD em configurações.
- **Grau anterior visível no atendimento** — hoje **bloqueado de propósito**
  (`services/clinical-customer-context.service.ts:28`: "NÃO enviar os graus (values) ao browser").
  Meio-termo do Codex **aceito**: botão "Ver última refração" sob demanda, só para profissional
  autorizado em encounter ativo, busca só a última assinada/vigente, e **grava `CustomerAccessLog`**
  (a rota já loga leitura). Minimização = adequação à finalidade, e comparar refração é finalidade
  assistencial legítima. **Decisão do dono.**
- **Check-in de zero clique** (padrão Domus `attend/page.tsx:104-140`): abrir a URL do atendimento move
  `AGUARDANDO → EM_ATENDIMENTO` e grava início, **em transação**. `checkedInAt` e o status já existem
  no schema — é barato. Só para quem tem o gate clínico; nunca por GET de terceiro.
- **Atrito fino:** `autoFocus` no primeiro campo, tab-order. (O Domus não tem — ganho fácil.)

**Migrations:** 1 tabela nova (`TextSnippet`), aditiva.

---

## FASE C — Ver: timeline + comparativo (~1-2 fatias)

Conforme o roadmap original (F1 de lá), **agora com alicerce**: só lê encounters assinados — que a
Fase A finalmente permite existir.
**Ressalva do Codex aceita:** equivalente esférico sozinho **esconde cilindro e eixo**. O comparativo
mostra esf/cil/eixo por olho; o equivalente esférico é uma linha derivada, não a única.

---

## Verificação (toda fase)

- `tsc` zero + suíte completa verde (hoje ~2621; cada fase soma).
- Review adversarial do Codex (máx. 2 rodadas); achado real corrigido, falso-positivo rejeitado
  com justificativa escrita.
- Dogfood do dono antes de fechar a fase.
- **Nada em produção sem OK explícito.** Migração aplicada à mão, com aprovação.

## Pré-requisito operacional (independente das fases)

Merge do worktree `feat/vis-medical-clinico-f1` (**59 commits, 93 arquivos, +14.2k linhas** — não 4,
como dizia o roadmap antigo):
- Conflito **real** em `src/components/layout/mobile-nav.tsx` (main `8cb24aa3` 44px × F1 nav por produto).
  Resolver preservando as duas intenções.
- Rebase sobre a main (22 commits de drift) + rodar a suíte — nunca rodou com os dois lados juntos.
- **Migrações:** as 3 do F1 **não constam** em `_prisma_migrations`, mas o DDL **está aplicado** no banco.
  Conferi tabela/coluna/índice/FK (inclusive delete-rules e o parcial `no_double_booking`): **bate com
  os `.sql`**. Regularizar com `migrate resolve --applied` (com OK do dono) — senão `migrate deploy`
  falha em "objeto já existe".
- Limpar seed `vismed-dev-*` pós-dogfood.
- `feat/vis-medical-f0` **já está na main** — worktree pode ser removido.
