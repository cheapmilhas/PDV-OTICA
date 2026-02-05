-- ============================================
-- SEED: Dados Iniciais do Sistema
-- Execute no SQL Editor do Neon
-- ============================================

-- 1. Criar Empresa
INSERT INTO "Company" ("id", "name", "tradeName", "cnpj", "phone", "email", "address", "city", "state", "zipCode", "createdAt", "updatedAt")
VALUES ('cm_001', 'Ótica Visão Clara', 'Visão Clara', '12345678000190', '(11) 3456-7890', 'contato@oticavisaoclara.com.br', 'Rua das Flores, 123', 'São Paulo', 'SP', '01234-567', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 2. Criar Filial
INSERT INTO "Branch" ("id", "companyId", "name", "code", "phone", "address", "city", "state", "zipCode", "active", "createdAt", "updatedAt")
VALUES ('br_001', 'cm_001', 'Matriz - Centro', 'MTZ01', '(11) 3456-7890', 'Rua das Flores, 123', 'São Paulo', 'SP', '01234-567', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 3. Criar Usuários (senha: admin123 - hash bcrypt)
INSERT INTO "User" ("id", "companyId", "name", "email", "passwordHash", "role", "active", "createdAt", "updatedAt")
VALUES
  ('usr_admin', 'cm_001', 'Admin Sistema', 'admin@pdvotica.com', '$2a$10$rT5qVHHxZ8jX8YvGxPzU0.gKqXQZ1qZ1qZ1qZ1qZ1qZ1qZ1qZ1qZu', 'ADMIN', true, NOW(), NOW()),
  ('usr_vendedor', 'cm_001', 'Carlos Vendedor', 'vendedor@pdvotica.com', '$2a$10$rT5qVHHxZ8jX8YvGxPzU0.gKqXQZ1qZ1qZ1qZ1qZ1qZ1qZ1qZ1qZu', 'VENDEDOR', true, NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;

-- 4. Vincular Usuários à Filial
INSERT INTO "UserBranch" ("userId", "branchId")
VALUES
  ('usr_admin', 'br_001'),
  ('usr_vendedor', 'br_001')
ON CONFLICT DO NOTHING;

-- 5. Criar Categorias
INSERT INTO "Category" ("id", "companyId", "name", "active")
VALUES
  ('cat_001', 'cm_001', 'Armações', true),
  ('cat_002', 'cm_001', 'Lentes', true),
  ('cat_003', 'cm_001', 'Óculos de Sol', true),
  ('cat_004', 'cm_001', 'Acessórios', true)
ON CONFLICT DO NOTHING;

-- 6. Criar Marcas
INSERT INTO "Brand" ("id", "companyId", "code", "name", "active", "createdAt", "updatedAt")
VALUES
  ('brd_001', 'cm_001', 'RB', 'Ray-Ban', true, NOW(), NOW()),
  ('brd_002', 'cm_001', 'OK', 'Oakley', true, NOW(), NOW()),
  ('brd_003', 'cm_001', 'ZS', 'Zeiss', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 7. Criar Clientes
INSERT INTO "Customer" ("id", "companyId", "name", "email", "phone", "cpf", "birthDate", "address", "city", "state", "zipCode", "active", "createdAt", "updatedAt")
VALUES
  ('cst_001', 'cm_001', 'Maria Silva Santos', 'maria.santos@email.com', '(11) 98765-4321', '12345678901', '1985-03-15', 'Rua das Acácias, 456', 'São Paulo', 'SP', '02345-678', true, NOW(), NOW()),
  ('cst_002', 'cm_001', 'João Pedro Oliveira', 'joao.oliveira@email.com', '(11) 97654-3210', '23456789012', '1990-07-22', 'Av. Paulista, 1000', 'São Paulo', 'SP', '01310-100', true, NOW(), NOW()),
  ('cst_003', 'cm_001', 'Ana Costa Lima', 'ana.costa@email.com', '(11) 96543-2109', '34567890123', '1978-11-05', 'Rua Augusta, 200', 'São Paulo', 'SP', '01305-000', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 8. Criar Produtos
INSERT INTO "Product" ("id", "companyId", "type", "sku", "name", "categoryId", "brandId", "costPrice", "salePrice", "stockQty", "stockMin", "active", "createdAt", "updatedAt")
VALUES
  ('prd_001', 'cm_001', 'FRAME', 'RB-AVI-001', 'Ray-Ban Aviador Clássico RB3025', 'cat_001', 'brd_001', 450.00, 899.90, 15, 5, true, NOW(), NOW()),
  ('prd_002', 'cm_001', 'FRAME', 'OK-HOL-001', 'Oakley Holbrook OO9102', 'cat_001', 'brd_002', 625.00, 1249.90, 8, 5, true, NOW(), NOW()),
  ('prd_003', 'cm_001', 'LENS_SERVICE', 'ZS-SV-167', 'Lente Zeiss Single Vision 1.67', 'cat_002', 'brd_003', 600.00, 1200.00, 10, 3, true, NOW(), NOW()),
  ('prd_004', 'cm_001', 'SUNGLASSES', 'RB-WAY-001', 'Ray-Ban Wayfarer RB2140', 'cat_003', 'brd_001', 400.00, 799.90, 20, 10, true, NOW(), NOW()),
  ('prd_005', 'cm_001', 'ACCESSORY', 'ACC-LIQ-001', 'Líquido de Limpeza 50ml', 'cat_004', NULL, 10.00, 25.00, 45, 20, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 9. Criar uma venda de exemplo
INSERT INTO "Sale" ("id", "companyId", "branchId", "customerId", "sellerUserId", "status", "subtotal", "discountTotal", "total", "createdAt", "updatedAt", "completedAt")
VALUES ('sal_001', 'cm_001', 'br_001', 'cst_001', 'usr_vendedor', 'COMPLETED', 899.90, 0, 899.90, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- 10. Itens da venda
INSERT INTO "SaleItem" ("id", "saleId", "productId", "description", "qty", "unitPrice", "discount", "lineTotal", "costPrice", "createdAt")
VALUES ('sli_001', 'sal_001', 'prd_001', 'Ray-Ban Aviador Clássico RB3025', 1, 899.90, 0, 899.90, 450.00, NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- 11. Pagamento da venda
INSERT INTO "SalePayment" ("id", "saleId", "method", "status", "amount", "receivedAt", "receivedByUserId", "createdAt")
VALUES ('spy_001', 'sal_001', 'CREDIT_CARD', 'RECEIVED', 899.90, NOW() - INTERVAL '2 days', 'usr_vendedor', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

SELECT '✅ Seed concluído! Dados iniciais criados com sucesso.' AS resultado;
