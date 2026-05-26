# 🚨 Runbook — Resposta a Incidente de Segurança

**Versão**: 1.0 · **Última revisão**: 2026-05-25
**Aplica-se a**: vazamento de dados, comprometimento de sessão/credenciais, indisponibilidade prolongada, exploração ativa de vulnerabilidade.

---

## 1. Detecção (quem identifica)

Disparadores que devem acionar este runbook:

- Alerta automático: Sentry com pico de erros 500 ou exceções não tratadas em rotas de auth.
- PostHog: queda anormal de signups ou comportamento estatisticamente inviável (bots, scraping).
- Cliente abre ticket reportando "vi dados de outra empresa", "minha senha não funciona", "fizeram venda no meu nome".
- Log de admin (`GlobalAudit`) com ação suspeita não programada.
- Comunicação externa: ANPD, GitHub Security Advisory, pesquisador de segurança, autoridade pública.
- Monitoramento manual: revisão semanal de `console.error` agregados.

**Responsável pela detecção**: qualquer pessoa do time. Quem detecta abre canal `#incidente-<data>` no Slack/WhatsApp e segue para a Seção 2.

---

## 2. Avaliação inicial (30 minutos)

| Pergunta | Como responder |
|---|---|
| Há dado pessoal exposto? | Olhar logs do endpoint comprometido e amostragem de queries. |
| Há dado sensível (receita médica, CPF)? | Confere modelo afetado: `PrescriptionValues`, `Customer`. |
| Qual o escopo: 1 cliente ou multi-tenant? | Verificar se `companyId` foi bypassado. |
| Risco relevante a direitos do titular? | Se afeta saúde/financeiro → SIM. |
| Vulnerabilidade ainda explorável? | Reproduzir em staging. |

**Classificação**:
- **P0** — vazamento ativo, multi-tenant, dado sensível → notificar ANPD em 3 dias úteis.
- **P1** — vulnerabilidade reproduzível, sem exploração confirmada → fix em 48h.
- **P2** — risco potencial, sem exploração → fix no próximo sprint.

---

## 3. Contenção imediata (1-2 horas)

Em ordem:

1. **Isolar o vetor**:
   - Endpoint comprometido → desabilitar rota via deploy de hotfix (retornar 503).
   - Conta/sessão comprometida → revogar todas as sessões: invalidar `NEXTAUTH_SECRET` (rotação) e forçar logout global.
   - Vazamento de credencial em log → rotacionar todos os secrets (`AUTH_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, etc.).

2. **Preservar evidência**:
   - Backup imediato do banco (snapshot Neon).
   - Export dos logs de Vercel das últimas 48h (`vercel logs --since 48h`).
   - Capturar logs de impersonation (`GlobalAudit` onde `action LIKE 'impersonate%'`).

3. **Comunicação interna**:
   - Avisar todo o time no canal de incidente.
   - Pausar todos os deploys não relacionados ao fix.

---

## 4. Notificação à ANPD (P0 apenas)

**Prazo**: razoável após detecção, regulamentação ANPD orienta **3 dias úteis** para incidentes que envolvem risco relevante a direitos do titular. Dado sensível (saúde) presume-se risco relevante.

**Canal**: Portal ANPD → Comunicado de Incidente de Segurança (CIS).
URL: <https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis>

**Template do comunicado** (preencher os campos no portal):

```
1. Identificação do controlador/operador
   - Razão social: [empresa do contratante]
   - CNPJ: [CNPJ]
   - Contato DPO: dpo@pdvotica.com.br

2. Descrição do incidente
   - Data/hora da ocorrência: [estimada]
   - Data/hora da ciência: [exata]
   - Natureza: [vazamento / acesso indevido / indisponibilidade / etc.]
   - Vetor: [vulnerabilidade técnica / phishing / insider / etc.]

3. Dados afetados
   - Categorias: [identificação, contato, saúde — receita oftalmológica, financeiro]
   - Volume: [n titulares afetados, n registros]
   - Sensibilidade: [LGPD Art. 11 — dados de saúde] (se aplicável)

4. Medidas adotadas
   - Contenção: [descrever]
   - Comunicação a titulares: [prevista para X dias]
   - Medidas técnicas de mitigação: [rotação de secrets, patch, etc.]

5. Riscos para os titulares
   - [Avaliar concretamente: fraude, discriminação, exposição médica, etc.]
```

---

## 5. Comunicação aos titulares (P0)

**Quando**: junto com ou antes da notificação à ANPD, conforme orientação do DPO.

**Canais**:
- E-mail para usuários afetados (template abaixo).
- Banner persistente no dashboard até resolução.
- Página pública de status: <https://status.pdvotica.com.br>

**Template de e-mail**:

```
Assunto: Comunicado importante sobre a segurança dos seus dados

Olá [Nome],

No dia [data], identificamos um incidente de segurança que afetou parte
dos dados armazenados na PDV Ótica. Sua conta pode estar entre as afetadas.

O que aconteceu
[descrição factual, sem jargão técnico, sem minimizar]

Quais dados foram afetados
[lista clara: nome, telefone, CPF, receita oftalmológica, etc.]

O que já fizemos
- Corrigimos a vulnerabilidade em [data].
- Revogamos todas as sessões e exigimos nova senha.
- Notificamos a ANPD em [data].
- Iniciamos auditoria independente.

O que recomendamos a você
- Troque sua senha agora: [link]
- Fique atento a mensagens suspeitas em seu nome.
- Em caso de dúvida, escreva para dpo@pdvotica.com.br.

Nosso compromisso
Levamos a sério a sua confiança. Vamos publicar um post-mortem técnico
em até 30 dias com todas as medidas implementadas.

Equipe PDV Ótica
```

---

## 6. Rotação de credenciais

Em qualquer P0 ou P1 envolvendo auth, rotacionar:

- [ ] `AUTH_SECRET` / `NEXTAUTH_SECRET` (Vercel env, ambiente production)
- [ ] `DATABASE_URL` (Neon → rotacionar password do role aplicacional)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Asaas API key (quando integrado)
- [ ] Sessões NextAuth (consequência automática da rotação de `AUTH_SECRET`)

**Importante**: rotação de `AUTH_SECRET` desloga todos os usuários ativos. Aceitar esse custo em P0.

---

## 7. Pós-incidente (1-2 semanas)

- [ ] Post-mortem público (Markdown em docs/postmortem/YYYY-MM-DD.md) seguindo formato: cronologia, causa raiz, impacto, correções, prevenção.
- [ ] Atualizar este runbook com lições aprendidas.
- [ ] Adicionar teste automatizado para o cenário do bug.
- [ ] Revisar permissões/acessos relacionados.
- [ ] Comunicação de encerramento aos titulares e à ANPD.

---

## 8. Contatos

| Papel | Contato |
|---|---|
| DPO / Encarregado LGPD | dpo@pdvotica.com.br |
| Engenheiro on-call | (preencher) |
| Suporte ao cliente | suporte@pdvotica.com.br |
| Jurídico | (preencher) |
| ANPD — canal CIS | https://www.gov.br/anpd |
| Neon (DB) | https://console.neon.tech → Support |
| Vercel | https://vercel.com/help |

---

## 9. Histórico de incidentes

| Data | Severidade | Descrição | Postmortem |
|---|---|---|---|
| _vazio_ | — | — | — |
