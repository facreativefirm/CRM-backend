import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ImportExportService } from '../services/importExport.service';
import { AppError } from '../middleware/error.middleware';

export const exportData = async (req: AuthRequest, res: Response) => {
    const { type } = req.query;

    let csvData = '';
    let filename = `export-${type}-${Date.now()}.csv`;

    switch (type) {
        case 'clients':
            csvData = await ImportExportService.exportClients();
            break;
        case 'products':
            csvData = await ImportExportService.exportProducts();
            break;
        case 'invoices':
            csvData = await ImportExportService.exportInvoices();
            break;
        default:
            throw new AppError('Invalid export type', 400);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csvData);
};

export const importData = async (req: AuthRequest, res: Response) => {
    const { type, csvContent } = req.body;

    if (!csvContent) {
        throw new AppError('No CSV content provided', 400);
    }

    let result;

    switch (type) {
        case 'clients':
            result = await ImportExportService.importClients(csvContent);
            break;
        case 'products':
            result = await ImportExportService.importProducts(csvContent);
            break;
        // Future: products, invoices
        default:
            throw new AppError('Invalid or unsupported import type', 400);
    }

    res.status(200).json({
        status: 'success',
        data: result
    });
};
