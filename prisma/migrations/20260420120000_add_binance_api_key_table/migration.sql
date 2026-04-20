-- CreateTable
CREATE TABLE "BinanceApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiSecretEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BinanceApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BinanceApiKey_userId_key" ON "BinanceApiKey"("userId");

-- AddForeignKey
ALTER TABLE "BinanceApiKey" ADD CONSTRAINT "BinanceApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
