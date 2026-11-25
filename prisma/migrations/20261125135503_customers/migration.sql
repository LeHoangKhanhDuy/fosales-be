-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('retail', 'silver', 'gold', 'diamond');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "PointLogType" AS ENUM ('opening', 'earn', 'revoke', 'adjust', 'redeem');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CUSTOMER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOMER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOMER_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CUSTOMER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'POINTS_ADJUSTED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBERSHIP_UPDATED';

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "email" VARCHAR(150),
    "gender" "Gender",
    "birthday" DATE,
    "address" VARCHAR(255),
    "note" VARCHAR(500),
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "tier" "CustomerTier" NOT NULL DEFAULT 'retail',
    "points" INTEGER NOT NULL DEFAULT 0,
    "legacy_spent" BIGINT NOT NULL DEFAULT 0,
    "spent" BIGINT NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "first_order_at" TIMESTAMP(3),
    "last_order_at" TIMESTAMP(3),
    "search_key" TEXT NOT NULL,
    "given_name_key" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_logs" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "PointLogType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "ref_code" VARCHAR(30),
    "reason" VARCHAR(120),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "amount_per_point" INTEGER NOT NULL DEFAULT 10000,
    "point_value" INTEGER NOT NULL DEFAULT 100,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "tier" "CustomerTier" NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "min_spent" BIGINT NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "point_multiplier" DECIMAL(4,2) NOT NULL,
    "perks" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("tier")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_tier_idx" ON "customers"("tier");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_last_order_at_idx" ON "customers"("last_order_at");

-- CreateIndex
CREATE INDEX "customers_created_at_idx" ON "customers"("created_at");

-- CreateIndex
CREATE INDEX "point_logs_customer_id_created_at_idx" ON "point_logs"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
