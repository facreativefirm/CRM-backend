CREATE TABLE IF NOT EXISTS `gatewaylog` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `gateway` VARCHAR(191) NOT NULL,
  `transactionId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `requestData` LONGTEXT NULL,
  `responseData` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `gatewaylog_transactionId_key`(`transactionId`),
  INDEX `gatewaylog_gateway_idx`(`gateway`),
  INDEX `gatewaylog_status_idx`(`status`),
  INDEX `gatewaylog_transactionId_idx`(`transactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
