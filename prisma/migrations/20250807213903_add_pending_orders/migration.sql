-- AlterTable
ALTER TABLE "CompoundInterest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PendingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "takeProfit" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "notes" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'simulated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingOrder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PendingOrder" ADD CONSTRAINT "PendingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
