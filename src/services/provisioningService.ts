import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { ServiceStatus, Prisma } from '@prisma/client';
import logger from '../utils/logger';

/**
 * Service Lifecycle Management Service
 */
export class ProvisioningService {
    /**
     * Activate a service (usually after payment)
     */
    static async activateService(serviceId: number) {
        logger.info(`Activating service: ${serviceId}`);

        const service = await prisma.service.findUnique({
            where: { id: serviceId },
            include: { product: true }
        });

        if (!service) throw new AppError('Service not found', 404);

        // Placeholder for API call to WHM/cPanel/Plesk/Virtualizor
        // const apiResponse = await ServerModule.createAccount(service);

        // Calculate Next Due Date based on Billing Cycle
        const now = new Date();
        let nextDueDate = new Date(now);

        switch (service.billingCycle?.toLowerCase()) {
            case 'monthly':
                nextDueDate.setMonth(now.getMonth() + 1);
                break;
            case 'quarterly':
                nextDueDate.setMonth(now.getMonth() + 3);
                break;
            case 'semi-annually':
                nextDueDate.setMonth(now.getMonth() + 6);
                break;
            case 'annually':
                nextDueDate.setFullYear(now.getFullYear() + 1);
                break;
            case 'biennially':
                nextDueDate.setFullYear(now.getFullYear() + 2);
                break;
            case 'triennially':
                nextDueDate.setFullYear(now.getFullYear() + 3);
                break;
            default:
                nextDueDate.setMonth(now.getMonth() + 1); // Default to Monthly
        }

        return await prisma.service.update({
            where: { id: serviceId },
            data: {
                status: ServiceStatus.ACTIVE,
                nextDueDate: nextDueDate,
            }
        });
    }

    /**
     * Suspend a service (e.g. overdue payment)
     */
    static async suspendService(serviceId: number, reason: string) {
        logger.info(`Suspending service: ${serviceId}, Reason: ${reason}`);

        return await prisma.service.update({
            where: { id: serviceId },
            data: {
                status: ServiceStatus.SUSPENDED,
            }
        });
    }

    /**
     * Terminate a service
     */
    static async terminateService(serviceId: number) {
        logger.info(`Terminating service: ${serviceId}`);

        return await prisma.service.update({
            where: { id: serviceId },
            data: {
                status: ServiceStatus.TERMINATED,
                terminationDate: new Date(),
            }
        });
    }

    /**
     * Auto-allocate server for a new service
     */
    static async allocateServer(productType: string) {
        const server = await prisma.server.findFirst({
            where: {
                serverType: productType,
                status: 'ACTIVE',
                // Check capacity if maxAccounts is set
            },
            orderBy: { services: { _count: 'asc' } } // Least loaded
        });

        return server?.id || null;
    }
}
