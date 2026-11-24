/*
  Warnings:

  - You are about to alter the column `name` on the `products` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(150)`.
  - A unique constraint covering the columns `[sku_key]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barcode_key]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `price` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `search_key` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sku` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ImageFit" AS ENUM ('cover', 'contain', 'auto');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('initial', 'import', 'sale', 'return', 'adjust_in', 'adjust_out');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_ADJUSTED';
ALTER TYPE "AuditAction" ADD VALUE 'IMAGE_UPLOADED';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" VARCHAR(14),
ADD COLUMN     "barcode_key" VARCHAR(14),
ADD COLUMN     "cost_price" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" VARCHAR(1000),
ADD COLUMN     "image" VARCHAR(500),
ADD COLUMN     "image_fit" "ImageFit" NOT NULL DEFAULT 'auto',
ADD COLUMN     "is_best_seller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "min_stock" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "original_price" INTEGER,
ADD COLUMN     "price" INTEGER NOT NULL,
ADD COLUMN     "search_key" TEXT NOT NULL,
ADD COLUMN     "sku" VARCHAR(32) NOT NULL,
ADD COLUMN     "sku_key" VARCHAR(32),
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'active',
ALTER COLUMN "name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "category_id" DROP NOT NULL,
ALTER COLUMN "unit_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "product_stocks" (
    "product_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("product_id","store_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "reason" VARCHAR(255),
    "note" VARCHAR(500),
    "ref_code" VARCHAR(50),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_stocks_store_id_idx" ON "product_stocks"("store_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_store_id_created_at_idx" ON "stock_movements"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key_key" ON "products"("sku_key");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key_key" ON "products"("barcode_key");

-- CreateIndex
CREATE INDEX "products_status_deleted_at_idx" ON "products"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
