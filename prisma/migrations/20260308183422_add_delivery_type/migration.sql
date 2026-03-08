-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'PICKUP';
