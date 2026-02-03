import prisma from '../prismaClient';

async function createTokenTransactionTable() {
  try {
    console.log('🔧 Criando tabela TokenTransaction...');

    // SQL para criar a tabela
    const sql = `
      CREATE TABLE IF NOT EXISTS "TokenTransaction" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "balanceAfter" DOUBLE PRECISION NOT NULL,
        "challengeId" TEXT,
        "description" TEXT NOT NULL,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "TokenTransaction_userId_idx" ON "TokenTransaction"("userId");
      CREATE INDEX IF NOT EXISTS "TokenTransaction_challengeId_idx" ON "TokenTransaction"("challengeId");

      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'TokenTransaction_userId_fkey'
        ) THEN
          ALTER TABLE "TokenTransaction" 
          ADD CONSTRAINT "TokenTransaction_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
      END $$;

      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'TokenTransaction_challengeId_fkey'
        ) THEN
          ALTER TABLE "TokenTransaction" 
          ADD CONSTRAINT "TokenTransaction_challengeId_fkey" 
          FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `;

    await prisma.$executeRawUnsafe(sql);
    
    console.log('✅ Tabela TokenTransaction criada com sucesso!');
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.code === '42P07') {
      console.log('✅ Tabela TokenTransaction já existe');
    } else {
      console.error('❌ Erro ao criar tabela:', error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
createTokenTransactionTable();

