-- AlterTable
ALTER TABLE `invoice` MODIFY `status` ENUM('DRAFT', 'UNPAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'COLLECTIONS', 'PAYMENT_PENDING', 'PARTIALLY_PAID') NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_sessionToken_idx`(`sessionToken`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomainTLD` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tld` VARCHAR(191) NOT NULL,
    `registrar` VARCHAR(191) NULL,
    `registrationPrice` DECIMAL(10, 2) NOT NULL,
    `renewalPrice` DECIMAL(10, 2) NOT NULL,
    `transferPrice` DECIMAL(10, 2) NOT NULL,
    `dnsManagement` BOOLEAN NOT NULL DEFAULT false,
    `emailForwarding` BOOLEAN NOT NULL DEFAULT false,
    `idProtection` BOOLEAN NOT NULL DEFAULT false,
    `eppRequired` BOOLEAN NOT NULL DEFAULT false,
    `autoRegistration` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DomainTLD_tld_key`(`tld`),
    INDEX `DomainTLD_tld_idx`(`tld`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BannedIP` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ipAddress` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `bannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `bannedBy` INTEGER NULL,

    UNIQUE INDEX `BannedIP_ipAddress_key`(`ipAddress`),
    INDEX `BannedIP_ipAddress_idx`(`ipAddress`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `question` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientSecurityQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `answerHash` VARCHAR(191) NOT NULL,

    INDEX `ClientSecurityQuestion_clientId_idx`(`clientId`),
    INDEX `ClientSecurityQuestion_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientSecurityQuestion` ADD CONSTRAINT `ClientSecurityQuestion_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientSecurityQuestion` ADD CONSTRAINT `ClientSecurityQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `SecurityQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
