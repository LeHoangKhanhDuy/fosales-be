-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MIN_STOCK_UPDATED';

-- DropIndex
DROP INDEX "product_stocks_store_id_idx";

-- DropIndex
DROP INDEX "stock_movements_product_id_created_at_idx";

-- DropIndex
DROP INDEX "stock_movements_store_id_created_at_idx";

-- AlterTable
ALTER TABLE "product_stocks" ADD COLUMN     "last_movement_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "product_stocks_store_id_quantity_idx" ON "product_stocks"("store_id", "quantity");

-- CreateIndex
CREATE INDEX "stock_movements_store_id_created_at_idx" ON "stock_movements"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_store_id_product_id_created_at_idx" ON "stock_movements"("store_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_store_id_type_created_at_idx" ON "stock_movements"("store_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements"("product_id");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
