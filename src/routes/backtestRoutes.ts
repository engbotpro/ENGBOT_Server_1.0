import { Router } from 'express';
import {
  createBacktest,
  getBacktests,
  getBacktestById,
  updateBacktest,
  deleteBacktest,
  saveCompleteBacktest,
} from '../controllers/backtestController';

const router = Router();

// Criar novo backtest
router.post('/', createBacktest);

// Salvar backtest completo (com resultados)
router.post('/complete', saveCompleteBacktest);

// Listar backtests do usuário
router.get('/user/:userId', getBacktests);

// Buscar backtest por ID
router.get('/:id', getBacktestById);

// Atualizar backtest
router.put('/:id', updateBacktest);

// Deletar backtest
router.delete('/:id', deleteBacktest);

export default router;
