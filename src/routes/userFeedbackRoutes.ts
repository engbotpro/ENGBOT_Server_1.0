import { Router } from 'express';
import { createFeedback, getMyFeedbacks, getAllFeedbacks } from '../controllers/userFeedbackController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', createFeedback);
router.get('/my', getMyFeedbacks);
router.get('/admin', getAllFeedbacks);

export default router;
