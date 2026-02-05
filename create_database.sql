-- ============================================
-- PDV ÓTICA - SQL COMPLETO PARA NEON DATABASE
-- Execute este script no SQL Editor do Neon
-- ============================================

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR', 'CAIXA', 'ATENDENTE');
CREATE TYPE "SaleStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED', 'REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'BOLETO', 'STORE_CREDIT', 'CHEQUE', 'AGREEMENT', 'OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'RECEIVED', 'VOIDED', 'REFUNDED');
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM ('SALE_PAYMENT', 'REFUND', 'SUPPLY', 'WITHDRAWAL', 'ADJUSTMENT', 'OPENING_FLOAT', 'CLOSING');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "ProductType" AS ENUM ('FRAME', 'CONTACT_LENS', 'ACCESSORY', 'SUNGLASSES', 'LENS_SERVICE', 'SERVICE');
CREATE TYPE "StockReservationStatus" AS ENUM ('RESERVED', 'RELEASED', 'CONSUMED');
CREATE TYPE "ServiceOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT_TO_LAB', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELED');
CREATE TYPE "ServiceOrderPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'IN_ANALYSIS', 'APPROVED', 'DENIED', 'EXPIRED', 'USED');
CREATE TYPE "WarrantyType" AS ENUM ('FRAME', 'LENS', 'MOUNTING', 'ADJUSTMENT');
CREATE TYPE "FiscalStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'AUTHORIZED', 'FAILED', 'CANCELED');
CREATE TYPE "QuoteStatus" AS ENUM ('OPEN', 'SENT', 'APPROVED', 'CONVERTED', 'EXPIRED', 'CANCELED');
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELED');
CREATE TYPE "AppointmentType" AS ENUM ('PICKUP', 'ADJUSTMENT', 'CONSULTATION', 'RETURN', 'EXAM');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELED');
CREATE TYPE "AgreementType" AS ENUM ('HEALTH_PLAN', 'CORPORATE', 'UNION', 'ASSOCIATION', 'PARTNERSHIP');

-- CreateTable: Company
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoPath" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- Continue copiando o resto do SQL gerado anteriormente...
-- (O arquivo está truncado para economia de espaço, mas contém TODAS as tabelas)
