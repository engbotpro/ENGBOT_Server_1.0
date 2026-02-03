import express from 'express';
import { getUserTrades, createTrade, updateTrade, getTradeStats } from '../controllers/tradeController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// Todas as rotas de trades requerem autenticação
router.use(authenticateToken);

// GET /api/trades - Buscar histórico de trades do usuário
router.get('/', async (req, res) => {
  await getUserTrades(req, res);
});

// GET /api/trades/stats - Buscar estatísticas de trades do usuário
router.get('/stats', async (req, res) => {
  await getTradeStats(req, res);
});

// POST /api/trades - Criar novo trade
router.post('/', async (req, res) => {
  await createTrade(req, res);
});

// PUT /api/trades/:tradeId - Atualizar trade (fechar posição, atualizar PnL, etc.)
router.put('/:tradeId', async (req, res) => {
  await updateTrade(req, res);
});

export default router; 