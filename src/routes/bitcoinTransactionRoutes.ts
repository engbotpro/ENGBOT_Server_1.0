import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  createBitcoinTransaction,
  getMyBitcoinTransactions,
  getAllBitcoinTransactions,
  approveBitcoinTransaction,
  rejectBitcoinTransaction
} from '../controllers/bitcoinTransactionController';
import { verifyPendingBitcoinTransactions } from '../services/bitcoinVerificationService';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Criar transação Bitcoin (usuário)
router.post('/', async (req, res) => {
  await createBitcoinTransaction(req, res);
});

// Obter transações do próprio usuário
router.get('/my-transactions', async (req, res) => {
  await getMyBitcoinTransactions(req, res);
});

// Obter todas as transações (apenas admin)
router.get('/all', async (req, res) => {
  await getAllBitcoinTransactions(req, res);
});

// Aprovar transação (apenas admin)
router.post('/:id/approve', async (req, res) => {
  await approveBitcoinTransaction(req, res);
});

// Rejeitar transação (apenas admin)
router.post('/:id/reject', async (req, res) => {
  await rejectBitcoinTransaction(req, res);
});

// Verificar transações pendentes manualmente (apenas admin - útil para testes)
router.post('/verify-pending', authenticateToken, async (req, res) => {
  try {
    // Verificar se é admin (validação básica)
    const userId = typeof req.user === 'string' ? req.user : (req.user as any)?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const prisma = await import('../prismaClient').then(m => m.default);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { perfil: true }
    });

    if (user?.perfil !== 'Admin') {
      res.status(403).json({ error: 'Acesso negado. Apenas administradores podem executar verificação manual.' });
      return;
    }

    await verifyPendingBitcoinTransactions();
    res.json({ message: 'Verificação de transações Bitcoin executada com sucesso.' });
  } catch (error: any) {
    console.error('[bitcoinTransactionRoutes] Erro na verificação manual:', error);
    res.status(500).json({ error: 'Erro ao verificar transações Bitcoin' });
  }
});

export default router;
