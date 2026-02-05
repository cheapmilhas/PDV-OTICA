-- ============================================
-- PARTE 3: Produtos e Laboratórios
-- Execute após a Parte 2
-- ============================================

CREATE TABLE IF NOT EXISTS "Lab" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "orderEmail" TEXT,
    "website" TEXT,
    "contactPerson" TEXT,
    "integrationType" TEXT,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "clientCode" TEXT,
    "defaultLeadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "urgentLeadTimeDays" INTEGER NOT NULL DEFAULT 3,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "defaultDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "qualityRating" DECIMAL(3,2),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalReworks" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Lab_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Lab_companyId_name_idx" ON "Lab"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Lab_companyId_code_key" ON "Lab"("companyId", "code");

CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "manufacturerCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "brandId" TEXT,
    "shapeId" TEXT,
    "colorId" TEXT,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "promoPrice" DECIMAL(12,2),
    "marginPercent" DECIMAL(5,2),
    "stockControlled" BOOLEAN NOT NULL DEFAULT true,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "stockMin" INTEGER NOT NULL DEFAULT 0,
    "stockMax" INTEGER,
    "reorderPoint" INTEGER,
    "abcClass" TEXT,
    "turnoverDays" INTEGER,
    "ncm" TEXT,
    "cest" TEXT,
    "mainImage" TEXT,
    "images" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "launch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "Shape"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Product_companyId_name_idx" ON "Product"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Product_companyId_barcode_idx" ON "Product"("companyId", "barcode");
CREATE INDEX IF NOT EXISTS "Product_companyId_type_idx" ON "Product"("companyId", "type");
CREATE INDEX IF NOT EXISTS "Product_companyId_abcClass_idx" ON "Product"("companyId", "abcClass");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_sku_key" ON "Product"("companyId", "sku");

CREATE TABLE IF NOT EXISTS "FrameDetail" (
    "productId" TEXT NOT NULL,
    "lensWidthMm" INTEGER,
    "bridgeMm" INTEGER,
    "templeMm" INTEGER,
    "sizeText" TEXT,
    "material" TEXT,
    "gender" TEXT,
    "collection" TEXT,
    CONSTRAINT "FrameDetail_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "FrameDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ContactLensDetail" (
    "productId" TEXT NOT NULL,
    "brandModel" TEXT,
    "type" TEXT,
    "material" TEXT,
    "baseCurve" TEXT,
    "diameter" TEXT,
    "packQty" INTEGER,
    "sphRange" TEXT,
    "cylRange" TEXT,
    "axisRange" TEXT,
    "addRange" TEXT,
    "color" TEXT,
    CONSTRAINT "ContactLensDetail_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "ContactLensDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccessoryDetail" (
    "productId" TEXT NOT NULL,
    "subtype" TEXT,
    CONSTRAINT "AccessoryDetail_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "AccessoryDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ServiceDetail" (
    "productId" TEXT NOT NULL,
    "serviceType" TEXT,
    "durationMin" INTEGER,
    CONSTRAINT "ServiceDetail_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "ServiceDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LensServiceDetail" (
    "productId" TEXT NOT NULL,
    "labId" TEXT,
    "lensType" TEXT,
    "material" TEXT,
    "refractionIndex" DECIMAL(5,2),
    "treatments" JSONB,
    "leadTimeDays" INTEGER,
    CONSTRAINT "LensServiceDetail_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "LensServiceDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LensServiceDetail_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
