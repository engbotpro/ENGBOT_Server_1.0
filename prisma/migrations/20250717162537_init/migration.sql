-- CreateEnum
CREATE TYPE "RatePeriod" AS ENUM ('ANUAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "TermUnit" AS ENUM ('ANOS', 'MESES');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "foto" TEXT,
    "password" TEXT,
    "googleId" TEXT,
    "refreshToken" TEXT,
    "cargo" TEXT,
    "perfil" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "primeiroAcesso" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmToken" TEXT,
    "currentPlan" TEXT,
    "billingCycle" TEXT,
    "planActivatedAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "initial" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "ratePeriod" "RatePeriod",
    "term" INTEGER,
    "termUnit" "TermUnit",
    "monthly" DOUBLE PRECISION,
    "totalMonths" INTEGER,
    "interestPerMonth" DOUBLE PRECISION,
    "montantePrincipal" DOUBLE PRECISION,
    "tax" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "taxValue" DOUBLE PRECISION DEFAULT 0,
    "netValue" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompoundInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialIndependence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "initial" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "ratePeriod" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "termUnit" TEXT NOT NULL,
    "monthly" DECIMAL(65,30) NOT NULL,
    "totalMonths" INTEGER NOT NULL,
    "interestPerMonth" DECIMAL(65,30) NOT NULL,
    "montantePrincipal" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "taxValue" DECIMAL(65,30) NOT NULL,
    "netValue" DECIMAL(65,30) NOT NULL,
    "safeWithdraw" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialIndependence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "receitas" JSONB NOT NULL,
    "despesas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalIndicator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "plan" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "plan" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pixCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "oldPlan" TEXT,
    "changeType" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "tradeType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "botId" TEXT,
    "botName" TEXT,
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime" TIMESTAMP(3),
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendingPlan_userId_key" ON "SpendingPlan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalIndicator_userId_type_order_key" ON "TechnicalIndicator"("userId", "type", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_stripePaymentIntentId_key" ON "PaymentTransaction"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PixTransaction_stripePaymentIntentId_key" ON "PixTransaction"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "CompoundInterest" ADD CONSTRAINT "CompoundInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIndependence" ADD CONSTRAINT "FinancialIndependence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingPlan" ADD CONSTRAINT "SpendingPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalIndicator" ADD CONSTRAINT "TechnicalIndicator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixTransaction" ADD CONSTRAINT "PixTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanHistory" ADD CONSTRAINT "PlanHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
