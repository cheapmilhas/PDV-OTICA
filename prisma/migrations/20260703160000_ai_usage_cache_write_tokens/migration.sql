-- Cache write tokens (cache_creation_input_tokens) medido à parte.
-- A Anthropic cobra 1,25× o input por esses tokens e eles NÃO estão contidos
-- em input_tokens — sem esta coluna, o custo de prompt caching sumiria da medição.
-- Default 0 (histórico e chamadas sem caching não são afetados).
ALTER TABLE "AiTokenUsage" ADD COLUMN "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
