-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'ordered', 'receiving', 'partial', 'completed', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_PLACED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_RECEIVING_DISCARDED';
ALTER TYPE "AuditAction" ADD VALUE 'GOODS_RECEIVED';

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "store_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "discount" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "expected_date" DATE NOT NULL,
    "placed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(200),
    "cancelled_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "ordered_qty" INTEGER NOT NULL,
    "unit_cost" INTEGER NOT NULL,
    "pack_size" INTEGER NOT NULL DEFAULT 1,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "damaged_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_events" (
    "id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by_id" UUID NOT NULL,

    CONSTRAINT "purchase_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_sessions" (
    "po_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "started_by_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "receiving_sessions_pkey" PRIMARY KEY ("po_id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "po_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_doc_no" VARCHAR(50) NOT NULL,
    "package_count" INTEGER NOT NULL DEFAULT 0,
    "packaging_ok" BOOLEAN NOT NULL DEFAULT true,
    "delivered_by" VARCHAR(100),
    "note" VARCHAR(500),
    "approved_by" VARCHAR(100),
    "gross_value" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "value" INTEGER NOT NULL,
    "received_by_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "scanned_qty" INTEGER NOT NULL,
    "accepted_qty" INTEGER NOT NULL,
    "damaged_qty" INTEGER NOT NULL,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" INTEGER NOT NULL,
    "extra" BOOLEAN NOT NULL DEFAULT false,
    "expiry_date" DATE,
    "lot_no" VARCHAR(40),

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_code_key" ON "purchase_orders"("code");

-- CreateIndex
CREATE INDEX "purchase_orders_store_id_status_idx" ON "purchase_orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_store_id_created_at_idx" ON "purchase_orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_created_at_idx" ON "purchase_orders"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_po_id_product_id_key" ON "purchase_order_items"("po_id", "product_id");

-- CreateIndex
CREATE INDEX "purchase_order_events_po_id_at_idx" ON "purchase_order_events"("po_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_code_key" ON "goods_receipts"("code");

-- CreateIndex
CREATE INDEX "goods_receipts_po_id_idx" ON "goods_receipts"("po_id");

-- CreateIndex
CREATE INDEX "goods_receipts_supplier_id_received_at_idx" ON "goods_receipts"("supplier_id", "received_at");

-- CreateIndex
CREATE INDEX "goods_receipts_store_id_received_at_idx" ON "goods_receipts"("store_id", "received_at");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_product_id_idx" ON "goods_receipt_lines"("product_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_sessions" ADD CONSTRAINT "receiving_sessions_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_sessions" ADD CONSTRAINT "receiving_sessions_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
