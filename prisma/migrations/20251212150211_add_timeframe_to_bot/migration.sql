-- AlterTable
-- Verificar se a coluna já existe antes de adicionar (caso a migration anterior já tenha sido aplicada)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Bot' AND column_name = 'timeframe'
    ) THEN
        ALTER TABLE "Bot" ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1h';
    END IF;
END $$;

