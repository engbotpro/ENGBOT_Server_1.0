-- Migration para criar a tabela ChatMessage
-- Execute este script diretamente no seu banco de dados PostgreSQL

-- Verificar se a tabela já existe antes de criar
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ChatMessage'
    ) THEN
        -- CreateTable
        CREATE TABLE "ChatMessage" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "text" TEXT NOT NULL,
            "sender" TEXT NOT NULL,
            "read" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
        );

        -- AddForeignKey
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        
        RAISE NOTICE 'Tabela ChatMessage criada com sucesso!';
    ELSE
        RAISE NOTICE 'Tabela ChatMessage já existe.';
    END IF;
END $$;

