import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  createPendingOrder,
  getPendingOrders,
  updatePendingOrder,
  cancelPendingOrder,
  executePendingOrder
} from '../controllers/pendingOrderController';

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Criar nova ordem pendente
router.post('/', async (req, res) => {
  await createPendingOrder(req, res);
});

// Obter todas as ordens pendentes do usuário
router.get('/', async (req, res) => {
  await getPendingOrders(req, res);
});

// Atualizar ordem pendente
router.put('/:id', async (req, res) => {
  await updatePendingOrder(req, res);
});

// Cancelar ordem pendente
router.delete('/:id', async (req, res) => {
  await cancelPendingOrder(req, res);
});

// Executar ordem pendente
router.post('/:id/execute', async (req, res) => {
  await executePendingOrder(req, res);
});

export default router; 