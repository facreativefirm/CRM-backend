-- AlterTable
ALTER TABLE `product` MODIFY `productType` ENUM('HOSTING', 'VPS', 'DOMAIN', 'SSL', 'RESELLER', 'ADDON', 'OTHER') NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `phoneNumber` VARCHAR(191) NULL;
