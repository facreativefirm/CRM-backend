import { Request, Response } from 'express';
import nagadService from '../services/nagad.service';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { InvoiceStatus, Prisma } from '@prisma/client';
import logger from '../utils/logger';

/**
 * Extract client IP address from request
 * Checks various headers in order of preference
 */
function getClientIp(req: Request): string {
    const headers = [
        req.headers['x-forwarded-for'],
        req.headers['x-real-ip'],
        req.headers['cf-connecting-ip'], // Cloudflare
        req.socket.remoteAddress
    ];

    for (const header of headers) {
        if (header) {
            // x-forwarded-for can contain multiple IPs, take the first one
            const ip = Array.isArray(header) ? header[0] : header.toString().split(',')[0].trim();
            if (ip && ip !== '::1' && ip !== '127.0.0.1') {
                return ip;
            }
        }
    }

    // Fallback to a valid IP (for local development)
    return '103.100.100.100';
}

export class NagadController {
    /**
     * Initialize Nagad payment for an invoice
     */
    async initiatePayment(req: AuthRequest, res: Response) {
        try {
            const { invoiceId, customerMobile } = req.body;

            if (!invoiceId) {
                throw new AppError('Invoice ID is required', 400);
            }

            // Extract client IP
            const clientIp = getClientIp(req);
            logger.info(`Client IP detected: ${clientIp}`);

            // Fetch invoice
            const invoice = await prisma.invoice.findUnique({
                where: { id: parseInt(invoiceId as string) }
            });

            if (!invoice) {
                throw new AppError('Invoice not found', 404);
            }

            if (invoice.status === InvoiceStatus.PAID) {
                throw new AppError('Invoice is already paid', 400);
            }

            // Step 1: Initialize payment with Nagad
            const initResult = await nagadService.initializePayment({
                invoiceId: invoice.id.toString(),
                amount: parseFloat(invoice.totalAmount.toString()),
                orderId: invoice.invoiceNumber,
                customerMobile,
                clientIp
            });

            // Step 2: Complete payment call to get the callBackUrl (redirect URL)
            const completeResult = await nagadService.completePayment(
                parseFloat(invoice.totalAmount.toString()),
                initResult.orderId,
                initResult.sensitiveData, // Pass encrypted data from Step 1
                invoice.invoiceNumber, // Original order number
                clientIp
            );

            // Log the initiation attempt
            await prisma.gatewayLog.create({
                data: {
                    gateway: 'NAGAD_AUTO',
                    transactionId: completeResult.paymentReferenceId,
                    status: 'INITIATED',
                    requestData: JSON.stringify({
                        invoiceId: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        amount: invoice.totalAmount,
                        clientIp
                    }),
                    responseData: JSON.stringify({
                        nagadOrderId: initResult.orderId,
                        paymentReferenceId: completeResult.paymentReferenceId,
                        callBackUrl: completeResult.callBackUrl
                    })
                }
            });

            logger.info(`Nagad payment initiated successfully for Invoice ${invoice.id}`);

            res.status(200).json({
                status: 'success',
                data: {
                    redirectUrl: completeResult.callBackUrl,
                    paymentReferenceId: initResult.paymentReferenceId
                }
            });
        } catch (error: any) {
            logger.error('Nagad payment initiation error:', error);
            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Failed to initiate Nagad payment'
            });
        }
    }

    /**
     * Handle Nagad callback/verification
     */
    async handleCallback(req: Request, res: Response) {
        try {
            const { payment_ref_id, status } = req.query;

            if (!payment_ref_id) {
                throw new AppError('Missing payment reference', 400);
            }

            logger.info(`Nagad callback received for ref: ${payment_ref_id}, status: ${status}`);

            // Verify payment with Nagad API
            const verificationResult = await nagadService.verifyPayment(payment_ref_id as string);

            // Find the initiation log to get invoice info
            const log = await prisma.gatewayLog.findFirst({
                where: {
                    transactionId: payment_ref_id as string,
                    gateway: 'NAGAD_AUTO'
                }
            });

            if (!log || !log.requestData) {
                throw new AppError('Initiation log not found', 404);
            }

            const { invoiceId, amount } = JSON.parse(log.requestData);

            const isSuccess = verificationResult.status === 'Success' && verificationResult.statusCode === '000';
            const paymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';

            // Update log status
            await prisma.gatewayLog.update({
                where: { id: log.id },
                data: {
                    status: paymentStatus,
                    responseData: JSON.stringify({
                        verificationResult,
                        callbackStatus: status
                    })
                }
            });

            // Update invoice if successful
            if (isSuccess) {
                // Verify amount matches
                const invoice = await prisma.invoice.findUnique({
                    where: { id: parseInt(invoiceId) }
                });

                if (invoice && parseFloat(invoice.totalAmount.toString()) === parseFloat(verificationResult.amount)) {
                    const { recordPayment } = await import('../services/invoiceService');
                    await recordPayment(
                        parseInt(invoiceId),
                        new Prisma.Decimal(amount),
                        'NAGAD_AUTO',
                        payment_ref_id as string,
                        verificationResult
                    );
                    logger.info(`Nagad payment success recorded for Invoice ${invoiceId}`);
                } else {
                    logger.warn(`Amount mismatch for Invoice ${invoiceId}. Expected: ${invoice?.totalAmount}, Got: ${verificationResult.amount}`);
                }
            }

            res.status(200).json({
                status: 'success',
                data: {
                    paymentStatus,
                    message: verificationResult.message || (isSuccess ? 'Payment successful' : 'Payment failed'),
                    invoiceId
                }
            });
        } catch (error: any) {
            logger.error('Nagad callback error:', error);
            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Nagad callback processing failed'
            });
        }
    }
}

export default new NagadController();
