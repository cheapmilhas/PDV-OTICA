#!/usr/bin/env bash
# Backup do banco Neon → S3 (ou compatível: R2, Backblaze).
#
# Uso:
#   DATABASE_URL=postgresql://... \
#   S3_BUCKET=pdv-otica-backups \
#   AWS_ACCESS_KEY_ID=... \
#   AWS_SECRET_ACCESS_KEY=... \
#   AWS_REGION=us-east-1 \
#   ./scripts/backup-neon.sh
#
# Recomendado: rodar em GitHub Actions cron (gratuito) ou Vercel Cron + chamada
# externa (Vercel Functions têm limite de 5min e tamanho de payload).
#
# Retenção: o S3 deve ter lifecycle rule deletando objetos >30 dias.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL não definido"
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" ]]; then
  echo "ERROR: S3_BUCKET não definido"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
FILENAME="neon-backup-${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "▶ Iniciando pg_dump..."
pg_dump "${DATABASE_URL}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip -9 > "${TMPFILE}"

SIZE=$(du -h "${TMPFILE}" | cut -f1)
echo "▶ Dump concluído: ${SIZE}"

echo "▶ Upload para s3://${S3_BUCKET}/${FILENAME}"
aws s3 cp "${TMPFILE}" "s3://${S3_BUCKET}/${FILENAME}" \
  --storage-class STANDARD_IA \
  --metadata "source=neon,timestamp=${TIMESTAMP}"

rm -f "${TMPFILE}"
echo "✓ Backup concluído"
