import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  saveBinanceKeys,
  getBinanceKeysStatus,
  deleteBinanceKeys,
  getBinanceAccount,
} from '../controllers/binanceApiKeyController';

const router = express.Router();

router.use(authenticateToken);

// Salvar/atualizar chaves da API Binance (criptografadas no backend)
router.post('/', async (req, res) => {
  await saveBinanceKeys(req, res);
});

// Verificar se o usuário tem chaves configuradas (nunca retorna as chaves)
router.get('/status', async (req, res) => {
  await getBinanceKeysStatus(req, res);
});

// Remover chaves da API Binance
router.delete('/', async (req, res) => {
  await deleteBinanceKeys(req, res);
});

// Buscar saldo e informações da carteira Binance real
router.get('/account', async (req, res) => {
  await getBinanceAccount(req, res);
});

export default router;
