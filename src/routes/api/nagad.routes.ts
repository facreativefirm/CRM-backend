import { Router } from 'express';
import nagadController from '../../controllers/nagad.controller';
import { protect } from '../../middleware/auth.middleware';

const router = Router();

// Initiate Nagad payment
router.post('/initiate', protect, (req, res) =>
    nagadController.initiatePayment(req, res)
);

// Nagad callback (GET because Nagad redirects the user)
router.get('/callback', (req, res) =>
    nagadController.handleCallback(req, res)
);

export default router;
