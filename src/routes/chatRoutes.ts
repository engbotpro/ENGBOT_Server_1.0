import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getChatMessages,
  createChatMessage,
  markMessagesAsRead,
} from '../controllers/chatController';

const router = express.Router();

// Todas as rotas requerem autenticação
router.get('/messages', authenticateToken, getChatMessages);
router.post('/messages', authenticateToken, createChatMessage);
router.put('/messages/read', authenticateToken, markMessagesAsRead);

export default router;

