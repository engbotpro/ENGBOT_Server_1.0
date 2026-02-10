import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getUserWallets,
  updateWalletBalance,
  initializeVirtualWallet,
  transferBalance,
  getWalletSummary,
  removeWalletAsset,
  cleanupZeroBalances,
  executeVirtualSpotOrder,
} from '../controllers/walletController';

const router = express.Router();

// Aplicar middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Obter todas as carteiras do usuário
router.get('/', async (req, res) => {
  await getUserWallets(req, res);
});

// Obter resumo das carteiras
router.get('/summary', async (req, res) => {
  await getWalletSummary(req, res);
});

// Inicializar carteira virtual com $10,000
router.post('/initialize-virtual', async (req, res) => {
  await initializeVirtualWallet(req, res);
});

// Atualizar saldo da carteira
router.put('/balance', async (req, res) => {
  await updateWalletBalance(req, res);
});

// Transferir saldo entre ativos (compra/venda)
router.post('/transfer', async (req, res) => {
  await transferBalance(req, res);
});

// Executar ordem spot virtual (compra/venda): atualiza carteira e salva no histórico de trades
router.post('/execute-virtual-spot', async (req, res) => {
  await executeVirtualSpotOrder(req, res);
});

// Remover ativo da carteira
router.delete('/:type/:symbol', async (req, res) => {
  await removeWalletAsset(req, res);
});

// Limpar ativos com saldo zero
router.post('/cleanup-zero', async (req, res) => {
  await cleanupZeroBalances(req, res);
});

export default router;