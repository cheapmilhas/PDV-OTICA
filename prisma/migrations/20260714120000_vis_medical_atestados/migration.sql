-- Vis Medical F2: atestados médicos. Aditiva. Enums novos idempotentes.

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='CertificateType') THEN
  CREATE TYPE "CertificateType" AS ENUM ('SICK_LEAVE','ATTENDANCE','FITNESS','COMPANION');
END IF; END$$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='CertificateStatus') THEN
  CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED','CANCELLED');
END IF; END$$;

CREATE TABLE IF NOT EXISTS "MedicalCertificate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "encounterId" TEXT,
  "certificateType" "CertificateType" NOT NULL DEFAULT 'SICK_LEAVE',
  "daysOff" INTEGER,
  "startDate" TIMESTAMPTZ NOT NULL,
  "arrivalTime" TEXT,
  "departureTime" TEXT,
  "reason" TEXT NOT NULL,
  "observations" TEXT,
  "cid" TEXT,
  "showCid" BOOLEAN NOT NULL DEFAULT false,
  "content" TEXT NOT NULL,
  "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMPTZ,
  "cancelledByUserId" TEXT,
  "cancelReason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicalCertificate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "MedicalCertificate_companyId_customerId_issuedAt_idx"
  ON "MedicalCertificate"("companyId","customerId","issuedAt");
