/*
  Warnings:

  - Added the required column `updatedAt` to the `CompoundInterest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompoundInterest" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "UserChallengeStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalLosses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalChallenges" INTEGER NOT NULL DEFAULT 0,
    "activeChallenges" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "averageReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "worstReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "minBetAmount" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maxBetAmount" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChallengeStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "betAmount" DOUBLE PRECISION NOT NULL,
    "initialBalance" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "challengerBotId" TEXT,
    "challengedBotId" TEXT,
    "winnerId" TEXT,
    "loserId" TEXT,
    "challengerProfit" DOUBLE PRECISION,
    "challengedProfit" DOUBLE PRECISION,
    "challengerReturn" DOUBLE PRECISION,
    "challengedReturn" DOUBLE PRECISION,
    "challengerCurrentBalance" DOUBLE PRECISION DEFAULT 1000,
    "challengedCurrentBalance" DOUBLE PRECISION DEFAULT 1000,
    "challengerCurrentReturn" DOUBLE PRECISION DEFAULT 0,
    "challengedCurrentReturn" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeTrade" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profit" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserChallengeStats_userId_key" ON "UserChallengeStats"("userId");

-- AddForeignKey
ALTER TABLE "UserChallengeStats" ADD CONSTRAINT "UserChallengeStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeTrade" ADD CONSTRAINT "ChallengeTrade_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeTrade" ADD CONSTRAINT "ChallengeTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
