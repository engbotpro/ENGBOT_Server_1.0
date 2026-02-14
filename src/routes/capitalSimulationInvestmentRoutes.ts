import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { list, create, update, remove } from '../controllers/capitalSimulationInvestmentController';

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  await list(req, res);
});

router.post('/', async (req, res) => {
  await create(req, res);
});

router.put('/:id', async (req, res) => {
  await update(req, res);
});

router.delete('/:id', async (req, res) => {
  await remove(req, res);
});

export default router;
