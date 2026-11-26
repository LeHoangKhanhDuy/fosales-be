-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'completed', 'cancelled', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "OrderPaymentMethod" AS ENUM ('cash', 'transfer', 'card', 'ewallet', 'points');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('pending', 'confirmed', 'voided');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PAYMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PRINTED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_RETURNED';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "branch_name" VARCHAR(100),
ADD COLUMN     "return_days" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "store_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "OrderStatus" NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'pos',
    "subtotal" INTEGER NOT NULL,
    "product_discount" INTEGER NOT NULL,
    "order_discount" INTEGER NOT NULL,
    "member_discount" INTEGER NOT NULL,
    "voucher_discount" INTEGER NOT NULL,
    "points_discount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paid_total" INTEGER NOT NULL,
    "change_amount" INTEGER NOT NULL,
    "vat_rate" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "voucher_code" VARCHAR(20),
    "member_tier" "CustomerTier",
    "member_label" VARCHAR(30),
    "member_percent" DECIMAL(5,2),
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "points_redeemed" INTEGER NOT NULL DEFAULT 0,
    "points_refunded" INTEGER NOT NULL DEFAULT 0,
    "points_revoked" INTEGER NOT NULL DEFAULT 0,
    "refunded_total" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "cancel_reason" VARCHAR(200),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "completed_at" TIMESTAMP(3),
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(32) NOT NULL,
    "barcode" VARCHAR(14),
    "unit" VARCHAR(20) NOT NULL,
    "category_id" UUID,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_price" INTEGER NOT NULL,
    "product_discount" INTEGER NOT NULL DEFAULT 0,
    "allocated_discount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "is_gift" BOOLEAN NOT NULL DEFAULT false,
    "promotion_id" UUID,
    "promo_name" VARCHAR(120),
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "OrderPaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "tendered" INTEGER,
    "reference" VARCHAR(60),
    "status" "OrderPaymentStatus" NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_promotions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "promotion_id" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "order_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_receipts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "order_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "refund_total" INTEGER NOT NULL,
    "cash_refund" INTEGER NOT NULL,
    "refund_method" "OrderPaymentMethod" NOT NULL,
    "refund_reference" VARCHAR(60),
    "reason" VARCHAR(200) NOT NULL,
    "note" VARCHAR(500),
    "points_refunded" INTEGER NOT NULL DEFAULT 0,
    "points_revoked" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "approved_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_lines" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refund_amount" INTEGER NOT NULL,
    "restock" BOOLEAN NOT NULL,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_product_id_idx" ON "order_lines"("product_id");

-- CreateIndex
CREATE INDEX "order_payments_order_id_idx" ON "order_payments"("order_id");

-- CreateIndex
CREATE INDEX "order_promotions_order_id_idx" ON "order_promotions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_receipts_code_key" ON "return_receipts"("code");

-- CreateIndex
CREATE INDEX "return_receipts_order_id_idx" ON "return_receipts"("order_id");

-- CreateIndex
CREATE INDEX "return_receipts_store_id_created_at_idx" ON "return_receipts"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "return_lines_return_id_idx" ON "return_lines"("return_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
