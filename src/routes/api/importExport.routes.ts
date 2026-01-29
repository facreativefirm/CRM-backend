import express from 'express';
import { protect, restrictTo } from '../../middleware/auth.middleware';
import * as importExportController from '../../controllers/importExport.controller';

const router = express.Router();

router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN'));

router.get('/export', importExportController.exportData);
router.post('/import', importExportController.importData);

export default router;
