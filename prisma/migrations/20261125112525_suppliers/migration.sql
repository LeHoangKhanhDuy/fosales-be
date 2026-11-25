-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('active', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "SupplierLedgerKind" AS ENUM ('receipt', 'payment', 'return', 'adjustment');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'transfer');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PAYMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STORE_UPDATED';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "address" VARCHAR(255),
ADD COLUMN     "phone" VARCHAR(15),
ADD COLUMN     "receipt_footer" VARCHAR(255),
ADD COLUMN     "tax_code" VARCHAR(13);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_key" TEXT NOT NULL,
    "contact" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "email" VARCHAR(150),
    "address" VARCHAR(255) NOT NULL,
    "tax_code" VARCHAR(13),
    "payment_term_days" INTEGER NOT NULL DEFAULT 15,
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(19),
    "bank_holder" VARCHAR(100),
    "note" VARCHAR(500),
    "status" "SupplierStatus" NOT NULL DEFAULT 'active',
    "suspend_reason" VARCHAR(120),
    "suspended_until" TIMESTAMP(3),
    "debt" BIGINT NOT NULL DEFAULT 0,
    "search_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_categories" (
    "supplier_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("supplier_id","category_id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "kind" "SupplierLedgerKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "ref_type" VARCHAR(30),
    "ref_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(60),
    "note" VARCHAR(255),
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by_id" UUID NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key_key" ON "suppliers"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_phone_key" ON "suppliers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tax_code_key" ON "suppliers"("tax_code");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- CreateIndex
CREATE INDEX "suppliers_created_at_idx" ON "suppliers"("created_at");

-- CreateIndex
CREATE INDEX "supplier_categories_category_id_idx" ON "supplier_categories"("category_id");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_supplier_id_occurred_at_idx" ON "supplier_ledger_entries"("supplier_id", "occurred_at");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_kind_occurred_at_idx" ON "supplier_ledger_entries"("kind", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_code_key" ON "supplier_payments"("code");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_paid_at_idx" ON "supplier_payments"("supplier_id", "paid_at");

-- AddForeignKey
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
