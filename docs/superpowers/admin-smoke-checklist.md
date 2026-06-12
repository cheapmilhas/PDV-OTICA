# Admin Smoke Checklist (oráculo de regressão)

Rodar ao fim de cada lote de migração, nas rotas afetadas. Marcar como concluído só se o comportamento for **IDÊNTICO** ao anterior — mesmos dados carregam, mesmos filtros filtram, mesmos botões/modais funcionam. O tema muda; o comportamento não.

> **Login** (`/admin/login`) — fora do escopo do redesign de shell. Verificar somente se a rota de autenticação em si for modificada.

---

## Principal

### /admin (dashboard)

- [ ] Página carrega sem erro 500 (sem acesso não-admin redireciona para login).
- [ ] 5 KPI cards exibem valores numéricos: "Total de Empresas", "Assinaturas Ativas", "MRR" (formato R$ x.xxx,xx), "Em Trial" e "Recebido Total".
- [ ] KPI "Total de Empresas" exibe seta de tendência (▲ ou ▼) com rótulo "novas no mês".
- [ ] KPI "Recebido Total" exibe seta de tendência "recebido no mês vs. anterior".
- [ ] Botão "Recalcular saúde" está visível no canto superior direito.
- [ ] Texto "Saúde atualizada em..." (ou "Saúde ainda não calculada") aparece abaixo do botão.
- [ ] Seção "Ações Pendentes" exibe ao menos um dos cards: inadimplentes (vermelho), trials expirando (amarelo), faturas a vencer (azul) — ou mensagem "Nenhuma ação pendente".
- [ ] Card de inadimplentes é um link navegável para `/admin/financeiro/inadimplencia`.
- [ ] Card de trials expirando é um link para `/admin/clientes?status=TRIAL`.
- [ ] Card de faturas a vencer é um link para `/admin/financeiro/faturas?status=PENDING`.
- [ ] Tabela "Empresas Recentes" exibe até 10 linhas com colunas: Empresa (link), Plano, Status (badge colorido), Usuários, Cadastro.
- [ ] Clicar no nome de uma empresa na tabela navega para `/admin/clientes/[id]`.
- [ ] Link "Ver todas →" navega para `/admin/clientes`.
- [ ] Cards de health (Crítico/Em Risco) aparecem somente se houver empresas nessas categorias; clique navega para `/admin/saude?category=CRITICAL` / `AT_RISK`.

---

## Clientes

### /admin/clientes (lista de empresas)

- [ ] Header exibe "Empresas" + contagem "X empresa(s) encontrada(s)".
- [ ] Botão "Nova Empresa" exibe ícone e navega para `/admin/clientes/novo`.
- [ ] 5 filtros rápidos renderizados: "Todos", "Trials expirando", "Inadimplentes", "Health Crítico", "Onboarding parado". Filtro ativo destaca em índigo.
- [ ] Formulário GET contém: campo de busca (nome/CNPJ/email), select Status (com contagem por status), select Health (Crítico/Em Risco/Saudável/Excelente), select Onboarding, select Segmento.
- [ ] Select de Tags aparece somente se houver tags cadastradas.
- [ ] Botão "Filtrar" submete o formulário e a tabela recarrega com os resultados filtrados.
- [ ] Busca por nome parcial retorna apenas empresas com aquele trecho no nome.
- [ ] Filtro `?status=TRIAL` mostra somente empresas com assinatura em Trial.
- [ ] Botão "Limpar" aparece quando há filtros ativos e volta para a listagem sem filtros.
- [ ] Tabela exibe colunas: Empresa (link + CNPJ), Plano/MRR, Status (badge), Health (badge numérico), Onboarding (barra de progresso ou label), Tags (chips coloridos), Usuários, Cadastro, ícone de link.
- [ ] Clicar no nome da empresa navega para `/admin/clientes/[id]`.
- [ ] Estado vazio (nenhuma empresa) exibe ícone Building2 + mensagem.

### /admin/clientes/novo (cadastrar empresa)

- [ ] Link "← Voltar para clientes" navega de volta para `/admin/clientes`.
- [ ] Título "Cadastrar Novo Cliente" é exibido.
- [ ] Formulário (`NewClientForm`) renderiza campos de empresa; dropdowns de plano e rede estão populados com dados do banco.

### /admin/clientes/[id] (detalhes da empresa)

- [ ] Título exibe nome da empresa; badge "Bloqueado" aparece se `isBlocked = true`.
- [ ] Badge de health score (HealthBadge) aparece se a empresa tiver score calculado.
- [ ] Botão "← Voltar" navega para `/admin/clientes`.
- [ ] Menu de ações (`CompanyActions`) renderiza (botões de bloquear/desbloquear/reativar/estender trial/mudar plano/impersonar/deletar).
- [ ] Aba **Resumo** (padrão): exibe cards "Health Score Detalhado" (barras Usage/Billing/Engagement/Support + fatores de risco), "Informações Gerais" (CNPJ, telefone, cidade, slug, data de cadastro), e 3 métricas de contagem (Vendas, Produtos, Clientes).
- [ ] Aba **Tags**: exibe `CompanyTags` com tags atuais e possibilidade de adicionar.
- [ ] Aba **Onboarding**: exibe `CompanyOnboarding` com checklist de passos.
- [ ] Aba **Usuários**: exibe `CompanyUsers` com lista de usuários da empresa (nome, email, role, status).
- [ ] Aba **Filiais**: exibe `CompanyBranches` com filiais vinculadas.
- [ ] Aba **Rede**: exibe `CompanyNetwork` com informações de rede/franquia.
- [ ] Aba **Dados**: exibe `CompanyDataForm` com formulário de edição dos dados da empresa.
- [ ] Aba **Timeline**: exibe `CompanyTimeline` com histórico de atividades (activityLogs, até 50 entradas).
- [ ] Seção de faturas (dentro do Resumo ou aba dedicada) lista faturas da assinatura atual com status colorido.
- [ ] Link para `/admin/clientes/[id]` a partir do email da empresa está visível.

---

## Suporte

### /admin/suporte/tickets (lista de tickets)

- [ ] Título "Tickets de Suporte" e contagem de tickets exibidos.
- [ ] Botão "Novo Ticket" navega para `/admin/suporte/tickets/novo`.
- [ ] 4 KPI cards exibem contagens: "Abertos" (azul), "Em Andamento" (amarelo), "Aguardando" (roxo), "Resolvidos" (verde).
- [ ] Tabela exibe colunas: # (link azul com número), Assunto (link + categoria), Cliente (tradeName), Prioridade (emoji + label), Status (badge), Criado em.
- [ ] Clicar no número ou no assunto do ticket navega para `/admin/suporte/tickets/[id]`.
- [ ] Estado vazio exibe ícone de ticket + "Nenhum ticket encontrado".

### /admin/suporte/tickets/[id] (detalhes do ticket)

- [ ] Link "← Voltar para tickets" navega para `/admin/suporte/tickets`.
- [ ] Header exibe `#[número]` + badge de prioridade (colorido) + badge de status (colorido).
- [ ] Assunto, link clicável para o cliente (`/admin/clientes/[id]`) e componente `TicketActions` são renderizados.
- [ ] Grid com metadados: data de criação, responsável (se atribuído), data de resolução (se resolvida).
- [ ] Descrição do ticket é exibida (se preenchida).
- [ ] Componente `TicketMessages` renderiza histórico de mensagens em ordem cronológica.

### /admin/suporte/tickets/novo (novo ticket)

- [ ] Título "Novo Ticket" é exibido.
- [ ] Formulário `NewTicketForm` carrega com dropdown de empresas (até 200) e dropdown de admins ativos.

---

## Financeiro

### /admin/financeiro (visão geral)

- [ ] Título "Financeiro" e subtítulo "Visão geral das finanças do SaaS" exibidos.
- [ ] 4 KPI cards com valores monetários: "Recebido (Mês)", "Pendente", "Vencido", "Previsão Próx. Mês" — todos no formato R$ x.xxx,xx.
- [ ] Card "Vencido" usa cor vermelha quando valor > 0, cinza quando zerado.
- [ ] Painel "Faturas Vencidas" lista até 5 faturas OVERDUE com nome da empresa (link), dias de atraso, valor e data de vencimento.
- [ ] Link "Ver todas →" no painel de inadimplência navega para `/admin/financeiro/inadimplencia`.
- [ ] Painel "Ações Rápidas" exibe 4 links funcionais: "Todas as Faturas", "Nova Cobrança", "Inadimplência", "Clientes em Atraso".
- [ ] Mensagem "Nenhuma fatura vencida" exibida quando não há faturas OVERDUE.

### /admin/financeiro/faturas (lista de faturas)

- [ ] Header "Faturas" com botão "Nova Cobrança" (navega para `/admin/financeiro/faturas/nova`).
- [ ] 4 cards de resumo financeiro: "Total Recebido" (verde), "A Receber" (amarelo), "Faturas Pagas" (branco), "Vencidas" (vermelho).
- [ ] Filtros por etapa de workflow renderizados: "Todas", "Aguardando Envio (N)", "Aguardando Pagamento (N)", "Aguardando NF (N)", "Vencidas (N)" — contagens numéricas corretas.
- [ ] Filtros por status renderizados: Rascunho, Pendente, Pago, Vencido, Cancelado.
- [ ] Filtro `?status=PENDING` exibe apenas faturas pendentes.
- [ ] Filtro `?etapa=aguardando_envio` exibe apenas faturas geradas mas não enviadas.
- [ ] Tabela exibe colunas: Empresa (link + plano), Valor (R$), Vencimento, Status (badge), Enviado (ícone check), Pago (ícone check), NF (ícone check), NF Env. (ícone check), botão "Gerenciar".
- [ ] Botão "Gerenciar" navega para `/admin/financeiro/faturas/[id]`.
- [ ] Estado vazio exibe mensagem "Nenhuma fatura encontrada".

### /admin/financeiro/faturas/[id] (detalhes da fatura)

- [ ] Botão "← Voltar" navega para `/admin/financeiro/faturas`.
- [ ] Título "Fatura #[número ou id curto]" + badge de status colorido exibidos.
- [ ] Subtítulo exibe nome da empresa + nome do plano.
- [ ] Componente `InvoiceActions` é renderizado com ações disponíveis conforme o status da fatura.

### /admin/financeiro/faturas/nova (nova cobrança)

- [ ] Título "Nova Cobrança" exibido.
- [ ] Formulário `NewInvoiceForm` carrega com dropdown de empresas com assinatura ativa/trial/inadimplente.

### /admin/financeiro/inadimplencia (inadimplência)

- [ ] Título "Inadimplência" com ícone vermelho exibido.
- [ ] Subtítulo "Faturas vencidas e pagamentos atrasados" exibido.
- [ ] Filtros por tempo de atraso: "Todos" / "> 7 dias" / "> 15 dias" / "> 30 dias" — cada um com contagem correta.
- [ ] KPI "Total vencido" exibe soma em R$.
- [ ] Tabela lista faturas OVERDUE com: empresa (link para `/admin/clientes/[id]`), plano, valor, data de vencimento, dias de atraso.
- [ ] Filtro `?dias=30` mostra somente faturas vencidas há mais de 30 dias.

---

## Relatórios

### /admin/relatorios

- [ ] Título "Relatórios" exibido.
- [ ] Botão "Reconciliar Billing" (`ReconcileBillingButton`) renderizado.
- [ ] 4 KPI cards com dados: "MRR Estimado" (R$), "Clientes Ativos" (+ trial em subscript), "Churn (Mês) · est." (%), "Tickets (Mês)".
- [ ] Aviso amarelo "⚠️ MRR e Churn são estimados..." exibido.
- [ ] Seção "Exportar Dados" exibe 6 cards com links de download: Clientes, Assinaturas, Faturas, Tickets, Health Scores, Auditoria.
- [ ] Clicar em um card de exportação dispara download do CSV (`/api/admin/export/[tipo]`).

---

## Assinaturas

### /admin/assinaturas

- [ ] Título "Assinaturas" + total de assinaturas exibidos.
- [ ] Filtros por status renderizados com contagem: "Todas (N)", Ativo (N), Trial (N), Inadimplente (N), Suspenso (N), Cancelado (N), Trial Expirado (N).
- [ ] Filtro `?status=TRIAL` mostra somente assinaturas Trial.
- [ ] Tabela exibe colunas: Empresa (nome + email), Plano (nome), Status (badge colorido), Ciclo (mensal/anual), Valor/mês (R$), Trial expira (data ou "—"), Criada em, ícone de link.
- [ ] Ícone de link na última coluna navega para `/admin/clientes/[id]`.

---

## Saúde dos Clientes

### /admin/saude

- [ ] Título "Saúde dos Clientes" com ícone Activity exibido.
- [ ] Contagem "X clientes com saúde calculada · piores primeiro".
- [ ] Botão "Recalcular saúde" renderizado.
- [ ] Filtros por categoria: "Todos", "Crítico (N)", "Em Risco (N)", "Saudável (N)", "Excelente (N)" — com contagens corretas.
- [ ] Filtro `?category=CRITICAL` mostra somente empresas com healthCategory = CRITICAL.
- [ ] Tabela exibe colunas: Empresa (link + data de atualização), Saúde (HealthBadge), Uso, Billing, Engaj., Suporte (todos coloridos: verde ≥70, amarelo ≥40, vermelho <40), Fatores de risco (até 3 bullets + "+N mais"), botão "Recalcular" por linha.
- [ ] Estado "Nenhuma saúde calculada ainda" + instrução para recalcular quando não há scores.
- [ ] Clicar no nome da empresa navega para `/admin/clientes/[id]`.

---

## Usuários

### /admin/usuarios

- [ ] Título "Usuários" com ícone e contagem "X usuários em Y empresa(s)".
- [ ] Badges de contagem rápida na página: "N ativos (página)" verde e "N inativos (página)" vermelho.
- [ ] Formulário de filtro com: campo de busca (nome/email), select por empresa, select por perfil (Admin/Gerente/Vendedor/Caixa/Atendente), select por status (Ativos/Inativos).
- [ ] Botão "Filtrar" recarrega a tabela; botão "Limpar" aparece quando há filtros ativos.
- [ ] Filtro por empresa exibe empresas em dropdown (tradeName ou name).
- [ ] Tabela exibe colunas: Usuário (nome + email), Empresa (link para `/admin/clientes/[id]`), Perfil (badge colorido por role), Status (ícone check/X), Cadastro, Ações (botão ativar/desativar).
- [ ] Linha de usuário inativo exibe `opacity-50`.
- [ ] Paginação exibe Anterior/Próxima e números de página quando total > 50.
- [ ] Botão "Ativar/Desativar" (`ToggleUserButton`) funciona e reflete o novo status sem recarregar a página inteira.

---

## Interessados

### /admin/interessados

- [ ] Ícone de envelope + título "Interessados" exibidos.
- [ ] Dropdown de filtro por plano: "Todos os planos", Básico, Básico + NF, Profissional, Rede.
- [ ] Ao selecionar um plano, a lista é filtrada via API (`/api/admin/plan-interests?planSlug=...`) sem reload da página.
- [ ] Botão "Exportar CSV" dispara download do arquivo correto (com ou sem filtro de plano).
- [ ] Tabela exibe colunas: Nome, Email, Telefone, Empresa, Plano e Data de cadastro (formato dd/mm/aaaa hh:mm).
- [ ] Estado vazio exibe mensagem quando não há interessados.

---

## Configurações

### /admin/configuracoes (hub)

- [ ] Rota redireciona automaticamente para `/admin/configuracoes/planos` (sem tela intermediária).

### /admin/configuracoes/planos

- [ ] Página carrega via `PlanosClient` com lista de planos do banco.
- [ ] Cada plano exibe nome, preço mensal, status (Ativo/Inativo), número de assinaturas vinculadas.
- [ ] Toggle de status de plano funciona (ACTIVE ↔ inativo) via API.
- [ ] Campo de `highlightFeatures` pode ser editado e salvo.

### /admin/configuracoes/equipe

- [ ] Somente admins com role SUPER_ADMIN ou ADMIN conseguem acessar (outros redirecionam ou recebem 403).
- [ ] Lista de admins exibe: nome, email, role, status (ativo/inativo), último login, data de criação.
- [ ] Botões de criar, ativar/desativar e editar admin funcionam via `EquipeClient`.
- [ ] Admin atual não consegue se desativar.

### /admin/configuracoes/logs

- [ ] Tabela de auditoria global (`GlobalAudit`) carrega com colunas: ação (label legível em pt-BR), empresa, admin executor, data/hora.
- [ ] Filtros por ação (dropdown com ~20 tipos), empresa (companyId), intervalo de datas (dateFrom/dateTo) funcionam.
- [ ] Paginação de 50 entradas por página funciona (links Anterior/Próxima).
- [ ] Filtro por empresa retorna somente logs daquela empresa.
- [ ] Filtro de data `dateFrom` filtra logs a partir da data informada (inclusive).

### /admin/configuracoes/sincronizacao

- [ ] Somente SUPER_ADMIN acessa (outros redirecionam/403).
- [ ] `SincronizacaoClient` exibe estado atual do auto-sync: toggle Habilitado/Desabilitado e toggle Dry Run.
- [ ] Data/hora da última execução (`lastRunAt`) e resumo (`lastRunSummary`) são exibidos.
- [ ] Histórico de até 50 eventos de sync (COMPANY_AUTO_SYNCED / COMPANY_RESYNCED) listado com empresa e data.

### /admin/configuracoes/emails

- [ ] Somente SUPER_ADMIN acessa (outros redirecionam/403).
- [ ] `EmailsClient` exibe toggle "Email master" (liga/desliga todos os e-mails SaaS).
- [ ] Toggle "Modo teste" e campo de e-mail de teste são exibidos.
- [ ] 7 toggles individuais de templates: boas-vindas, trial expirando, trial expirado, fatura vencida, pagamento confirmado, assinatura suspensa, assinatura cancelada.
- [ ] Log de e-mails enviados (até 50 entradas) exibe: empresa, tipo de evento, status, destinatário, data.

### /admin/configuracoes/seguranca

- [ ] Título "Segurança" e subtítulo de 2FA exibidos.
- [ ] Componente `MfaSetup` renderiza corretamente com estado inicial (`mfaEnabled`) do admin logado.
- [ ] Se MFA desabilitado: exibe botão/QR para ativar. Se habilitado: exibe botão para desativar.

---

## Cobertura

| Seção | Rotas |
|---|---|
| Principal | `/admin` |
| Clientes | `/admin/clientes`, `/admin/clientes/novo`, `/admin/clientes/[id]` |
| Suporte | `/admin/suporte/tickets`, `/admin/suporte/tickets/[id]`, `/admin/suporte/tickets/novo` |
| Financeiro | `/admin/financeiro`, `/admin/financeiro/faturas`, `/admin/financeiro/faturas/[id]`, `/admin/financeiro/faturas/nova`, `/admin/financeiro/inadimplencia` |
| Relatórios | `/admin/relatorios` |
| Assinaturas | `/admin/assinaturas` |
| Saúde | `/admin/saude` |
| Usuários | `/admin/usuarios` |
| Interessados | `/admin/interessados` |
| Configurações | `/admin/configuracoes` (redirect), `/admin/configuracoes/planos`, `/admin/configuracoes/equipe`, `/admin/configuracoes/logs`, `/admin/configuracoes/sincronizacao`, `/admin/configuracoes/emails`, `/admin/configuracoes/seguranca` |
| **Total** | **24 rotas** (login excluído do escopo de shell) |
