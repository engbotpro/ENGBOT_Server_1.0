import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  listInvestments,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  getSummary,
  simulateCapital,
} from '../controllers/capitalInvestmentController';

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  await listInvestments(req, res);
});

router.get('/summary', async (req, res) => {
  await getSummary(req, res);
});

router.post('/simulate', async (req, res) => {
  await simulateCapital(req, res);
});

router.post('/', async (req, res) => {
  await createInvestment(req, res);
});

router.put('/:id', async (req, res) => {
  await updateInvestment(req, res);
});

router.delete('/:id', async (req, res) => {
  await deleteInvestment(req, res);
});

export default router;
