# Vis Medical — Área Clínica: Direção de Design (design-system)

**Data:** 2026-07-12
**Escopo:** Direção visual/UX da área clínica (fatia 1: agenda/fila + workspace de atendimento). Anexo ao spec `2026-07-12-vis-medical-nucleo-clinico-fatia1-design.md`. Alimenta o plano; **sem código nesta rodada.**

**Princípio-mestre:** a área clínica é uma **variante sóbria e densa em dados** DENTRO do design system que o Vis já tem (admin redesenhado + overhaul mobile de 6 fases + Fase A do teclado-dioptria). NÃO se cria paleta, fontes ou componentes novos do zero — herda-se o Vis e ajusta-se o tom. O médico deve sentir "é o Vis, mas o modo consultório".

---

## 1. Herança (o que REUSAR do Vis, não recriar)

- **Tokens de cor, tipografia, espaçamento, dark mode:** os do Vis (Tailwind/Shadcn já configurados). NÃO adotar a paleta genérica que o gerador sugeriu (#1E40AF etc.) — usar os tokens do Vis.
- **Componentes existentes:** `PageContainer`/header kit, `StatusBadge` por token, DataTable, os componentes mobile (tabela→card) do overhaul, e — crítico — o **teclado-calculadora de dioptria + DecimalInput da Fase A** (`mobile-fase-a-preenchimento`) para os campos de grau od/oe. NÃO reinventar entrada de dioptria.
- **RBAC/nav:** o shell e a sidebar do Vis, filtrados por permissão (a área clínica aparece só para papéis clínicos/recepção da conta VIS_MEDICAL).

## 2. Tom da variante clínica (o que MUDA em relação ao PDV)

- **Mais sóbrio, menos comercial:** o PDV da ótica é de venda (call-to-action, cor de destaque). O consultório é de **leitura e registro** — hierarquia calma, menos saturação, densidade de informação alta sem ruído. Padrão-alvo: **data-dense + drill-down**, WCAG AA (contraste ≥4.5:1).
- **Cor semântica, não decorativa:** status de agendamento (AGENDADO/CONFIRMADO/AGUARDANDO/EM_ATENDIMENTO/ATENDIDO/CANCELADO/FALTOU) como tokens de `StatusBadge` (par claro/escuro), no mesmo padrão OKLCH que o Vis já usa para status de venda/OS. Cor de status ≠ cor de marca.
- **Densidade:** padding menor que o PDV, grid eficiente — o médico vê muita informação de uma vez (contexto do paciente + campos), mas com respiro suficiente para leitura clínica sem erro.

## 3. Tela de atendimento (o coração — layout)

- **Duas colunas** (desktop/iPad): esquerda = **painel de contexto do paciente** (read-only: última receita, grau anterior, receitas a vencer/vencidas via `expiresAt`, alergias/observações — SÓ dados da própria conta VIS_MEDICAL, nada cross-tenant); direita = **abas de trabalho** (Prontuário | Refração). Colapsa para uma coluna no mobile/iPad retrato (padrão responsivo do overhaul).
- **Prontuário (modelo BR):** campos-texto agrupados em seções legíveis (Queixa/HDA/Antecedentes/História Familiar/Medicações/Exame Físico/Sinais Vitais/Diagnóstico/Plano/Observações) — `FormSection` do Vis, densidade alta, cada campo com label claro.
- **Refração:** grade od/oe (Esf/Cil/Eixo/Adição) usando o **teclado-dioptria/DecimalInput da Fase A** — `inputmode="numeric"`, sinal ± fácil, sem zoom no iOS. É o padrão que o Vis já validou em produção no PDV; reusar 1:1.
- **Barra de ação fixa:** "Salvar rascunho" (auto-save localStorage — ver §4), "Gerar receita" (botão explícito, primário), estado da consulta (timer opcional, fora do MVP).

## 4. UX crítico (regras que entram no plano)

- **Auto-save via localStorage** (decisão do painel: NÃO servidor na fatia 1) — indicador visível "rascunho salvo localmente"; ao gerar receita/assinar, persiste no servidor. Nunca perder trabalho se a aba fecha.
- **Validação no blur**, não só no submit (grau, campos obrigatórios) — feedback perto do campo com problema.
- **`inputmode="numeric"`** em todo campo de grau/número; teclado certo no mobile/iPad.
- **"Gerar receita" com revisão explícita:** nunca emissão automática de grau bruto (risco clínico do painel). Abre revisão → confirma → emite.
- **Recepção nunca vê prontuário:** a tela/DTO de agenda da recepção não renderiza campos clínicos (reforço visual do gate de dados da Seção 5 do spec).
- **Acessibilidade:** foco visível no teclado, alvos ≥44px (iPad é alvo real de uso em consultório), `aria-label` em botões de ícone, `prefers-reduced-motion`.

## 5. Anti-padrões a evitar

- Não usar a paleta/fontes genéricas do gerador — herdar as do Vis.
- Não reinventar entrada de dioptria — usar o teclado da Fase A.
- Não deixar cor ser o único indicador de status (acessibilidade).
- Não encher a tela de atendimento de enfeite — é ferramenta de trabalho, densidade calma > decoração.
- Não puxar dado da ótica pro painel de contexto (cross-tenant — proibido pelo painel/F0).

---

**Saída:** esta direção entra no spec/plano como as regras de UI das telas da fatia 1. A implementação real das telas segue o design system do Vis + estas regras; a tela de atendimento é o item de maior peso de UI e deve ser fatiada com cuidado no plano.
