import { Router } from 'express';
import promotionsController from '../../controllers/promotions.controller';
import { protect } from '../../middleware/auth.middleware';

const router = Router();

// Public validation
router.post('/validate', promotionsController.validate);

// Admin Management
router.get('/', protect, promotionsController.getAll);
router.post('/', protect, promotionsController.create);
router.get('/:id', protect, promotionsController.getOne);
router.put('/:id', protect, promotionsController.update);
router.delete('/:id', protect, promotionsController.delete);

export default router;
