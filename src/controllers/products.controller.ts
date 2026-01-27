import { Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserType, ProductStatus, Prisma } from '@prisma/client';

/**
 * List products with optional reseller customization inclusion
 */
export const getProducts = async (req: AuthRequest, res: Response) => {
    const { serviceId, type, host } = req.query;

    // Determine context: Are we a reseller viewing our own dash, or a visitor on a reseller's site?
    // Determine context: Are we a reseller viewing our own dash, or a visitor on a reseller's site?
    let targetResellerId: number | null = null;
    let globalMarkup: number = 0;

    // Sanitize Host
    let lookupHost = host as string;
    if (lookupHost) {
        lookupHost = lookupHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    }

    if (req.user?.userType === UserType.RESELLER) {
        targetResellerId = req.user.id;
    } else if (lookupHost) {
        const hostWithoutWww = lookupHost.startsWith('www.') ? lookupHost.slice(4) : lookupHost;
        // Public Storefront Access: Resolve reseller by domain
        const reseller = await prisma.user.findFirst({
            where: {
                OR: [
                    { customDomain: lookupHost },
                    { customDomain: `www.${lookupHost}` },
                    { customDomain: hostWithoutWww },
                    { customDomain: `www.${hostWithoutWww}` }
                ],
                userType: UserType.RESELLER,
                whiteLabelEnabled: true
            },
            select: { id: true, markupRate: true }
        });
        if (reseller) {
            targetResellerId = reseller.id;
            // Default 0 if null
            globalMarkup = reseller.markupRate ? Number(reseller.markupRate) : 0;
        }
    }

    const products = await prisma.product.findMany({
        where: {
            ...(serviceId && { serviceId: parseInt(serviceId as string) }),
            ...(type && { productType: type as any }),
            status: ProductStatus.ACTIVE,
        },
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
            createdAt: true,
            serviceId: true,
            // updatedAt is EXCLUDED to prevent crashes from invalid dates
            productService: true,
            resellerProducts: {
                where: targetResellerId ? { resellerId: targetResellerId } : { id: -1 },
            },
        },
        orderBy: { name: 'asc' },
    });

    // Transform to apply reseller pricing/status if exists
    const transformedProducts = products.map(product => {
        const override = product.resellerProducts[0];
        let multiplier = 1;
        let pStatus = product.status;

        // Priority 1: Specific Product Override
        if (override) {
            pStatus = override.status as ProductStatus;

            if (override.customPrice && Number(product.monthlyPrice) > 0) {
                multiplier = Number(override.customPrice) / Number(product.monthlyPrice);
            } else if (override.markupPercentage) {
                multiplier = 1 + (Number(override.markupPercentage) / 100);
            }
        }
        // Priority 2: Global Markup (Only if no specific override exists)
        else if (targetResellerId && globalMarkup > 0) {
            multiplier = 1 + (globalMarkup / 100);
        }

        if (multiplier !== 1 || override) {
            return {
                ...product,
                status: pStatus,

                // Apply weighted multiplier to all pricing cycles
                monthlyPrice: new Prisma.Decimal(Number(product.monthlyPrice) * multiplier),
                quarterlyPrice: new Prisma.Decimal(Number(product.quarterlyPrice) * multiplier),
                semiAnnualPrice: new Prisma.Decimal(Number(product.semiAnnualPrice) * multiplier),
                annualPrice: new Prisma.Decimal(Number(product.annualPrice) * multiplier),
                biennialPrice: new Prisma.Decimal(Number(product.biennialPrice) * multiplier),
                triennialPrice: new Prisma.Decimal(Number(product.triennialPrice) * multiplier),

                resellerOverride: true
            };
        }
        return product;
    }).filter(p => p.status === ProductStatus.ACTIVE); // Filter out hidden products

    res.status(200).json({
        status: 'success',
        results: transformedProducts.length,
        data: { products: transformedProducts },
    });
};

/**
 * Get single product detail
 */
export const getProduct = async (req: AuthRequest, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { host } = req.query;

        if (isNaN(id)) {
            throw new AppError('Invalid product ID', 400);
        }

        // Determine context
        let targetResellerId: number | null = null;
        let globalMarkup: number = 0;

        // Sanitize Host
        let lookupHost = host as string;
        if (lookupHost) {
            lookupHost = lookupHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        }

        if (req.user?.userType === UserType.RESELLER) {
            targetResellerId = req.user.id;
        } else if (lookupHost) {
            const hostWithoutWww = lookupHost.startsWith('www.') ? lookupHost.slice(4) : lookupHost;
            const reseller = await prisma.user.findFirst({
                where: {
                    OR: [
                        { customDomain: lookupHost },
                        { customDomain: `www.${lookupHost}` },
                        { customDomain: hostWithoutWww },
                        { customDomain: `www.${hostWithoutWww}` }
                    ],
                    userType: UserType.RESELLER,
                    whiteLabelEnabled: true
                },
                select: { id: true, markupRate: true }
            });
            if (reseller) {
                targetResellerId = reseller.id;
                globalMarkup = reseller.markupRate ? Number(reseller.markupRate) : 0;
            }
        }

        const product = await prisma.product.findUnique({
            where: { id },
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
                createdAt: true,
                serviceId: true,
                productService: true,
                domainProduct: true,
                addons: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        billingCycle: true,
                        description: true
                    }
                },
                resellerProducts: {
                    where: targetResellerId ? { resellerId: targetResellerId } : { id: -1 },
                },
            }
        });

        if (!product) {
            throw new AppError('Product not found', 404);
        }

        // Apply Reseller Pricing
        const override = product.resellerProducts[0];
        let multiplier = 1;

        if (override) {
            if (override.customPrice && Number(product.monthlyPrice) > 0) {
                multiplier = Number(override.customPrice) / Number(product.monthlyPrice);
            } else if (override.markupPercentage) {
                multiplier = 1 + (Number(override.markupPercentage) / 100);
            }
        } else if (targetResellerId && globalMarkup > 0) {
            multiplier = 1 + (globalMarkup / 100);
        }

        const transformedProduct = {
            ...product,
            monthlyPrice: new Prisma.Decimal(Number(product.monthlyPrice) * multiplier),
            quarterlyPrice: new Prisma.Decimal(Number(product.quarterlyPrice) * multiplier),
            semiAnnualPrice: new Prisma.Decimal(Number(product.semiAnnualPrice) * multiplier),
            annualPrice: new Prisma.Decimal(Number(product.annualPrice) * multiplier),
            biennialPrice: new Prisma.Decimal(Number(product.biennialPrice) * multiplier),
            triennialPrice: new Prisma.Decimal(Number(product.triennialPrice) * multiplier),
            resellerOverride: multiplier !== 1 || !!override
        };

        res.status(200).json({
            status: 'success',
            data: { product: transformedProduct },
        });
    } catch (error) {
        console.error("Error in getProduct:", error);
        if (error instanceof AppError) throw error;
        throw new AppError('Internal Server Error fetching product', 500);
    }
};

const cleanProductData = (data: any) => {
    const cleaned = { ...data };

    // Stringify features if it's an object (Prisma expects String for LongText)
    if (cleaned.features && typeof cleaned.features === 'object') {
        cleaned.features = JSON.stringify(cleaned.features);
    }

    // Remove read-only or relation fields that crash Prisma if sent in 'data'
    const toRemove = [
        'id', 'createdAt', 'updatedAt',
        'productService', 'services', 'domainProduct',
        'orderItems', 'commissions', 'resellerProducts',
        'addons', 'server'
    ];
    toRemove.forEach(key => delete cleaned[key]);
    return cleaned;
};

/**
 * Create product (Admin Only)
 */
export const createProduct = async (req: AuthRequest, res: Response) => {
    try {
        const product = await prisma.product.create({
            data: cleanProductData(req.body),
        });

        res.status(201).json({
            status: 'success',
            data: { product },
        });
    } catch (error) {
        console.error("Error in createProduct:", error);
        throw new AppError('Failed to create product. Check if slug is unique.', 400);
    }
};

/**
 * Update product
 */
export const updateProduct = async (req: AuthRequest, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const cleanedData = cleanProductData(req.body);

        console.log(`[DEBUG] Updating product ${id} with data:`, JSON.stringify(cleanedData));

        const product = await prisma.product.update({
            where: { id },
            data: cleanedData,
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
                createdAt: true,
                serviceId: true,
                // Exclude updatedAt to be safe
                productService: true,
            }
        });

        res.status(200).json({
            status: 'success',
            data: { product },
        });
    } catch (error: any) {
        console.error("Error in updateProduct:", error);
        // Temporary more descriptive error for debugging
        const errorMessage = error.message || 'Failed to update product.';
        res.status(500).json({
            status: 'error',
            message: `Update failed: ${errorMessage}`,
            error: error.code // Prisma error codes like P2002
        });
    }
};

/**
 * Reseller product customization
 * Allows resellers to set markups or hide products
 */
export const customizeProductForReseller = async (req: AuthRequest, res: Response) => {
    if (req.user?.userType !== UserType.RESELLER) {
        throw new AppError('Only resellers can customize product pricing', 403);
    }

    const { productId, markupPercentage, customPrice, status } = req.body;

    const customization = await prisma.resellerProduct.upsert({
        where: {
            resellerId_productId: {
                resellerId: req.user.id,
                productId: parseInt(productId as string),
            },
        },
        update: {
            markupPercentage,
            customPrice,
            status,
        },
        create: {
            resellerId: req.user.id,
            productId: parseInt(productId as string),
            markupPercentage: markupPercentage || 20.0,
            customPrice,
            status: status || 'ACTIVE',
        },
    });

    res.status(200).json({
        status: 'success',
        data: { customization },
    });
};

/**
 * Delete product (Admin Only)
 */
export const deleteProduct = async (req: AuthRequest, res: Response) => {
    const productId = parseInt(req.params.id as string);

    // Check if product has active services
    const serviceCount = await prisma.service.count({
        where: { productId }
    });

    if (serviceCount > 0) {
        throw new AppError(`Cannot delete product with ${serviceCount} active customer services. Deactivate or move services first.`, 400);
    }

    await prisma.product.delete({
        where: { id: productId },
    });

    res.status(200).json({
        status: 'success',
        message: 'Product deleted successfully',
    });
};
