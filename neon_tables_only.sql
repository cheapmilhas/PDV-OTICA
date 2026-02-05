-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateEnum
-- CreateTable
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
-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "stateRegistration" TEXT,
    "nfeSeries" INTEGER,
    "lastNfeNumber" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultCommissionPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "UserBranch" (
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("userId","branchId")
);
-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Customer" (
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
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CustomerDependent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "cpf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerDependent_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Doctor" (
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
    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Lab" (
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
    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LabPriceRange" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "lensType" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "sphMin" DECIMAL(5,2),
    "sphMax" DECIMAL(5,2),
    "cylMin" DECIMAL(5,2),
    "cylMax" DECIMAL(5,2),
    "labPrice" DECIMAL(12,2) NOT NULL,
    "suggestedPrice" DECIMAL(12,2),
    "arPrice" DECIMAL(12,2),
    "blueLightPrice" DECIMAL(12,2),
    "photochromicPrice" DECIMAL(12,2),
    "leadTimeDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LabPriceRange_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "defaultCommissionPercent" DECIMAL(5,2),
    "minMarginPercent" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Brand" (
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
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Shape" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "faceTypes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Shape_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Color" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Color_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Product" (
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
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FrameDetail" (
    "productId" TEXT NOT NULL,
    "lensWidthMm" INTEGER,
    "bridgeMm" INTEGER,
    "templeMm" INTEGER,
    "sizeText" TEXT,
    "material" TEXT,
    "gender" TEXT,
    "collection" TEXT,
    CONSTRAINT "FrameDetail_pkey" PRIMARY KEY ("productId")
);
-- CreateTable
CREATE TABLE "ContactLensDetail" (
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
    CONSTRAINT "ContactLensDetail_pkey" PRIMARY KEY ("productId")
);
-- CreateTable
CREATE TABLE "AccessoryDetail" (
    "productId" TEXT NOT NULL,
    "subtype" TEXT,
    CONSTRAINT "AccessoryDetail_pkey" PRIMARY KEY ("productId")
);
-- CreateTable
CREATE TABLE "ServiceDetail" (
    "productId" TEXT NOT NULL,
    "serviceType" TEXT,
    "durationMin" INTEGER,
    CONSTRAINT "ServiceDetail_pkey" PRIMARY KEY ("productId")
);
-- CreateTable
CREATE TABLE "LensServiceDetail" (
    "productId" TEXT NOT NULL,
    "labId" TEXT,
    "lensType" TEXT,
    "material" TEXT,
    "refractionIndex" DECIMAL(5,2),
    "treatments" JSONB,
    "leadTimeDays" INTEGER,
    CONSTRAINT "LensServiceDetail_pkey" PRIMARY KEY ("productId")
);
-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "doctorId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "prescriptionType" TEXT,
    "notes" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PrescriptionValues" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "odSph" DECIMAL(6,2),
    "odCyl" DECIMAL(6,2),
    "odAxis" INTEGER,
    "odAdd" DECIMAL(6,2),
    "odPrism" DECIMAL(6,2),
    "odBase" TEXT,
    "oeSph" DECIMAL(6,2),
    "oeCyl" DECIMAL(6,2),
    "oeAxis" INTEGER,
    "oeAdd" DECIMAL(6,2),
    "oePrism" DECIMAL(6,2),
    "oeBase" TEXT,
    "pdFar" DECIMAL(5,2),
    "pdNear" DECIMAL(5,2),
    "fittingHeightOd" DECIMAL(5,2),
    "fittingHeightOe" DECIMAL(5,2),
    "pantoscopicAngle" DECIMAL(5,2),
    "vertexDistance" DECIMAL(5,2),
    "frameCurvature" DECIMAL(5,2),
    CONSTRAINT "PrescriptionValues_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "ServiceOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "promisedDate" TIMESTAMP(3),
    "deliveredDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ServiceOrderItem" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "labId" TEXT,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "costEstimated" DECIMAL(12,2),
    "measurementsSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ServiceOrderHistory" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "fromStatus" "ServiceOrderStatus",
    "toStatus" "ServiceOrderStatus" NOT NULL,
    "note" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderHistory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QualityChecklist" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "lensGradeOk" BOOLEAN NOT NULL DEFAULT false,
    "lensCenteringOk" BOOLEAN NOT NULL DEFAULT false,
    "lensHeightOk" BOOLEAN NOT NULL DEFAULT false,
    "treatmentsOk" BOOLEAN NOT NULL DEFAULT false,
    "frameAdjustmentOk" BOOLEAN NOT NULL DEFAULT false,
    "cleaningOk" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "checkedByUserId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "customerApproved" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "QualityChecklist_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "saleId" TEXT,
    "qty" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "sellerUserId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'OPEN',
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastFollowUpAt" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "conversionReason" TEXT,
    "convertedToSaleId" TEXT,
    "convertedToOsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "serviceOrderId" TEXT,
    "sellerUserId" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "agreementId" TEXT,
    "agreementDiscount" DECIMAL(12,2),
    "authorizationCode" TEXT,
    "fiscalStatus" "FiscalStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "fiscalModel" TEXT,
    "fiscalKey" TEXT,
    "fiscalXmlUrl" TEXT,
    "fiscalPdfUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stockControlled" BOOLEAN NOT NULL DEFAULT true,
    "stockQtyConsumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "installments" INTEGER,
    "cardBrand" TEXT,
    "reference" TEXT,
    "details" JSONB,
    "receivedAt" TIMESTAMP(3),
    "receivedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "categoryId" TEXT,
    "brandId" TEXT,
    "percentage" DECIMAL(5,2) NOT NULL,
    "minMarginPercent" DECIMAL(5,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closingDeclaredCash" DECIMAL(12,2),
    "closingExpectedCash" DECIMAL(12,2),
    "differenceCash" DECIMAL(12,2),
    "differenceJustification" TEXT,
    "notes" TEXT,
    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "originType" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "salePaymentId" TEXT,
    "createdByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "serviceOrderId" TEXT,
    "serviceOrderItemId" TEXT,
    "warrantyType" "WarrantyType" NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "termsDescription" TEXT,
    "notes" TEXT,
    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "problemDescription" TEXT,
    "resolution" TEXT,
    "resolutionType" TEXT,
    "filesUrl" TEXT[],
    "analyzedByUserId" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "notes" TEXT,
    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "serviceOrderId" TEXT,
    "assignedUserId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "checkinAt" TIMESTAMP(3),
    "checkoutAt" TIMESTAMP(3),
    "attendedByUserId" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contactPerson" TEXT,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "billingDay" INTEGER,
    "minPurchase" DECIMAL(12,2),
    "maxPurchase" DECIMAL(12,2),
    "monthlyLimit" DECIMAL(12,2),
    "contractPath" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AgreementBeneficiary" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "enrollmentNumber" TEXT,
    "isHolder" BOOLEAN NOT NULL DEFAULT true,
    "holderId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AgreementBeneficiary_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsPerReal" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "reaisPerPoint" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "pointsExpire" BOOLEAN NOT NULL DEFAULT true,
    "expirationDays" INTEGER NOT NULL DEFAULT 365,
    "minRedemption" INTEGER NOT NULL DEFAULT 100,
    "birthdayMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LoyaltyTier" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pointsMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "priorityService" BOOLEAN NOT NULL DEFAULT false,
    "exclusiveGifts" BOOLEAN NOT NULL DEFAULT false,
    "badgeColor" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LoyaltyTier_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LoyaltyPoints" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "saleId" TEXT,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyPoints_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DREReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT,
    "grossRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returns" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costOfGoodsSold" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labCosts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "personnelExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rentExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adminExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marketingExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "financialExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "operatingProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossMarginPercent" DECIMAL(5,2),
    "operatingMarginPercent" DECIMAL(5,2),
    "netMarginPercent" DECIMAL(5,2),
    CONSTRAINT "DREReport_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");
-- CreateIndex
CREATE INDEX "Branch_companyId_name_idx" ON "Branch"("companyId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");
-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");
-- CreateIndex
CREATE INDEX "User_companyId_name_idx" ON "User"("companyId", "name");
-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");
-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt");
-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");
-- CreateIndex
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
-- CreateIndex
CREATE INDEX "Customer_companyId_email_idx" ON "Customer"("companyId", "email");
-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_cpf_key" ON "Customer"("companyId", "cpf");
-- CreateIndex
CREATE INDEX "CustomerDependent_customerId_idx" ON "CustomerDependent"("customerId");
-- CreateIndex
CREATE INDEX "Doctor_companyId_name_idx" ON "Doctor"("companyId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "Doctor_companyId_crm_uf_key" ON "Doctor"("companyId", "crm", "uf");
-- CreateIndex
CREATE INDEX "Lab_companyId_name_idx" ON "Lab"("companyId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "Lab_companyId_code_key" ON "Lab"("companyId", "code");
-- CreateIndex
CREATE INDEX "LabPriceRange_labId_lensType_material_idx" ON "LabPriceRange"("labId", "lensType", "material");
-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");
-- CreateIndex
CREATE INDEX "Brand_companyId_name_idx" ON "Brand"("companyId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "Brand_companyId_code_key" ON "Brand"("companyId", "code");
-- CreateIndex
CREATE UNIQUE INDEX "Shape_companyId_code_key" ON "Shape"("companyId", "code");
-- CreateIndex
CREATE UNIQUE INDEX "Color_companyId_code_key" ON "Color"("companyId", "code");
-- CreateIndex
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");
-- CreateIndex
CREATE INDEX "Product_companyId_barcode_idx" ON "Product"("companyId", "barcode");
-- CreateIndex
CREATE INDEX "Product_companyId_type_idx" ON "Product"("companyId", "type");
-- CreateIndex
CREATE INDEX "Product_companyId_abcClass_idx" ON "Product"("companyId", "abcClass");
-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
-- CreateIndex
CREATE INDEX "Prescription_companyId_customerId_idx" ON "Prescription"("companyId", "customerId");
-- CreateIndex
CREATE INDEX "Prescription_customerId_expiresAt_idx" ON "Prescription"("customerId", "expiresAt");
-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionValues_prescriptionId_key" ON "PrescriptionValues"("prescriptionId");
-- CreateIndex
CREATE INDEX "ServiceOrder_branchId_status_promisedDate_idx" ON "ServiceOrder"("branchId", "status", "promisedDate");
-- CreateIndex
CREATE INDEX "ServiceOrder_companyId_customerId_idx" ON "ServiceOrder"("companyId", "customerId");
-- CreateIndex
CREATE INDEX "ServiceOrder_status_promisedDate_idx" ON "ServiceOrder"("status", "promisedDate");
-- CreateIndex
CREATE INDEX "ServiceOrderHistory_serviceOrderId_createdAt_idx" ON "ServiceOrderHistory"("serviceOrderId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "QualityChecklist_serviceOrderId_key" ON "QualityChecklist"("serviceOrderId");
-- CreateIndex
CREATE INDEX "StockReservation_branchId_productId_status_idx" ON "StockReservation"("branchId", "productId", "status");
-- CreateIndex
CREATE INDEX "StockReservation_serviceOrderId_idx" ON "StockReservation"("serviceOrderId");
-- CreateIndex
CREATE INDEX "StockReservation_saleId_idx" ON "StockReservation"("saleId");
-- CreateIndex
CREATE INDEX "Quote_branchId_status_createdAt_idx" ON "Quote"("branchId", "status", "createdAt");
-- CreateIndex
CREATE INDEX "Quote_customerId_createdAt_idx" ON "Quote"("customerId", "createdAt");
-- CreateIndex
CREATE INDEX "Quote_status_validUntil_idx" ON "Quote"("status", "validUntil");
-- CreateIndex
CREATE UNIQUE INDEX "Sale_serviceOrderId_key" ON "Sale"("serviceOrderId");
-- CreateIndex
CREATE INDEX "Sale_companyId_branchId_createdAt_idx" ON "Sale"("companyId", "branchId", "createdAt");
-- CreateIndex
CREATE INDEX "Sale_customerId_createdAt_idx" ON "Sale"("customerId", "createdAt");
-- CreateIndex
CREATE INDEX "Sale_sellerUserId_createdAt_idx" ON "Sale"("sellerUserId", "createdAt");
-- CreateIndex
CREATE INDEX "Sale_agreementId_idx" ON "Sale"("agreementId");
-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");
-- CreateIndex
CREATE INDEX "SalePayment_saleId_status_idx" ON "SalePayment"("saleId", "status");
-- CreateIndex
CREATE INDEX "SalePayment_method_status_idx" ON "SalePayment"("method", "status");
-- CreateIndex
CREATE INDEX "CommissionRule_companyId_active_idx" ON "CommissionRule"("companyId", "active");
-- CreateIndex
CREATE INDEX "Commission_companyId_periodYear_periodMonth_idx" ON "Commission"("companyId", "periodYear", "periodMonth");
-- CreateIndex
CREATE INDEX "Commission_userId_status_idx" ON "Commission"("userId", "status");
-- CreateIndex
CREATE INDEX "Commission_saleId_idx" ON "Commission"("saleId");
-- CreateIndex
CREATE INDEX "CashShift_branchId_status_idx" ON "CashShift"("branchId", "status");
-- CreateIndex
CREATE INDEX "CashShift_companyId_openedAt_idx" ON "CashShift"("companyId", "openedAt");
-- CreateIndex
CREATE INDEX "CashMovement_cashShiftId_createdAt_idx" ON "CashMovement"("cashShiftId", "createdAt");
-- CreateIndex
CREATE INDEX "CashMovement_originType_originId_idx" ON "CashMovement"("originType", "originId");
-- CreateIndex
CREATE INDEX "CashMovement_method_type_idx" ON "CashMovement"("method", "type");
-- CreateIndex
CREATE INDEX "Warranty_companyId_status_expiresAt_idx" ON "Warranty"("companyId", "status", "expiresAt");
-- CreateIndex
CREATE INDEX "Warranty_saleId_idx" ON "Warranty"("saleId");
-- CreateIndex
CREATE INDEX "Warranty_serviceOrderId_idx" ON "Warranty"("serviceOrderId");
-- CreateIndex
CREATE INDEX "WarrantyClaim_warrantyId_idx" ON "WarrantyClaim"("warrantyId");
-- CreateIndex
CREATE INDEX "Appointment_branchId_scheduledAt_idx" ON "Appointment"("branchId", "scheduledAt");
-- CreateIndex
CREATE INDEX "Appointment_customerId_scheduledAt_idx" ON "Appointment"("customerId", "scheduledAt");
-- CreateIndex
CREATE INDEX "Appointment_status_scheduledAt_idx" ON "Appointment"("status", "scheduledAt");
-- CreateIndex
CREATE INDEX "Agreement_companyId_active_idx" ON "Agreement"("companyId", "active");
-- CreateIndex
CREATE UNIQUE INDEX "Agreement_companyId_code_key" ON "Agreement"("companyId", "code");
-- CreateIndex
CREATE INDEX "AgreementBeneficiary_customerId_idx" ON "AgreementBeneficiary"("customerId");
-- CreateIndex
CREATE UNIQUE INDEX "AgreementBeneficiary_agreementId_customerId_key" ON "AgreementBeneficiary"("agreementId", "customerId");
-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgram_companyId_key" ON "LoyaltyProgram"("companyId");
-- CreateIndex
CREATE INDEX "LoyaltyPoints_customerId_createdAt_idx" ON "LoyaltyPoints"("customerId", "createdAt");
-- CreateIndex
CREATE INDEX "LoyaltyPoints_companyId_expiresAt_idx" ON "LoyaltyPoints"("companyId", "expiresAt");
-- CreateIndex
CREATE INDEX "DREReport_companyId_periodYear_periodMonth_idx" ON "DREReport"("companyId", "periodYear", "periodMonth");
-- CreateIndex
CREATE UNIQUE INDEX "DREReport_companyId_branchId_periodYear_periodMonth_key" ON "DREReport"("companyId", "branchId", "periodYear", "periodMonth");
-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CustomerDependent" ADD CONSTRAINT "CustomerDependent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LabPriceRange" ADD CONSTRAINT "LabPriceRange_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Shape" ADD CONSTRAINT "Shape_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Color" ADD CONSTRAINT "Color_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "Shape"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FrameDetail" ADD CONSTRAINT "FrameDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ContactLensDetail" ADD CONSTRAINT "ContactLensDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AccessoryDetail" ADD CONSTRAINT "AccessoryDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LensServiceDetail" ADD CONSTRAINT "LensServiceDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LensServiceDetail" ADD CONSTRAINT "LensServiceDetail_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PrescriptionValues" ADD CONSTRAINT "PrescriptionValues_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrderHistory" ADD CONSTRAINT "ServiceOrderHistory_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceOrderHistory" ADD CONSTRAINT "ServiceOrderHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QualityChecklist" ADD CONSTRAINT "QualityChecklist_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QualityChecklist" ADD CONSTRAINT "QualityChecklist_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_salePaymentId_fkey" FOREIGN KEY ("salePaymentId") REFERENCES "SalePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_serviceOrderItemId_fkey" FOREIGN KEY ("serviceOrderItemId") REFERENCES "ServiceOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "Warranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AgreementBeneficiary" ADD CONSTRAINT "AgreementBeneficiary_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AgreementBeneficiary" ADD CONSTRAINT "AgreementBeneficiary_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LoyaltyTier" ADD CONSTRAINT "LoyaltyTier_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LoyaltyPoints" ADD CONSTRAINT "LoyaltyPoints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LoyaltyPoints" ADD CONSTRAINT "LoyaltyPoints_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DREReport" ADD CONSTRAINT "DREReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DREReport" ADD CONSTRAINT "DREReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
