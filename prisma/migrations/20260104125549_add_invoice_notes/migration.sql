/*
  Warnings:

  - You are about to drop the column `categoryId` on the `product` table. All the data in the column will be lost.
  - You are about to drop the `productcategory` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[clientId,questionId]` on the table `ClientSecurityQuestion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `serviceId` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `product` DROP FOREIGN KEY `Product_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `productcategory` DROP FOREIGN KEY `ProductCategory_parentCategoryId_fkey`;

-- DropIndex
DROP INDEX `Product_categoryId_idx` ON `product`;

-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `adminNotes` TEXT NULL,
    ADD COLUMN `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `product` DROP COLUMN `categoryId`,
    ADD COLUMN `serviceId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `service` ADD COLUMN `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `billingCycle` VARCHAR(191) NOT NULL DEFAULT 'monthly';

-- DropTable
DROP TABLE `productcategory`;

-- CreateTable
CREATE TABLE `product_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `parentServiceId` INTEGER NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `iconClass` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_services_slug_key`(`slug`),
    INDEX `product_services_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ClientSecurityQuestion_clientId_questionId_key` ON `ClientSecurityQuestion`(`clientId`, `questionId`);

-- CreateIndex
CREATE INDEX `Product_serviceId_idx` ON `Product`(`serviceId`);

-- AddForeignKey
ALTER TABLE `product_services` ADD CONSTRAINT `product_services_parentServiceId_fkey` FOREIGN KEY (`parentServiceId`) REFERENCES `product_services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `product_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
