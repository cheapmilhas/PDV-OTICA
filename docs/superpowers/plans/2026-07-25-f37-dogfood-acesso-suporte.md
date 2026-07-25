# F3.7 — Roteiro do dogfood: acesso de suporte por código

**Data:** 2026-07-25
**Escopo:** validar o CAMINHO FELIZ ponta a ponta em produção, com cliente sintético.
**Decisão do dono:** testar em prod com um cliente de teste (ex.: "Atacadão"), sem injeção de falha.

## O que este dogfood prova (e o que não prova)

**Prova:** que o fluxo real funciona de ponta a ponta no ambiente que importa — o cliente
gera o código, o operador resgata, entra, lê, é BARRADO ao escrever, o cliente corta o
acesso, e a trilha registra tudo dos dois lados.

**NÃO prova:** rollback quando a emissão falha, cascade de FK, corrida entre ativar e
revogar, corte dentro do cookieCache de 5min, partial unique indexes. Isso exige banco
descartável e **fica pendente** — o `TEST_DATABASE_URL` do Domus (ep-dawn-haze) está com
credencial inválida. A costura lógica desses pontos está coberta em
`tests/vis-support/e2e-costura.test.ts` (fakes), que é explícito sobre o próprio limite.

## Pré-requisitos (fazer ANTES, na ordem)

1. **Flag ligada no Domus:** `VIS_SUPPORT_ACCESS_ENABLED=true` no projeto Vercel do Domus.
   Sem ela o endpoint responde `503 not_enabled` — fail-closed de propósito, e **sem
   consumir o código** (o cliente não perde a autorização).
2. **Segredo do canal nos DOIS lados, com o MESMO valor:** `VIS_DOMUS_SUPPORT_SECRET`
   no Vis e no Domus. É segredo PRÓPRIO do canal de suporte — não reusar o do
   provisionamento (`VIS_DOMUS_PROVISION_SECRET`): o ponto é limitar o raio de um vazamento.
3. **`BETTER_AUTH_URL` setado no Domus.** Se faltar, o link de ativação sai RELATIVO; o
   Vis agora rejeita isso e classifica como recuperável, mas o resgate falha à toa.
4. **Cliente sintético provisionado:** empresa medical no super admin do Vis, com
   `domusClinicId` preenchido e provisionamento concluído. Dado 100% fabricado.
5. **Deploy das branches:** Vis `feat/vis-support-f36` e Domus `feat/vis-support-f33`
   (esta contém o fix P0 `ebc6dfb`). Sem o fix, uma falha de emissão queima o código do cliente.

## Roteiro (executar na ordem; cada passo tem um resultado esperado)

### 1. Cliente gera o código (lado Domus, logado como admin da clínica sintética)
- Ir na tela de acesso de suporte do Domus.
- Gerar o código. **Esperado:** código no formato `XXXXX-XXXXX`, exibido UMA vez, com contagem regressiva (TTL 15min).
- ✅ Critério: o código aparece; a tela avisa que não será mostrado de novo.

### 2. Operador resgata (lado Vis, super admin → detalhe do cliente → aba "Clínica")
- Colar o código no card "Acesso de suporte" e clicar em Resgatar.
- **Esperado:** volta um link de ativação absoluto (`https://.../suporte/ativar#t=...`).
- ✅ Critério: link recebido, e o campo do código é limpo (é single-use).

### 3. Operador entra
- Abrir o link (uso único, validade curta).
- **Esperado:** sessão de suporte aberta na clínica; banner "Suporte Vis conectado" visível para o cliente.
- ✅ Critério: entrou na clínica certa (a do Atacadão), e não em outra.

### 4. Leitura funciona
- Navegar por telas de leitura (lista de pacientes, agenda).
- ✅ Critério: consegue VER o que precisa para diagnosticar.

### 5. 🔒 Escrita é BARRADA (o teste mais importante)
- Tentar salvar qualquer alteração: editar cadastro, criar agendamento, subir arquivo.
- ✅ Critério: **toda** tentativa é negada. Se ALGO salvar, PARE o dogfood e me avise —
  v1 é só-leitura e uma escrita que passa é falha de segurança, não bug de UI.

### 6. Cliente corta o acesso (kill-switch)
- Como admin da clínica, clicar em encerrar o acesso de suporte.
- ✅ Critério: o operador perde o acesso **na hora** (não em 5 minutos — o cookieCache
  não pode mascarar a revogação). Recarregar a tela do operador deve cair para fora.

### 7. Trilha (o que você pediu)
- **No Domus:** tela "Acessos de suporte" do cliente. Esperado, em ordem:
  `code_generated → code_redeemed → token_issued → session_activated → session_revoked`.
- **No Vis:** `/admin/configuracoes/logs`, filtrar por empresa. Esperado:
  "Acesso de suporte concedido".
- ✅ Critério: os dois lados contam a MESMA história, e o `supportGrantId` é o mesmo.

### 8. Código não serve duas vezes
- Tentar resgatar o MESMO código de novo no Vis.
- ✅ Critério: recusa com "Código inválido, expirado ou já utilizado. Peça um novo ao cliente."

## Se algo falhar

- **"Não foi possível falar com o sistema Medical"** → segredo/URL divergente entre os
  lados, ou flag desligada. O código do cliente **continua válido**: corrigir e retentar.
- **"Falha na comunicação segura… NÃO peça outro código"** → configuração do canal (HMAC).
  O código não foi gasto.
- **Alguma escrita passou** → falha de segurança. Parar, anotar exatamente qual tela e
  qual ação, e reportar.

## Pendências que este dogfood NÃO resolve

- Casos de falha (rollback, concorrência, expiração forçada) — dependem de credencial de
  banco de teste válida.
- Expiração absoluta de 60min: só observável esperando 1h; não faz parte do caminho feliz.
