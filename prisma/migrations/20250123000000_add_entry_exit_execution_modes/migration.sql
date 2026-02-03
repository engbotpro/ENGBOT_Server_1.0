-- AlterTable
-- Adicionar campos para modo de execução de entrada e saída
DO $$ 
BEGIN
    -- Adicionar coluna entryExecutionMode se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'entryExecutionMode'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "entryExecutionMode" TEXT DEFAULT 'candle_close';
    END IF;

    -- Adicionar coluna exitExecutionMode se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'exitExecutionMode'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "exitExecutionMode" TEXT DEFAULT 'candle_close';
    END IF;
END $$;

