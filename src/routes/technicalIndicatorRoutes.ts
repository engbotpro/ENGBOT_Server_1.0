import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getUserIndicators,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  updateIndicatorsOrder,
} from '../controllers/technicalIndicatorController';

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Buscar indicadores do usuário
router.get('/', getUserIndicators);

// Criar novo indicador
router.post('/', createIndicator);

// Atualizar indicador
router.put('/:id', updateIndicator);

// Deletar indicador
router.delete('/:id', deleteIndicator);

// Atualizar ordem dos indicadores
router.put('/order/update', updateIndicatorsOrder);

export default router; 