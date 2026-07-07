-- Central de IA (Fase 3): modelos do Copiloto e da Transcrição ajustáveis pela
-- Config (antes hardcoded em conversation-copilot.ts / audio-transcription.service.ts).
-- Colunas com default = valor hardcoded atual → linhas existentes ficam idênticas
-- ao comportamento anterior, sem backfill.
ALTER TABLE "AiGlobalConfig"
  ADD COLUMN "copilotModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  ADD COLUMN "transcriptionModel" TEXT NOT NULL DEFAULT 'whisper-1';
