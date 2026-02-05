-- ============================================
-- PARTE 2: Clientes, Médicos e Catálogo
-- Execute após a Parte 1
-- ============================================

CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "acceptsMarketing" BOOLEAN NOT NULL DEFAULT true,
    "referralSource" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Customer_companyId_name_idx" ON "Customer"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
CREATE INDEX IF NOT EXISTS "Customer_companyId_email_idx" ON "Customer"("companyId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_companyId_cpf_key" ON "Customer"("companyId", "cpf");

CREATE TABLE IF NOT EXISTS "CustomerDependent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "cpf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerDependent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerDependent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CustomerDependent_customerId_idx" ON "CustomerDependent"("customerId");

CREATE TABLE IF NOT EXISTS "Doctor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crm" TEXT,
    "uf" TEXT,
    "specialty" TEXT,
    "isPartner" BOOLEAN NOT NULL DEFAULT false,
    "partnerCommissionPercent" DECIMAL(5,2),
    "phone" TEXT,
    "email" TEXT,
    "clinicName" TEXT,
    "clinicAddress" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Doctor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Doctor_companyId_name_idx" ON "Doctor"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Doctor_companyId_crm_uf_key" ON "Doctor"("companyId", "crm", "uf");

CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "defaultCommissionPercent" DECIMAL(5,2),
    "minMarginPercent" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Category_companyId_name_key" ON "Category"("companyId", "name");

CREATE TABLE IF NOT EXISTS "Brand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "minMargin" DECIMAL(5,2),
    "maxDiscount" DECIMAL(5,2),
    "segment" TEXT,
    "origin" TEXT,
    "logoPath" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Brand_companyId_name_idx" ON "Brand"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Brand_companyId_code_key" ON "Brand"("companyId", "code");

CREATE TABLE IF NOT EXISTS "Shape" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "faceTypes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Shape_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Shape_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Shape_companyId_code_key" ON "Shape"("companyId", "code");

CREATE TABLE IF NOT EXISTS "Color" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Color_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Color_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Color_companyId_code_key" ON "Color"("companyId", "code");
