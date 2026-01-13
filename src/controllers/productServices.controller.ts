import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { ProductService } from '@prisma/client';

/**
 * List services (categories) with hierarchy support
 */
export const getServices = async (req: Request, res: Response) => {
    // Fetch all categories
    const allServices = await prisma.productService.findMany({
        include: {
            products: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    productType: true,
                    pricingModel: true,
                    description: true,
                    features: true,
                    setupFee: true,
                    monthlyPrice: true,
                    quarterlyPrice: true,
                    semiAnnualPrice: true,
                    annualPrice: true,
                    biennialPrice: true,
                    triennialPrice: true,
                    status: true,
                    stockQuantity: true,
                    autoSetup: true,
                    serverId: true,
                    createdAt: true
                    // updatedAt excluded due to potential '0000-00-00' values in legacy data
                }
            },
        },
        orderBy: { displayOrder: 'asc' },
    });

    // Build hierarchy in memory
    const categoryMap = new Map();
    // 1. Initialize map with all categories and empty subCategories array
    allServices.forEach((cat: ProductService) => {
        categoryMap.set(cat.id, { ...cat, subServices: [] });
    });

    const rootServices: any[] = [];

    // 2. Link children to parents
    allServices.forEach((cat: ProductService) => {
        if (cat.parentServiceId) {
            const parent = categoryMap.get(cat.parentServiceId);
            if (parent) {
                parent.subServices.push(categoryMap.get(cat.id));
            }
        } else {
            rootServices.push(categoryMap.get(cat.id));
        }
    });

    res.status(200).json({
        status: 'success',
        data: { services: rootServices },
    });
};

/**
 * Get single service
 */
export const getService = async (req: Request, res: Response) => {
    const category = await prisma.productService.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            products: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    productType: true,
                    pricingModel: true,
                    description: true,
                    features: true,
                    setupFee: true,
                    monthlyPrice: true,
                    quarterlyPrice: true,
                    semiAnnualPrice: true,
                    annualPrice: true,
                    biennialPrice: true,
                    triennialPrice: true,
                    status: true,
                    stockQuantity: true,
                    autoSetup: true,
                    serverId: true,
                    createdAt: true
                }
            },
            childServices: true
        }
    });

    if (!category) {
        throw new AppError('Category not found', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { service: category },
    });
};

/**
 * Create a new service
 */
export const createService = async (req: Request, res: Response) => {
    const category = await prisma.productService.create({
        data: req.body,
    });

    res.status(201).json({
        status: 'success',
        data: { service: category },
    });
};

/**
 * Update service
 */
export const updateService = async (req: Request, res: Response) => {
    const category = await prisma.productService.update({
        where: { id: parseInt(req.params.id) },
        data: req.body,
    });

    res.status(200).json({
        status: 'success',
        data: { service: category },
    });
};

/**
 * Delete service
 */
export const deleteService = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get/Create a fallback category to handle products (avoids breaking dependencies)
            let generalCategory = await tx.productService.findFirst({
                where: { OR: [{ slug: 'general' }, { name: 'General' }] }
            });

            if (!generalCategory) {
                generalCategory = await tx.productService.create({
                    data: {
                        name: 'General',
                        slug: 'general',
                        description: 'Automatically created fallback category'
                    }
                });
            }

            // If we are trying to delete the general category itself, we need a different plan
            if (id === generalCategory.id) {
                // Check if it's the absolute last category
                const totalCategories = await tx.productService.count();
                if (totalCategories <= 1) {
                    throw new AppError('Cannot delete the last remaining category. Please create another one first.', 400);
                }
                // Find another one to be the fallback
                const another = await tx.productService.findFirst({ where: { id: { not: id } } });
                generalCategory = another!;
            }

            // 2. Reassign products to fallback
            await tx.product.updateMany({
                where: { serviceId: id },
                data: { serviceId: generalCategory.id }
            });

            // 3. Handle sub-categories (promote them or move them)
            await tx.productService.updateMany({
                where: { parentServiceId: id },
                data: { parentServiceId: null }
            });

            // 4. Finally delete the category
            await tx.productService.delete({
                where: { id },
            });
        });

        res.status(200).json({
            status: 'success',
            message: 'Service deleted. To maintain system integrity, any assigned products were moved to the General service group.',
        });
    } catch (error: any) {
        if (error instanceof AppError) throw error;
        console.error('Delete category error:', error);
        throw new AppError('Failed to delete category: ' + error.message, 500);
    }
};
