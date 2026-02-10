import { Request, Response } from 'express';
import bkashService from '../services/bkash.service';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { InvoiceStatus, Prisma } from '@prisma/client';
import logger from '../utils/logger';

export class BkashController {
    /**
     * Initialize bKash payment for an invoice
     */
    async initiatePayment(req: AuthRequest, res: Response) {
        try {
            const { invoiceId } = req.body;

            if (!invoiceId) {
                throw new AppError('Invoice ID is required', 400);
            }

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

            // Get frontend URL for callback
            const frontendUrl = process.env.FRONTEND_URL || 'https://clientarea.facreative.biz';
            // bKash callback should point to a backend route that confirms payment
            const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:3006';
            const callbackUrl = `${backendBaseUrl}/api/bkash/callback`;

            logger.debug(`bKash Generated Callback URL: ${callbackUrl}`);

            // Initialize payment with bKash
            const bkashResponse = await bkashService.createPayment({
                invoiceId: invoice.invoiceNumber,
                amount: parseFloat(invoice.totalAmount.toString()),
                callbackUrl: callbackUrl
            });

            // Log the initiation attempt
            await prisma.gatewayLog.create({
                data: {
                    gateway: 'BKASH',
                    transactionId: bkashResponse.paymentID,
                    status: 'INITIATED',
                    requestData: JSON.stringify({
                        invoiceId: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        amount: invoice.totalAmount,
                        frontendRedirect: `${frontendUrl}/payment/bkash-status` // Where frontend should go after backend callback
                    }),
                    responseData: JSON.stringify(bkashResponse)
                }
            });

            logger.info(`bKash payment initiated successfully for Invoice ${invoice.id}, PaymentID: ${bkashResponse.paymentID}`);

            res.status(200).json({
                status: 'success',
                data: {
                    redirectUrl: bkashResponse.bkashURL,
                    paymentID: bkashResponse.paymentID
                }
            });
        } catch (error: any) {
            logger.error('bKash payment initiation error:', error);
            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Failed to initiate bKash payment'
            });
        }
    }

    /**
     * Handle bKash callback (Finalize Payment)
     */
    async handleCallback(req: Request, res: Response) {
        try {
            const query = req.query;
            const paymentID = (query.paymentID || query.paymentId) as string;
            const status = query.status as string;

            logger.info(`bKash callback received for ID: ${paymentID}, status: ${status}`);

            if (!paymentID) {
                return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?msg=Missing%20PaymentID`);
            }

            // Find the initiation log first to get context (invoiceId) even for failures
            const log = await prisma.gatewayLog.findFirst({
                where: {
                    transactionId: paymentID as string,
                    gateway: 'BKASH'
                }
            });

            if (!log) {
                logger.error(`bKash log not found for paymentID: ${paymentID}`);
                return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?msg=Invalid%20Session`);
            }

            const { invoiceId, amount } = JSON.parse(log.requestData as string);

            if (status === 'cancel' || status === 'failure') {
                logger.warn(`bKash payment ${status} for Invoice ${invoiceId}`);
                return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?invoiceId=${invoiceId}&gateway=bkash&msg=Payment%20${status}`);
            }

            // IDEMPOTENCY: If this log is already SUCCESS, just redirect to success page
            if (log.status === 'SUCCESS') {
                const { invoiceId, invoiceNumber } = JSON.parse(log.requestData as string);
                let trxID = 'N/A';
                try {
                    const resp = JSON.parse(log.responseData as string);
                    trxID = resp.trxID || resp.transactionReference || 'N/A';
                } catch (e) { }

                logger.info(`bKash payment already successful for ID: ${paymentID}, redirecting to success.`);
                return res.redirect(`${process.env.FRONTEND_URL}/payment/success?invoiceId=${invoiceId}&gateway=bkash&trxId=${trxID}`);
            }

            // Execute Payment
            try {
                let executeResult;
                try {
                    executeResult = await bkashService.executePayment(paymentID as string);
                } catch (executeErr: any) {
                    // Handle "Already Completed" error from bKash (e.g., user refreshed)
                    if (executeErr.message?.includes('2062') || executeErr.message?.toLowerCase().includes('already been completed')) {
                        logger.warn(`bKash payment ID ${paymentID} was already completed according to bKash API.`);
                        // Query the payment to get the TrxID if we don't have it
                        const queryResult = await bkashService.queryPayment(paymentID as string);
                        executeResult = { ...queryResult, trxID: queryResult.trxID || queryResult.transactionReference };
                    } else {
                        throw executeErr;
                    }
                }

                // Update log
                await prisma.gatewayLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SUCCESS',
                        responseData: JSON.stringify(executeResult)
                    }
                });

                // Record payment on invoice (this service helper handles duplicate trxID check internally usually)
                const { recordPayment } = await import('../services/invoiceService');
                await recordPayment(
                    parseInt(invoiceId),
                    new Prisma.Decimal(amount),
                    'BKASH',
                    executeResult.trxID,
                    executeResult
                );

                logger.info(`bKash payment success recorded for Invoice ${invoiceId}, TrxID: ${executeResult.trxID}`);

                // Redirect to frontend success page
                return res.redirect(`${process.env.FRONTEND_URL}/payment/success?invoiceId=${invoiceId}&gateway=bkash&trxId=${executeResult.trxID}`);
            } catch (error: any) {
                logger.error(`bKash execution failed for ${paymentID}:`, error);

                await prisma.gatewayLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'FAILED',
                        responseData: JSON.stringify({ error: error.message })
                    }
                });

                return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?invoiceId=${invoiceId}&gateway=bkash&msg=${encodeURIComponent(error.message)}`);
            }
        } catch (error: any) {
            logger.error('bKash callback processing error:', error);
            res.redirect(`${process.env.FRONTEND_URL}/payment/failed?msg=System%20Error`);
        }
    }
}

export default new BkashController();
