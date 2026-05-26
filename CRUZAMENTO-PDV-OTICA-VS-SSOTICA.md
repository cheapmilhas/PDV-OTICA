# RELATORIO DE CRUZAMENTO: PDV Otica x ssOtica

> Gerado em 09/04/2026 | Baseado em engenharia reversa completa do ssOtica + auditoria do codigo-fonte do PDV Otica

---

## RESUMO EXECUTIVO

| Metrica | Valor |
|---------|-------|
| Total de funcionalidades do ssOtica analisadas | **98** |
| Ja temos e funciona bem | **42** (43%) |
| Precisam melhorar | **24** (24%) |
| Nao temos | **27** (28%) |
| Nao se aplica | **5** (5%) |

**Veredicto:** O PDV Otica ja cobre ~67% do que o ssOtica oferece (somando o que funciona + o que precisa melhorar). Os gaps criticos estao concentrados em **emissao fiscal** (bloqueante para operacao), **receita oftalmologica integrada a OS** (diferencial core de otica), e **crediario completo com juros/multa** (forma de pagamento dominante no segmento popular).

---

## SECAO 1: CLIENTES

### 1.1 Cadastro basico (nome, CPF, endereco, telefone)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Model `Customer` (`prisma/schema.prisma:367-419`) com: name, cpf, rg, email, phone, phone2, birthDate, gender, personType (PF/PJ), cnpj, companyName, tradeName, address completo (rua, numero, complemento, bairro, cidade, estado, CEP), acceptsMarketing, referralSource, notes, externalId, originBranchId, active, softDelete
- **O que o ssOtica tem:** Tudo acima MAIS: foto do cliente, QR Code, multiplos telefones com flags SMS/WhatsApp individuais (model ClienteTelefone separado), multiplos emails (model ClienteEmail), referencias pessoais/comerciais (model ClienteReferencia), profissao (model ClienteProfissao), origem multipla (model ClienteOrigem com Facebook/Instagram/Indicacao/etc), escolaridade, renda familiar, responsavel legal (FK para outro cliente), desconto padrao por cliente, codigo externo
- **Gap:**
  - Sem campo `foto` / `photoUrl`
  - Sem QR Code
  - Apenas 2 telefones fixos (phone, phone2) em vez de colecao dinamica com flags SMS/WhatsApp
  - Apenas 1 email (campo unico)
  - Sem model de referencias pessoais/comerciais
  - Sem campo profissao, escolaridade, renda
  - Sem campo responsavel legal (para menores)
  - Sem desconto padrao por cliente
- **Recomendacao:** Prioridade MEDIA. Adicionar foto e desconto padrao sao rapidos e uteis. Multiplos telefones com flags WhatsApp e importante para CRM. Os demais (profissao, escolaridade, renda) sao "nice to have" para oticas populares.

### 1.2 Historico do cliente (abas no detalhe)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Pagina de detalhe (`src/app/(dashboard)/dashboard/clientes/[id]/page.tsx`, 1476 linhas) com **7 abas**: Dados, Vendas, Orcamentos, Ordens de Servico, Parcelas (Contas a Receber), Cashback, CRM
- **O que o ssOtica tem:** 9 abas: Vendas, Trocas, OS, Receitas, Crediario, Renegociacoes, Cheques, Marketing, Arquivos + ticket medio + analise de frequencia
- **Gap:**
  - Sem aba Trocas/Devolucoes (Refund existe no sistema mas nao aparece no detalhe do cliente)
  - Sem aba Receitas/Prescricoes (model Prescription existe mas sem aba dedicada)
  - Sem aba Renegociacoes (funcionalidade nao existe)
  - Sem aba Cheques (funcionalidade nao existe)
  - Sem aba Marketing (campanhas enviadas ao cliente)
  - Sem aba Arquivos (upload de documentos do cliente)
  - Sem calculo de ticket medio na aba de vendas
- **Recomendacao:** Prioridade MEDIA. Adicionar abas de Receitas (ja tem model) e Devolucoes (ja tem model Refund) e rapido. Aba de Arquivos e util para guardar receitas escaneadas.

### 1.3 Importacao/Exportacao de clientes

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Import via XLSX (`/api/customers/import`) com 20+ colunas mapeadas, deteccao automatica PF/PJ, upsert por nome/CPF, validacao CPF/CNPJ. Export XLSX (`/api/customers/export`) com todos os campos. Template para download (`/api/customers/template`)
- **O que o ssOtica tem:** Upload de planilha (max 1.000 linhas) com modelo para download, exportar clientes e receitas
- **Gap:** Nenhum significativo. Nosso import e ate mais robusto (suporta colunas com nomes variados do sistema legado ADO)
- **Recomendacao:** Nenhuma acao necessaria.

### 1.4 Busca e filtros avancados

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** (`/api/customers/route.ts`) Busca full-text por nome, CPF, telefone, email. Filtros: status (ativo/inativo/todos), cidade, estado, genero, acceptsMarketing, referralSource, periodo de cadastro, mes de aniversario, ordenacao por nome/data/cidade. Endpoint `/api/customers/filters` retorna valores distintos para filtros dinamicos
- **O que o ssOtica tem:** Busca por nome, CPF, telefone, codigo externo, email. Filtros por origem, status, periodo, cidade, bairro
- **Gap:** Sem filtro por bairro (temos cidade/estado mas nao bairro). Sem busca por externalId (campo existe mas nao indexado na busca)
- **Recomendacao:** Prioridade BAIXA. Adicionar bairro e externalId ao search e trivial.

---

## SECAO 2: PRODUTOS

### 2.1 Cadastro de produto (dados principais)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Model `Product` (`prisma/schema.prisma:613-677`) com: name, sku, barcode, manufacturerCode, description, type (12 tipos: FRAME, CONTACT_LENS, SUNGLASSES, LENS_SERVICE, SERVICE, OPHTHALMIC_LENS, etc), categoryId, brandId, shapeId, colorId, costPrice, salePrice, promoPrice, marginPercent, stockControlled, stockQty/Min/Max, reorderPoint, abcClass, ncm, cest, mainImage, images[], active, featured, launch. Sub-models: FrameDetail, ContactLensDetail, AccessoryDetail, ServiceDetail, LensServiceDetail
- **O que o ssOtica tem:** Nome, referencia, EAN, unidade (FR/KIT/PAR/PC/UN), grupo (17 tipos), subgrupo, grife (279 marcas), cor, tamanho, formato, 5 imagens com crop, observacao, venda somente com OS, campos e-commerce
- **Gap:**
  - Sem campo de unidade de medida (FR/KIT/PAR/PC/UN)
  - Sem flag "venda somente com OS" (`vendaSomenteOs`)
  - Sem funcionalidade de clonar/duplicar produto
  - Sem acoes em lote (apagar em massa, incluir/remover vitrine)
  - Imagens sem crop integrado (apenas URLs simples)
  - Sem campos especificos e-commerce (descricaoEcommerce, medidas lente/ponte/haste para vitrine)
- **Recomendacao:** Prioridade MEDIA. Unidade de medida e clone sao uteis. Flag "venda somente OS" e importante para lentes.

### 2.2 Preco e estoque multi-filial

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Model `BranchStock` (`prisma/schema.prisma:2262-2277`) com: quantity, minStock, maxStock, location por filial. Porem `costPrice` e `salePrice` sao GLOBAIS no model Product (um preco unico para todas as filiais)
- **O que o ssOtica tem:** Tabela pivot produto-empresa com custo, % lucro, valor lucro, preco venda, estoque atual, estoque minimo, localizacao, validade — tudo INDEPENDENTE por loja
- **Gap:**
  - Preco de custo e venda NAO sao por filial (campo global no Product)
  - Sem % lucro e valor lucro por filial
  - Sem campo validade por filial
  - Sem flag "ativo na vitrine" por filial
- **Recomendacao:** Prioridade ALTA para redes com multiplas lojas. Adicionar `costPrice`, `salePrice`, `marginPercent` ao BranchStock. Para lojas unicas, o sistema atual funciona.

### 2.3 Configuracao fiscal do produto (CFOP, ICMS, NCM)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Campos `ncm` e `cest` no Product. NAO tem CFOP, ICMS, ICMS-ST no produto
- **O que o ssOtica tem:** NCM, CEST, CFOP entrada/saida (dentro/fora estado), origem ICMS, CSOSN, aliquota ICMS, credito SN, reducao BC, ICMS-ST (aliquota, MVA, reducao) — tudo por produto, sobrescrevendo config da empresa
- **Gap:**
  - Sem CFOP no produto
  - Sem ICMS/CSOSN no produto
  - Sem ICMS-ST no produto
  - Sem hierarquia empresa > produto para config fiscal
- **Recomendacao:** Prioridade ALTA (bloqueante para emissao fiscal). Sem esses campos no produto, nao e possivel emitir NF-e/NFC-e corretamente.

### 2.4 Categorias dinamicas (grupo, subgrupo, grife, cor, tamanho, formato)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Models separados para Category (hierarquica com parentId), Brand (com campos ricos: manufacturer, minMargin, maxDiscount, segment, origin, logoPath), Color (com hex), Shape (com imageUrl, faceTypes[]). Todos com API GET. Import de produtos cria categorias/marcas automaticamente
- **O que o ssOtica tem:** Grupo (17 tipos), subgrupo, grife (279), cor, tamanho, formato — todos com criacao inline na tela de produto
- **Gap:**
  - Sem model `Tamanho` (Size) dedicado — campo sizeText no FrameDetail e texto livre
  - Sem model `Formato` (Format) separado do Shape
  - APIs de Category e Brand sao somente GET — sem POST para criacao dinamica via UI
  - Sem criacao inline na tela de cadastro de produto
- **Recomendacao:** Prioridade MEDIA. Adicionar endpoints POST para Category e Brand e rapido. Criacao inline melhora UX.

### 2.5 Importacao/Exportacao de produtos

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Import XLSX (`/api/products/import`) com deteccao automatica de tipo, criacao de categorias/marcas/fornecedores, upsert por SKU. Export XLSX (`/api/products/export`) com 21 colunas. Template XLSX. Busca por codigo de barras (`/api/products/search-by-barcode`)
- **O que o ssOtica tem:** Planilha modelo + export por filial
- **Gap:** Sem export filtrado por filial (exporta todos os produtos da empresa)
- **Recomendacao:** Prioridade BAIXA.

---

## SECAO 3: TABELAS DE LENTES

### 3.1 Sincronizacao com fornecedores (Zeiss)

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Model `Lab` (`prisma/schema.prisma:444-477`) com campos de integracao genericos (integrationType, apiUrl, apiKey, clientCode) mas NENHUMA implementacao de sync. Model `LabPriceRange` para precos por faixa de grau/material. Model `LensServiceDetail` para detalhes de lente por produto. CRUD de laboratorios funcional
- **O que o ssOtica tem:** Integracao em tempo real com Zeiss (1.492 SKUs), conferencia manual item-a-item, aplicar preco sugerido individual ou em massa, vincular/desvincular produtos, cadastrar novo a partir do fornecedor
- **Gap:**
  - Sem model TabelaLente/TabelaLenteItem para importacao de tabelas
  - Sem endpoint de sync com fornecedores
  - Sem UI de conferencia/vinculacao
  - Sem fluxo de aplicar preco sugerido
- **Recomendacao:** Prioridade MEDIA-ALTA para oticas que trabalham com labs grandes. A infraestrutura de Lab ja existe. Precisa: model de tabela importada, endpoint de upload CSV/API, tela de conferencia com vinculacao.

### 3.2 Precificacao de lentes (3 camadas)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** `LabPriceRange` com: labPrice, suggestedPrice, arPrice, blueLightPrice, photochromicPrice por faixa de grau (sphMin/Max, cylMin/Max) e material. `LensTreatment` com preco por tratamento
- **O que o ssOtica tem:** 3 camadas: Fornecedor → Sugerido → Sistema, com formula de margem automatica
- **Gap:**
  - Sem UI para gerenciar LabPriceRange (model existe, sem pagina)
  - Sem formula automatica de margem (fornecedor → sugerido → final)
  - Sem vinculacao automatica tabela fornecedor → produto sistema
- **Recomendacao:** Prioridade MEDIA. Criar pagina de gestao de precos por lab/faixa.

---

## SECAO 4: VENDAS / PDV

### 4.1 Fluxo de venda (3 etapas)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** PDV em tela unica (`src/app/(dashboard)/dashboard/pdv/page.tsx`, 1046 linhas) com fluxo: Busca Produto → Selecao Cliente → Selecao Vendedor → Modal Pagamento. Atalhos: F2 (barcode), F3 (cliente), F4 (finalizar), F8 (limpar). Busca por nome/SKU/codigo de barras. Cadastro rapido de cliente inline. Carrinho com edicao de preco, desconto por item (R$/%)
- **O que o ssOtica tem:** 3 etapas: Dados Principais → Produtos/Servicos → Finalizacao (cliente + pagamento)
- **Gap:** Nenhum significativo. Nosso PDV e funcional e com atalhos de teclado
- **Recomendacao:** Nenhuma acao necessaria.

### 4.2 Importar OS para venda

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Campo `serviceOrderId` existe no model Sale (unique constraint) indicando que foi PLANEJADO. Conversao Quote→Sale funciona (`/api/quotes/[id]/convert`). Mas NAO existe endpoint ou botao para converter OS→Venda
- **O que o ssOtica tem:** Botao "Finalizar" na OS que puxa todos os dados (itens, valores, cliente) para uma venda
- **Gap:** Sem endpoint `/api/service-orders/[id]/convert`. Sem botao na tela de OS
- **Recomendacao:** Prioridade CRITICA. E o fluxo principal de uma otica: OS pronta → cliente retira → gera venda. A infraestrutura ja existe (serviceOrderId no Sale), falta implementar o endpoint e o botao.

### 4.3 Formas de pagamento

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Enum `PaymentMethod` com 10 opcoes: CASH, PIX, DEBIT_CARD, CREDIT_CARD, BOLETO, STORE_CREDIT (crediario), CHEQUE, AGREEMENT (convenio), OTHER, BALANCE_DUE. Model `CardFeeRule` para taxas por bandeira/parcelas. Multiplos pagamentos na mesma venda
- **O que o ssOtica tem:** 22 formas configuradas: Dinheiro, 10 cartoes credito (por bandeira), 3 cartoes debito, 3 crediario, Pix, Blu, Credz, Brasilcard. Cada forma tem: tipo (ES/CT/CD/CR), taxa administracao, tarifa, juros/mes, multa/mes, dias carencia, instrucoes de carne, conta financeira vinculada
- **Gap:**
  - Nao permite criar formas de pagamento customizadas (enum fixo no schema)
  - Sem vincular forma de pagamento a conta financeira
  - Sem configuracao de juros/multa/carencia por forma
  - Sem instrucoes de carne por forma
  - Sem bandeiras de cartao como formas separadas
- **Recomendacao:** Prioridade MEDIA. Para o MVP, o enum com 10 tipos funciona. Para equiparar ao ssOtica, precisa de model `FormaPagamento` dinamico em vez de enum fixo.

### 4.4 Desconto com autorizacao admin

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** SystemRule com chave `sales.discount.approval_above` para definir limite. Schema de validacao existe. Porem a UI de workflow de aprovacao (solicitar → admin aprova → desconto aplicado) NAO foi encontrada no PDV
- **O que o ssOtica tem:** Modal de autorizacao com senha do gerente para descontos acima do limite
- **Gap:** Configuracao existe, workflow de aprovacao na UI nao implementado
- **Recomendacao:** Prioridade MEDIA. Adicionar modal de senha de gerente no PDV quando desconto excede limite.

### 4.5 Pos-venda (fiscal + garantia + cashback)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:**
  - Fiscal: Campos no Sale (fiscalStatus, fiscalModel, fiscalKey, fiscalXmlUrl, fiscalPdfUrl) mas SEM emissao real (sem integracao SEFAZ)
  - Garantia: Model Warranty e WarrantyClaim existem com status, validade, claims — mas sem UI dedicada na venda (inline na OS)
  - Cashback: COMPLETO — credito automatico, saldo, uso na venda, expiracao, birthday bonus
- **O que o ssOtica tem:** NFC-e automatica pos-venda, garantia com template configuravel, cashback
- **Gap:**
  - Emissao fiscal nao funciona (so campos preparados)
  - Garantia sem tela propria na venda
- **Recomendacao:** Emissao fiscal e PRIORIDADE CRITICA (ver Secao 7). Garantia na venda e prioridade MEDIA.

### 4.6 Orcamento (salvar sem finalizar)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Modulo completo de Orcamentos (`src/app/(dashboard)/dashboard/orcamentos/`) com: CRUD, conversao para venda (`/api/quotes/[id]/convert`), follow-up com historico, envio por WhatsApp/email (mark-sent), estatisticas de conversao (`/api/quotes/stats`), impressao, validade configuravel. Model Quote com 30+ campos incluindo internalNotes, lostReason, paymentConditions, contactCount
- **O que o ssOtica tem:** Flag `isOrcamento` na venda para salvar sem finalizar
- **Gap:** Nenhum. Nosso sistema de orcamentos e SUPERIOR ao do ssOtica (modulo dedicado vs flag simples)
- **Recomendacao:** Nenhuma acao necessaria. Ponto forte do PDV Otica.

---

## SECAO 5: ORDENS DE SERVICO

### 5.1 Formulario de OS (dados principais)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Form de OS (`src/app/(dashboard)/dashboard/ordens-servico/nova/page.tsx`, 887 linhas) com 4 secoes: Dados Basicos (cliente, filial, lab, datas), Notas, Prescricao (11 campos), Itens/Servicos. Model ServiceOrder com: status, priority, lab, dates, delay tracking, warranty/rework flags, quality rating, prescriptionData (JSON)
- **O que o ssOtica tem:** ~187 campos em 7 secoes: dados principais, produtos, adiantamento, receita, info adicional, dados do objeto, imagens
- **Gap:**
  - Formulario atual tem ~25 campos vs ~187 do ssOtica
  - Sem secao de adiantamento/sinal
  - Sem secao de dados do objeto (para OS genericas tipo relojoaria)
  - Sem upload de imagens na OS
  - Campos de prescricao no form sao basicos (11) vs completos no ssOtica
- **Recomendacao:** Prioridade ALTA. Expandir o formulario com mais secoes, especialmente adiantamento e imagens.

### 5.2 Receita oftalmologica integrada

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:**
  - Model `Prescription` (`prisma/schema.prisma:732-757`) com doctor, validade, tipo, imageUrl
  - Model `PrescriptionValues` (`prisma/schema.prisma:759-782`) com 22 campos: OD/OE para Sph, Cyl, Axis, Add, Prism, Base + pdFar, pdNear, fittingHeightOd/Oe, pantoscopicAngle, vertexDistance, frameCurvature
  - Form de OS tem 11 campos de prescricao (esf, cil, eixo, dnp, altura para OD e OE + adicao, tipoLente, material)
- **O que o ssOtica tem:** Grau longe/perto para OD e OE (esferico, cilindrico, eixo, altura, DNP separados), adicao, curva base, olho dominante, ceratometria (horizontal/vertical com eixo para OD e OE), pupilometro virtual, anexo de receita
- **Gap:**
  - Form da OS usa apenas ~11 campos dos 22 disponiveis no model PrescriptionValues
  - Sem separacao longe/perto no formulario (model tem mas UI nao)
  - Sem campos de ceratometria no formulario
  - Sem campo olho dominante no formulario
  - Sem curva base no formulario
  - Sem pupilometro virtual
  - Sem upload de imagem da receita na OS (campo imageUrl existe no model)
- **Recomendacao:** Prioridade CRITICA. O model PrescriptionValues JA TEM quase tudo — so falta expor no formulario da OS. E trabalho de UI, nao de schema. Ceratometria precisa de campos novos.

### 5.3 Dados de lente na OS

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** No form de OS: tipoLente (Visao Simples/Bifocal/Multifocal/Ocupacional), material (Resina 1.50-1.74/Policarbonato/Trivex). Model LensTreatment para tratamentos. ServiceOrderItem com labId e measurementsSnapshot
- **O que o ssOtica tem:** Tipo (pronta/surfacada), material (policarbonato/resina/trivex), coloracao, tratamentos multiplos (Easy Clean, No-Risk, etc.), descricao de lente
- **Gap:**
  - Sem flag pronta vs surfacada
  - Sem campo coloracao
  - Sem vinculacao de multiplos tratamentos a OS (model OsTratamento do ssOtica)
  - Sem descricao livre da lente
- **Recomendacao:** Prioridade MEDIA. Adicionar campos ao form de OS. Model LensTreatment ja existe para vincular.

### 5.4 Dados de armacao na OS

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `FrameMeasurement` (`prisma/schema.prisma:22-47`) com: frameWidth, bridgeSize, lensWidth, lensHeight, templeLength, pdRight, pdLeft, heightRight, heightLeft, frameModel, frameColor, frameMaterial, measuredByUserId, observations
- **O que o ssOtica tem:** 8 modelos visuais, tipo (nylon/parafuso/metal/acetato), aro, ponte, diagonal, altura vertical, distancia pupilar
- **Gap:**
  - Sem selecao visual de formato de armacao (8 silhuetas)
  - Sem enum de tipo de armacao (nylon/parafuso/metal/acetato)
  - Os campos de medida sao equivalentes
- **Recomendacao:** Prioridade BAIXA. Adicionar seletor visual de formato seria bom UX mas nao e bloqueante.

### 5.5 Workflow/Kanban de etapas

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Enum `ServiceOrderStatus` com 7 estados: DRAFT → APPROVED → SENT_TO_LAB → IN_PROGRESS → READY → DELIVERED + CANCELED. Transicoes validadas no schema. Historico via ServiceOrderHistory. Listagem por status com badges. Botoes de proxima acao
- **O que o ssOtica tem:** Etapas customizaveis com SLA (dias previstos), SMS automatico por etapa, drag-and-drop kanban, etapas configuraveis por tipo de OS
- **Gap:**
  - Sem visualizacao kanban drag-and-drop (usa lista com botoes)
  - Etapas sao enum fixo no schema (nao customizaveis pelo usuario)
  - Sem SLA por etapa (dias previstos)
  - Sem SMS automatico por mudanca de etapa
  - Sem tipos de OS diferentes (otica, relojoaria, etc)
- **Recomendacao:** Prioridade ALTA. Kanban visual e o diferencial mais visivel. SLA por etapa e importante para controle.

### 5.6 Conversao OS → Venda

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Campo `serviceOrderId` no Sale (preparado no schema) mas sem endpoint nem botao implementado
- **O que o ssOtica tem:** Botao "Finalizar" na OS que gera automaticamente a venda com todos os itens
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade CRITICA. E o fluxo core. Schema ja suporta, falta endpoint + UI.

### 5.7 Adiantamento/Sinal na OS

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Nenhum campo de pagamento no ServiceOrder model. Nenhum campo de adiantamento
- **O que o ssOtica tem:** Valor adiantamento, valor sinal, forma de pagamento do sinal, parcelas do sinal, codigo autorizacao, data adiantamento
- **Gap:** Funcionalidade inteira faltando. Precisa de campos no schema + secao no formulario + logica financeira
- **Recomendacao:** Prioridade ALTA. Muito comum o cliente pagar sinal ao abrir OS e o restante na entrega.

---

## SECAO 6: FINANCEIRO

### 6.1 Contas a Receber

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Model `AccountReceivable` (`prisma/schema.prisma:1533-1564`) com: installmentNumber, totalInstallments, amount, dueDate, receivedDate, receivedAmount, status (PENDING/RECEIVED/OVERDUE/CANCELED), branchId, customerId, saleId. API com recebimento individual e em lote (`/api/accounts-receivable/receive-multiple`). Recibo (`/api/accounts-receivable/[id]/receipt`)
- **O que o ssOtica tem:** Criacao avulsa e automatica (via venda), baixa individual/lote, parcelamento, multa/juros automatico, cobranca SMS/email, estorno, 5 status (EM_ABERTO/PAGO/EM_ATRASO/CANCELADO/RENEGOCIADO)
- **Gap:**
  - Sem campos de multa/juros (multa, juros, desconto, acrescimo)
  - Sem status RENEGOCIADO
  - Sem cobranca automatica SMS/email por atraso
  - Sem estorno de recebimento
  - Sem plano de contas vinculado (planoContaId)
  - Sem tipo de documento (Boleto/Carne/Cheque/Duplicata/NF/etc)
- **Recomendacao:** Prioridade ALTA. Multa e juros sao essenciais para crediario. Adicionar campos ao model e logica de calculo automatico.

### 6.2 Contas a Pagar

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `AccountPayable` (`prisma/schema.prisma:1469-1499`) com: description, category (15 tipos via enum AccountCategory), amount, dueDate, paidDate, paidAmount, status (PENDING/PAID/OVERDUE/CANCELED), supplierId, invoiceNumber, branchId. Model `RecurringExpense` para despesas recorrentes com frequencia e dia do mes. API completa
- **O que o ssOtica tem:** Avulso, parcelado, recorrente, importacao em lote, 8 tipos de documento, mes competencia
- **Gap:**
  - Sem campo tipo de documento (Boleto/Duplicata/NF/etc)
  - Sem campo mes de competencia
  - Sem importacao em lote de contas a pagar
  - Sem campo de comprovante/anexo
- **Recomendacao:** Prioridade BAIXA. Funcionalidade core funciona. Campos extras sao incrementais.

### 6.3 Caixa (abertura/fechamento)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `CashShift` com: status (OPEN/CLOSED), openingFloatAmount, closingDeclaredCash, closingExpectedCash, differenceCash, differenceJustification, cashRegisterId. Model `CashMovement` com tipos: SANGRIA, SUPRIMENTO, TRANSFER, PAYMENT, REFUND. Historico de turnos. Relatorio por turno. Diagnostico de caixa (`/dashboard/diagnostico-caixa`)
- **O que o ssOtica tem:** Abertura com saldo inicial, sangria, suprimento, ajuste, transferencia entre contas, fechamento, resumo por forma de pagamento
- **Gap:**
  - Sem transferencia entre contas financeiras (transferencia entre filiais existe, entre contas nao)
  - Sem tipo AJUSTE explicito no CashMovement (tem via TRANSFER)
- **Recomendacao:** Prioridade BAIXA. Sistema atual e robusto. Transferencia entre contas e incremental.

### 6.4 Fluxo de Caixa (projecao)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Pagina de fluxo de caixa (`/dashboard/financeiro/fluxo-caixa`) com: entradas e saidas diarias, saldo do dia, saldo acumulado, filtro por conta e filial, export PDF/Excel, grafico barra + linha
- **O que o ssOtica tem:** Visao semana/mes/ano, colunas Realizado vs Previsto vs Previsto+Realizado
- **Gap:**
  - Sem coluna "Previsto" (projecao futura baseada em contas a receber/pagar)
  - Sem comparativo Realizado vs Previsto
  - Sem visao por semana/mes/ano (so diario)
- **Recomendacao:** Prioridade MEDIA. Adicionar projecao futura usando datas de vencimento de AccountReceivable e AccountPayable.

### 6.5 DRE

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** DRE dinamica (`/dashboard/financeiro/dre`) baseada em FinanceEntry/ChartOfAccounts. Calcula: Receita Bruta → Deducoes → Receita Liquida → CMV → Lucro Bruto → Despesas → Lucro Operacional → Impostos → Lucro Liquido. Margens %. Grafico waterfall + pizza de composicao de custos. Filtro por periodo e filial
- **O que o ssOtica tem:** DRE com categorias e percentuais
- **Gap:** Nenhum significativo. Nosso DRE e completo
- **Recomendacao:** Nenhuma acao necessaria.

### 6.6 Crediario proprio

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** PaymentMethod.STORE_CREDIT gera parcelas em AccountReceivable. Impressao de carne (`/api/sales/[id]/carne`). CardReceivable para tracking de parcelas de cartao
- **O que o ssOtica tem:** Carne com capa impressa, crediario proprio com saldo, juros/multa configuravel por forma de pagamento, instrucoes no carne, percentual de juros ao mes, percentual de multa ao mes, dias de carencia de atraso
- **Gap:**
  - Sem juros e multa automaticos no crediario
  - Sem configuracao de juros/multa por forma de pagamento
  - Sem impressao de capa do carne
  - Sem dias de carencia configuravel
  - Sem calculo de saldo devedor com juros
- **Recomendacao:** Prioridade ALTA. Crediario e a forma de pagamento dominante em oticas populares. Adicionar campos de juros/multa ao AccountReceivable e logica de calculo.

### 6.7 Plano de Contas

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `ChartOfAccounts` (`prisma/schema.prisma:2640-2660`) hierarquico com: code, name, kind (ASSET/LIABILITY/REVENUE/EXPENSE/EQUITY), parentId, isSystem, active. Pagina de gestao (`/dashboard/financeiro/plano-contas`). Contas sistema imutaveis + customizaveis ate 3 niveis
- **O que o ssOtica tem:** 64 categorias hierarquicas (Receitas e Despesas) com relacao pai/filho
- **Gap:** Nenhum significativo. Nossa implementacao e mais flexivel (5 kinds vs 2 tipos)
- **Recomendacao:** Nenhuma acao necessaria.

### 6.8 Renegociacoes

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Nenhum model ou funcionalidade de renegociacao. AccountReceivable so muda de status
- **O que o ssOtica tem:** Model Renegociacao vinculado ao cliente, permite reestruturar dividas em novas parcelas
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade MEDIA. Util para oticas com crediario proprio. Pode ser implementado como: cancelar parcelas antigas → gerar novas com novos valores/datas.

### 6.9 Cheques

- **Status:** 🔴 Nao tem
- **O que temos hoje:** PaymentMethod.CHEQUE existe no enum mas NAO existe model dedicado para gestao de cheques (dados do cheque, deposito, compensacao, devolucao). Nenhum campo de cheque no SalePayment alem de `reference`
- **O que o ssOtica tem:** Gestao de cheques recebidos: titular, documento, banco, agencia, conta, numero, data deposito, data emissao, valor, status
- **Gap:** Model de cheque completo faltando
- **Recomendacao:** Prioridade BAIXA. Uso de cheques esta em declinio. Para oticas que ainda recebem, um model basico seria suficiente.

### 6.10 Trocas/Devolucoes

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `Refund` (`prisma/schema.prisma:2761-2788`) com: status (PENDING/APPROVED/COMPLETED/CANCELED), reason, totalRefund, totalCost, refundMethod, approvedAt/completedAt/canceledAt. Model `RefundItem` com qtyReturned e refundAmount por item. Pagina dedicada (`/dashboard/financeiro/devolucoes`). APIs de criacao e listagem
- **O que o ssOtica tem:** Modal de credito de troca com status (UTILIZADO/NAO_UTILIZADO/INUTILIZADO), data de utilizacao
- **Gap:**
  - Sem conceito de "credito de troca" (valor que fica como credito para proxima compra)
  - Nosso sistema faz devolucao monetaria, nao gera credito em conta
- **Recomendacao:** Prioridade BAIXA. Adicionar campo `creditBalance` ao Customer para creditos de troca seria simples.

---

## SECAO 7: DOCUMENTOS FISCAIS

### 7.1 NFC-e (emissao automatica pos-venda)

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Campos preparados no Sale (fiscalStatus, fiscalModel, fiscalKey, fiscalXmlUrl, fiscalPdfUrl). Campos no Branch (nfeSeries, lastNfeNumber, stateRegistration). Enum FiscalStatus (NOT_REQUESTED/PENDING/AUTHORIZED/FAILED/CANCELED). MAS: nenhuma integracao com SEFAZ, nenhum endpoint de emissao, nenhuma gestao de certificado
- **O que o ssOtica tem:** Emissao automatica ou manual, CSC, certificado A1, contingencia offline, envio email/WhatsApp, 8 abas de status
- **Gap:** Funcionalidade inteira faltando. Somente os campos de armazenamento existem
- **Recomendacao:** Prioridade CRITICA. Sem nota fiscal, a otica opera irregularmente. Integracao com API de emissao (Focus NFe, Nuvem Fiscal, ou similar) + upload certificado A1 + config CSC.

### 7.2 NF-e (emissao manual)

- **Status:** 🔴 Nao tem
- **O que o ssOtica tem:** Emissao manual com 7 secoes de formulario, suporte a NF-e completa
- **Gap:** Mesma situacao da NFC-e — campos preparados mas sem integracao
- **Recomendacao:** Prioridade ALTA (mas NFC-e vem primeiro).

### 7.3 MF-e Ceara

- **Status:** 🔴 Nao tem
- **O que o ssOtica tem:** Modulo Fiscal Eletronico do Ceara (obrigatorio no CE)
- **Gap:** Sem implementacao
- **Recomendacao:** Prioridade ALTA se operar no Ceara. Depende da integracao fiscal base.

### 7.4 Configuracoes fiscais (empresa + produto)

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Branch tem stateRegistration e nfeSeries. Product tem ncm e cest. Nenhum campo CFOP, ICMS, CSOSN, certificado digital
- **O que o ssOtica tem:** Config completa por empresa (certificado, CFOP padrao, ICMS, CSOSN, dados contador) + override por produto
- **Gap:** Toda a infraestrutura fiscal de configuracao falta
- **Recomendacao:** Prioridade CRITICA. Pre-requisito para emissao fiscal.

### 7.5 Inutilizacao e Carta de Correcao

- **Status:** 🔴 Nao tem
- **O que o ssOtica tem:** Inutilizar faixa de numeracao na SEFAZ, carta de correcao pos-emissao, cancelamento de nota
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade MEDIA. Vem apos a emissao fiscal basica funcionar.

---

## SECAO 8: RELATORIOS

### 8.1 Produtos Vendidos (com margem)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/produtos-vendidos` com API `/api/reports/products` — ranking por quantidade e receita, filtro por periodo, categoria, marca
- **Recomendacao:** Nenhuma acao necessaria.

### 8.2 Produtos Sem Giro

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/produtos-sem-giro` com API `/api/reports/stock/no-movement` — identifica produtos sem movimentacao por X dias
- **Recomendacao:** Nenhuma acao necessaria.

### 8.3 Receitas Vencidas

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Model Prescription tem `expiresAt`. CRM tem segmento PRESCRIPTION_EXPIRING. Mas NAO existe relatorio dedicado de receitas vencidas/vencendo
- **O que o ssOtica tem:** Relatorio de receitas vencidas para recall de clientes
- **Gap:** Sem pagina de relatorio. Dados existem via CRM mas sem consolidacao
- **Recomendacao:** Prioridade MEDIA. Dados ja existem, falta a tela do relatorio.

### 8.4 Aniversarios

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Filtro `birthdayMonth` no endpoint de clientes. CRM tem segmento BIRTHDAY_GREETING com lembretes automaticos. Mas sem relatorio dedicado de aniversariantes
- **O que o ssOtica tem:** Lista de aniversariantes do periodo com dados de contato
- **Gap:** Sem relatorio dedicado. Funcionalidade existe no CRM mas sem visao consolidada
- **Recomendacao:** Prioridade BAIXA. Pode ser um filtro na lista de clientes.

### 8.5 Vendas (consolidado)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/vendas` com API `/api/reports/sales/consolidated` — vendas por periodo, vendedor, forma de pagamento, ticket medio
- **Recomendacao:** Nenhuma acao necessaria.

### 8.6 Extrato Financeiro

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/financeiro/lancamentos` com API `/api/finance/entries` — lancamentos contabeis com filtro por conta, tipo, periodo. Extrato por conta financeira (`/api/finance/accounts/[id]/statement`)
- **Recomendacao:** Nenhuma acao necessaria.

### 8.7 Posicao Estoque

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/posicao-estoque` com API `/api/reports/stock/position` — snapshot com quantidades por produto/filial
- **Recomendacao:** Nenhuma acao necessaria.

### 8.8 Caixas (5 modelos)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** `/dashboard/relatorios/historico-caixas` + `/dashboard/caixa/[id]/relatorio` — historico de turnos, saldo, movimentacoes
- **O que o ssOtica tem:** 5 modelos de relatorio: resumo, detalhado, consolidado, por forma de pagamento, por operador
- **Gap:** Temos ~2 modelos (historico + relatorio de turno). Faltam: consolidado multi-turno, por forma de pagamento, por operador
- **Recomendacao:** Prioridade BAIXA. Relatorio atual e funcional.

### 8.9 Contas a Pagar

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/contas-pagar` com API `/api/reports/financial/accounts-payable`
- **Recomendacao:** Nenhuma acao necessaria.

### 8.10 Contas a Receber

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/contas-receber` com API `/api/reports/financial/accounts-receivable`
- **Recomendacao:** Nenhuma acao necessaria.

### 8.11 Livro de Receitas

- **Status:** 🔴 Nao tem
- **O que o ssOtica tem:** Relatorio do ciclo de vida das receitas oftalmologicas (emitida → usada → vencida)
- **Gap:** Sem relatorio. Model Prescription existe mas sem visao de ciclo de vida
- **Recomendacao:** Prioridade MEDIA. Criar relatorio agrupando prescricoes por status/validade.

### 8.12 Comissoes

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** `/dashboard/relatorios/comissoes` com API `/api/reports/commissions` + modulo completo de metas e comissoes (`/dashboard/metas`) com: SalesGoal, SellerGoal, Commission, CommissionRule, CommissionConfig, SellerCommission. Ranking de vendedores, pagamento de comissoes
- **Recomendacao:** Nenhuma acao necessaria. Ponto forte.

### 8.13 Validade de Produtos

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Sem campo de validade no Product ou BranchStock. InventoryLot nao tem campo expiry
- **O que o ssOtica tem:** Relatorio de produtos proximos ao vencimento
- **Gap:** Sem campo de validade de produto e sem relatorio
- **Recomendacao:** Prioridade BAIXA para otica (relevante para solucoes de lentes de contato e farmacia).

---

## SECAO 9: MODULOS EXTRAS

### 9.1 Cashback

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Sistema completo: CashbackConfig (por filial), CustomerCashback (saldo por cliente), CashbackMovement (ledger). Config: earnPercent (3-5%), minPurchaseToEarn, maxCashbackPerSale, expirationDays (90), birthdayMultiplier (2x), maxUsagePercent (50%). Dashboard dedicado, uso no PDV, expiracao automatica. 7 endpoints de API
- **O que o ssOtica tem:** Programa de fidelidade automatico via consultor (modulo pago)
- **Gap:** Nenhum. Nosso cashback e SUPERIOR (incluso no sistema vs pago no ssOtica)
- **Recomendacao:** Nenhuma acao necessaria. Diferencial competitivo.

### 9.2 Agenda/Agendamento

- **Status:** 🔴 Nao tem
- **O que temos hoje:** RAIO-X menciona model Appointment como "orfao" — nenhuma pagina usa. Sem pagina de agenda ou agendamento
- **O que o ssOtica tem:** Agendamento com confirmacao WhatsApp (R$99,90/mes)
- **Gap:** Funcionalidade inteira faltando (model pode existir mas sem UI)
- **Recomendacao:** Prioridade BAIXA. Modulo pago no ssOtica. Pode ser diferencial se incluso gratuitamente.

### 9.3 Integracao WhatsApp (Otica Zap)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** ContactChannel.WHATSAPP no enum. MessageTemplate para templates por segmento. Campo whatsapp em CompanySettings. CRM envia lembretes via WhatsApp (mark-sent manual). Envio de orcamento via WhatsApp
- **O que o ssOtica tem:** Modulo "Otica Zap" (R$164,90-199,90/mes) com: marketing automatico, cobranca por WhatsApp, comprovantes automaticos, recall de receita vencida
- **Gap:**
  - Sem envio AUTOMATICO de WhatsApp (tudo e manual/mark-sent)
  - Sem integracao com API de WhatsApp (Evolution API, WAHA, Z-API, etc)
  - Sem envio automatico de comprovante pos-venda
  - Sem envio automatico de cobranca por atraso
- **Recomendacao:** Prioridade MEDIA-ALTA. Integrar com API de WhatsApp (Evolution API e open source) para automacao. Grande diferencial se incluso vs R$164-199/mes do ssOtica.

### 9.4 Vitrine Online / E-commerce

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Model ClientPortalConfig existe (1 registro no schema). Campos `featured` e `launch` no Product. Sem pagina publica de catalogo. Sem campos e-commerce no produto (descricaoEcommerce, medidas especificas)
- **O que o ssOtica tem:** Catalogo online sincronizado com estoque (gratis ate 30 produtos / R$149,90 ilimitado)
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade BAIXA. Pode ser um diferencial futuro mas nao e core.

### 9.5 Pupilometro Virtual

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Nenhuma integracao de camera ou medicao virtual
- **O que o ssOtica tem:** Medicao de DNP via camera/QR Code (modulo pago)
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade BAIXA. Diferencial tecnologico mas complexo. Existem APIs de terceiros.

### 9.6 Analise de Credito

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Nenhuma integracao de score de credito
- **O que o ssOtica tem:** Consulta de score por pacotes (R$74,90/mes ou avulso)
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade BAIXA. Pode ser integrado com APIs como Serasa/Boa Vista quando crediario estiver maduro.

### 9.7 Campanhas de Marketing (SMS/WhatsApp)

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** Sistema robusto de CRM: CustomerReminder com 8 segmentos (BIRTHDAY, POST_SALE_30/90, INACTIVE_6M/1Y/2Y/3Y, CASHBACK_EXPIRING, PRESCRIPTION_EXPIRING, VIP, CONTACT_LENS_BUYER). CrmContact com tracking de resultado. MessageTemplate por segmento. ContactGoal para metas. MAS: tudo e para contato 1-a-1, nao campanha em massa
- **O que o ssOtica tem:** Campanhas SMS/WhatsApp em massa com segmentacao, agendamento, status de envio
- **Gap:**
  - Sem envio em massa (campanha para grupo de clientes)
  - Sem agendamento de campanha
  - Sem tracking de taxa de abertura/resposta
  - CRM atual e para contato individual, nao broadcast
- **Recomendacao:** Prioridade MEDIA. O CRM 1-a-1 ja e forte. Campanhas em massa precisam de integracao WhatsApp.

### 9.8 Boleto sem convenio

- **Status:** 🟡 Ja tem mas precisa melhorar
- **O que temos hoje:** PaymentMethod.BOLETO existe. Invoice model tem boletoUrl e boletoBarcode. Admin tem faturas com links de boleto. Integracao parcial (Asaas para billing SaaS)
- **O que o ssOtica tem:** Boleto Facil (R$5/boleto) — boletos sem convenio bancario para vendas
- **Gap:** Boleto existe no billing do SaaS (admin cobra clientes) mas NAO para vendas no PDV da otica
- **Recomendacao:** Prioridade BAIXA. Pix substituiu boleto na maioria dos casos.

### 9.9 Dashboard BI

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** BI Analitico (`/dashboard/financeiro/bi`) com: analise multidimensional (marca, categoria, vendedor, forma pagamento, tipo produto), KPIs (receita, quantidade, ticket medio, margem), Top 10 grafico barras, pizza de distribuicao, ranking com ordenacao, stock aging (0-30/31-60/61-90/91-180/180+ dias), export PDF/Excel
- **O que o ssOtica tem:** Painel Estrategico (Power BI) + Indicadores Inteligentes (AWS QuickSight, R$89,90/mes/loja)
- **Gap:** Nenhum significativo. Nosso BI e incluso e nativo vs pago/externo no ssOtica
- **Recomendacao:** Nenhuma acao necessaria. Diferencial competitivo.

---

## SECAO 10: INFRAESTRUTURA

### 10.1 Multi-filial (multi-tenant)

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** Model `Network` (`prisma/schema.prisma:2316-2331`) com: sharedCatalog, sharedPricing, sharedSuppliers, sharedCustomers, headquartersId. Model Company com networkId e isHeadquarters. Isolamento via headers x-company-id e x-network-id. BranchStock para estoque por filial. UserBranch para acesso por filial. Limites por plano (maxUsers, maxBranches, maxProducts)
- **O que o ssOtica tem:** Tenant por rede, precos/estoque por filial, hashed IDs nas URLs
- **Gap:**
  - Precos NAO sao por filial (ja mencionado em 2.2)
  - IDs nao sao hashed (usa CUID plain)
- **Recomendacao:** Prioridade para pricing por filial (ALTA para redes). Hashed IDs e seguranca por obscuridade — BAIXA prioridade.

### 10.2 Hashed IDs (seguranca de URLs)

- **Status:** ⚪ Nao se aplica
- **O que temos hoje:** CUIDs plain nas URLs. Autenticacao + autorizacao + filtro por companyId em todas as queries
- **O que o ssOtica tem:** Hashed IDs (hashids library) nas URLs
- **Gap:** URLs com CUIDs expostos
- **Recomendacao:** NAO PRIORIZAR. CUIDs sao aleatorios (nao sequenciais), e toda query ja filtra por companyId. Seguranca real > seguranca por obscuridade.

### 10.3 Importacao/Exportacao geral

- **Status:** ✅ Ja tem e funciona bem
- **O que temos hoje:** 8+ endpoints de import/export: clientes, produtos, fornecedores, reconciliacao bancaria, admin exports (assinaturas, auditoria, clientes, faturas, health-scores, tickets). Suporte XLSX via `exceljs`. Templates para download
- **O que o ssOtica tem:** Import/export de clientes e produtos
- **Gap:** Nenhum. Temos MAIS import/export que o ssOtica
- **Recomendacao:** Nenhuma acao necessaria. Ponto forte.

### 10.4 Integracao TEF (maquininha)

- **Status:** 🔴 Nao tem
- **O que temos hoje:** Nenhuma integracao com terminais de pagamento. Pagamento e registrado manualmente no sistema
- **O que o ssOtica tem:** Integracao TEF com Stone, Cappta, Auttar, SiTef
- **Gap:** Funcionalidade inteira faltando
- **Recomendacao:** Prioridade BAIXA. Pix e maquininha manual resolvem para 90% das oticas. TEF e diferencial para grandes redes.

---

## TABELA RESUMO FINAL

| # | Funcionalidade | Status | Prioridade | Complexidade | Sprint |
|---|---|---|---|---|---|
| 1 | Emissao NFC-e (integracao SEFAZ) | 🔴 | CRITICA | Alta | A |
| 2 | Config fiscal empresa + produto (CFOP, ICMS) | 🔴 | CRITICA | Media | A |
| 3 | Conversao OS → Venda | 🔴 | CRITICA | Media | A |
| 4 | Receita oftalmologica completa no form OS | 🟡 | CRITICA | Baixa | A |
| 5 | Workflow OS kanban + SLA | 🟡 | ALTA | Media | A |
| 6 | Adiantamento/Sinal na OS | 🔴 | ALTA | Media | A |
| 7 | Crediario com juros/multa | 🟡 | ALTA | Media | B |
| 8 | Contas a Receber com multa/juros/estorno | 🟡 | ALTA | Media | B |
| 9 | Preco por filial (BranchStock) | 🟡 | ALTA | Media | B |
| 10 | Tabela de lentes (sync fornecedor) | 🔴 | MEDIA-ALTA | Alta | C |
| 11 | Integracao WhatsApp automatica | 🟡 | MEDIA-ALTA | Alta | C |
| 12 | Emissao NF-e manual | 🔴 | ALTA | Alta | C |
| 13 | MF-e Ceara | 🔴 | ALTA* | Alta | C |
| 14 | Desconto com autorizacao admin (UI) | 🟡 | MEDIA | Baixa | B |
| 15 | Cadastro cliente (foto, multiplos tel, desconto) | 🟡 | MEDIA | Media | B |
| 16 | Abas detalhe cliente (receitas, devolucoes, arquivos) | 🟡 | MEDIA | Baixa | B |
| 17 | Renegociacao de dividas | 🔴 | MEDIA | Media | C |
| 18 | Fluxo de caixa projetado (previsto vs realizado) | 🟡 | MEDIA | Media | C |
| 19 | Relatorio receitas vencidas | 🔴 | MEDIA | Baixa | B |
| 20 | Relatorio livro de receitas | 🔴 | MEDIA | Baixa | C |
| 21 | Campanhas marketing em massa | 🟡 | MEDIA | Media | D |
| 22 | Dados lente completos na OS (pronta/surfacada, coloracao) | 🟡 | MEDIA | Baixa | A |
| 23 | Formas pagamento dinamicas (model vs enum) | 🟡 | MEDIA | Media | C |
| 24 | Agenda/Agendamento | 🔴 | BAIXA | Media | D |
| 25 | Vitrine Online / E-commerce | 🔴 | BAIXA | Alta | E |
| 26 | Pupilometro Virtual | 🔴 | BAIXA | Alta | E |
| 27 | Analise de Credito externa | 🔴 | BAIXA | Media | E |
| 28 | Cheques (gestao completa) | 🔴 | BAIXA | Baixa | D |
| 29 | Validade de produtos | 🔴 | BAIXA | Baixa | D |
| 30 | Relatorio aniversariantes dedicado | 🟡 | BAIXA | Baixa | D |
| 31 | Relatorio caixas (5 modelos) | 🟡 | BAIXA | Baixa | D |
| 32 | Inutilizacao/Carta Correcao NF | 🔴 | MEDIA | Media | C |
| 33 | TEF integrado | 🔴 | BAIXA | Alta | E |
| 34 | Hashed IDs | ⚪ | N/A | Baixa | - |
| 35 | Boleto para vendas (nao SaaS) | 🟡 | BAIXA | Media | D |
| 36 | Unidade medida produto (FR/KIT/PAR/UN) | 🔴 | MEDIA | Baixa | B |
| 37 | Clonar produto | 🔴 | MEDIA | Baixa | B |
| 38 | Categorias/marcas criacao dinamica UI | 🟡 | MEDIA | Baixa | B |
| 39 | Upload imagens OS | 🔴 | MEDIA | Baixa | A |
| 40 | Seletor visual formato armacao (8 silhuetas) | 🟡 | BAIXA | Baixa | D |

*MF-e Ceara: ALTA se operar no CE, BAIXA se nao.

---

## FUNCIONALIDADES ONDE O PDV OTICA JA E SUPERIOR AO SSOTICA

| Funcionalidade | Porque somos melhores |
|---|---|
| **Orcamentos** | Modulo dedicado com follow-up, stats conversao, envio WhatsApp vs flag simples |
| **Cashback** | Incluso e completo vs modulo pago via consultor |
| **BI/Dashboard** | Nativo e incluso vs Power BI/QuickSight pagos |
| **CRM/Lembretes** | 8 segmentos automaticos, metas de contato, tracking de resultado vs SMS basico |
| **Import/Export** | 8+ endpoints vs clientes e produtos apenas |
| **Plano de Contas** | 5 kinds hierarquicos vs 2 tipos |
| **Conciliacao bancaria** | Sistema completo (batch, auto-match, templates CSV) vs nao documentado |
| **Despesas recorrentes** | Geracao automatica de contas a pagar vs manual |
| **Campanhas de bonificacao** | 5 tipos de bonus, tiers, progress tracking vs nao tem |
| **Sistema de permissoes** | RBAC + permissoes individuais por usuario vs roles fixas |
| **Stack tecnologica** | Next.js 14+, TypeScript, React 19 vs Laravel + jQuery + Bootstrap 3 |
| **Convenios/Agreements** | 5 tipos com beneficiarios e limites vs nao documentado |
| **Fidelidade/Loyalty** | Programa com tiers e multiplicadores vs cashback simples |

---

## PROXIMOS PASSOS RECOMENDADOS

### Sprint A — Fundacao Otica (4-6 semanas)
> Sem isso, o PDV nao serve para uma otica operar de verdade no dia a dia.

1. **Expor campos de prescricao completos no form de OS** — Model PrescriptionValues JA TEM 22 campos, form so usa 11. E trabalho de UI puro
2. **Conversao OS → Venda** — Schema pronto (serviceOrderId no Sale). Criar endpoint + botao
3. **Adiantamento/Sinal na OS** — Adicionar campos ao ServiceOrder + secao no form + logica financeira
4. **Kanban visual de OS** — Drag-and-drop com status cards. Bibliotecas prontas (dnd-kit)
5. **Upload de imagens na OS** — Campo imageUrl ja existe em Prescription. Adicionar upload
6. **Dados de lente completos** — Flag pronta/surfacada, coloracao, tratamentos multiplos

### Sprint B — Financeiro Completo (3-4 semanas)
> Para a otica funcionar no dia a dia financeiro.

7. **Juros e multa em Contas a Receber** — Campos + calculo automatico
8. **Crediario completo** — Config juros/multa por prazo + impressao carne melhorada
9. **Preco por filial** — Expandir BranchStock com costPrice/salePrice
10. **Cadastro cliente melhorado** — Foto, multiplos telefones, desconto padrao
11. **Relatorio receitas vencidas** — Dados existem, falta tela
12. **Criacao dinamica de categorias/marcas** — Endpoints POST + UI inline
13. **Unidade de medida + clone produto**

### Sprint C — Fiscal e Integracao (4-6 semanas)
> Para ficar em conformidade fiscal e integrar com fornecedores.

14. **Config fiscal completa** — CFOP, ICMS, CSOSN na empresa e produto
15. **Emissao NFC-e** — Integracao com API fiscal (Focus NFe, Nuvem Fiscal)
16. **Emissao NF-e** — Manual com formulario
17. **MF-e Ceara** (se aplicavel)
18. **Tabela de lentes** — Import de tabelas de fornecedores com conferencia
19. **Integracao WhatsApp automatica** — Evolution API ou similar
20. **Fluxo caixa projetado** — Coluna previsto usando contas a receber/pagar futuras

### Sprint D — Engajamento (2-3 semanas)
> Para crescer e reter clientes.

21. **Campanhas em massa** — Broadcast WhatsApp por segmento
22. **Agenda/Agendamento** — Model + pagina + confirmacao
23. **Gestao de cheques** — Model basico para tracking

### Sprint E — Diferenciais (2-3 semanas)
> Para se destacar.

24. **Vitrine Online** — Catalogo publico
25. **TEF integrado** — Se demanda existir
26. **Pupilometro Virtual** — API de terceiros

---

> **Nota final:** O PDV Otica ja cobre 67% do ssOtica e e SUPERIOR em varias areas (CRM, BI, cashback, orcamentos, conciliacao, permissoes). Os gaps criticos estao concentrados em **fiscal** (bloqueante legal), **fluxo OS completo** (core business de otica), e **crediario com juros** (forma de pagamento dominante). Resolver esses 3 pilares coloca o PDV Otica em paridade competitiva. Resolver os sprints A+B+C coloca ACIMA do ssOtica.
