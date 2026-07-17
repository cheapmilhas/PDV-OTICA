-- Atestado v2: snapshot do emissor congelado na emissão. Aditiva, nullable.
-- null = atestado legado (v1) — o renderer de PDF cai no layout simples.
ALTER TABLE "MedicalCertificate" ADD COLUMN IF NOT EXISTS "issuerSnapshot" JSONB;
