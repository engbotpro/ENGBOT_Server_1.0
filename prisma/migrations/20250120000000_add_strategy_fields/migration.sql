-- AlterTable
-- Adicionar campos para estratégias e indicadores completos
DO $$ 
BEGIN
    -- Adicionar coluna indicators (JSON) se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'indicators'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "indicators" JSONB;
    END IF;

    -- Adicionar coluna strategyId se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'strategyId'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "strategyId" TEXT;
    END IF;

    -- Adicionar coluna strategyName se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'strategyName'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "strategyName" TEXT;
    END IF;
END $$;

