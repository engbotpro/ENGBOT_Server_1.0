import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  createTesterRequest,
  getAllTesterRequests,
  getMyTesterRequests,
  approveTesterRequest,
  rejectTesterRequest
} from '../controllers/testerController';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Criar solicitação de testador
router.post('/', async (req, res) => {
  await createTesterRequest(req, res);
});

// Obter solicitações do próprio usuário
router.get('/my-requests', async (req, res) => {
  await getMyTesterRequests(req, res);
});

// Obter todas as solicitações (apenas admin)
router.get('/all', async (req, res) => {
  await getAllTesterRequests(req, res);
});

// Aprovar solicitação (apenas admin)
router.post('/:id/approve', async (req, res) => {
  await approveTesterRequest(req, res);
});

// Rejeitar solicitação (apenas admin)
router.post('/:id/reject', async (req, res) => {
  await rejectTesterRequest(req, res);
});

export default router;
