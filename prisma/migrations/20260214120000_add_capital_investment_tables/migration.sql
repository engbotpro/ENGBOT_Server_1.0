-- CreateTable (IF NOT EXISTS para evitar erro se tabela já foi criada manualmente)
CREATE TABLE IF NOT EXISTS "CapitalInvestment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "amountInvested" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION,
    "interestRate" DOUBLE PRECISION,
    "maturityDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CapitalSimulationInvestment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "amountInvested" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION,
    "interestRate" DOUBLE PRECISION,
    "maturityDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalSimulationInvestment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (apenas se não existir)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CapitalInvestment_userId_fkey') THEN
    ALTER TABLE "CapitalInvestment" ADD CONSTRAINT "CapitalInvestment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CapitalSimulationInvestment_userId_fkey') THEN
    ALTER TABLE "CapitalSimulationInvestment" ADD CONSTRAINT "CapitalSimulationInvestment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
