-- CreateTable: PlatformSettings
CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "bitcoinWalletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- Inserir registro inicial
INSERT INTO "PlatformSettings" ("id", "bitcoinWalletAddress", "createdAt", "updatedAt")
VALUES ('platform', NULL, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- CreateTable: BitcoinTransaction
CREATE TABLE IF NOT EXISTS "BitcoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "superCreditsAmount" INTEGER NOT NULL,
    "amountBTC" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT,
    "walletAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitcoinTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BitcoinTransaction" ADD CONSTRAINT "BitcoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
