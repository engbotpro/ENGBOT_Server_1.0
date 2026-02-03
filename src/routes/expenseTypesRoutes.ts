import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getExpenseTypes,
  createExpenseType,
  deleteExpenseType,
  updateExpenseType
} from '../controllers/expenseTypesController';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// GET /api/expense-types - Obter todos os tipos do usuário
router.get('/', async (req, res) => {
  await getExpenseTypes(req, res);
});

// POST /api/expense-types - Criar novo tipo
router.post('/', async (req, res) => {
  await createExpenseType(req, res);
});

// PUT /api/expense-types/:id - Atualizar tipo existente
router.put('/:id', async (req, res) => {
  await updateExpenseType(req, res);
});

// DELETE /api/expense-types/:id - Deletar tipo
router.delete('/:id', async (req, res) => {
  await deleteExpenseType(req, res);
});

export default router;