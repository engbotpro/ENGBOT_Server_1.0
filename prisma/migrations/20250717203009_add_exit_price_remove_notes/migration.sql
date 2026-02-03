/*
  Warnings:

  - You are about to drop the column `notes` on the `Trade` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "notes",
ADD COLUMN     "exitPrice" DOUBLE PRECISION;
