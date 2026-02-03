import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getBots,
  getBotById,
  createBot,
  updateBot,
  deleteBot,
  toggleBotActive,
  updateBotPerformance,
  getBotsByStatus,
  getBotsByEnvironment,
  getBotsBySymbol,
  getBotsByUserId,
  getBotByIdPublic,
  getBotOpenTrades,
  closeAllBotTrades
} from '../controllers/botController';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas principais
router.get('/', getBots);
router.get('/status', getBotsByStatus);
router.get('/environment/:environment', getBotsByEnvironment);
router.get('/symbol/:symbol', getBotsBySymbol);
router.get('/user/:userId', getBotsByUserId); // Deve vir antes de /:id para não ser capturada
router.get('/public/:id', getBotByIdPublic); // Buscar robô por ID sem restrição de usuário (para desafios)
router.get('/:id', getBotById);

// Operações CRUD
router.post('/', createBot);
router.put('/:id', updateBot);
router.delete('/:id', deleteBot);

// Operações específicas
router.patch('/:id/toggle', toggleBotActive);
router.patch('/:id/performance', updateBotPerformance);
router.get('/:id/trades/open', getBotOpenTrades);
router.post('/:id/trades/close-all', closeAllBotTrades);

export default router;
