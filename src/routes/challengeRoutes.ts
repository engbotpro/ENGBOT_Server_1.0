import { Router } from 'express';
import {
  getUserChallengeStats,
  getAvailableUsers,
  createOrUpdateUserStats,
  getLeaderboard,
  updateUserTokens,
  getAllUsersStats,
  createChallenge,
  getUserChallenges,
  getActiveChallenges,
  respondToChallenge,
  cancelChallenge,
  finalizeChallenge,
  addManualTrade,
  getChallengeTrades,
  checkExpiredChallenges,
  checkAndActivateWaitingChallenges,
  getUserTokens,
  getChallengeById,
  getTokenHistory
} from '../controllers/challengeController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Rotas para estatísticas de desafios
router.get('/stats/:userId', authenticateToken, getUserChallengeStats);
router.get('/available-users', authenticateToken, getAvailableUsers);
router.get('/leaderboard', authenticateToken, getLeaderboard);
router.get('/all-users-stats', authenticateToken, getAllUsersStats);
router.get('/tokens/:userId', authenticateToken, getUserTokens);
router.get('/token-history', authenticateToken, getTokenHistory);

// Rotas para gerenciar estatísticas
router.post('/stats/:userId', authenticateToken, createOrUpdateUserStats);
router.put('/stats/:userId/tokens', authenticateToken, updateUserTokens);

// Rotas para desafios
router.post('/create', authenticateToken, createChallenge);
router.get('/user/:userId', authenticateToken, getUserChallenges);
router.get('/active', authenticateToken, getActiveChallenges);
router.get('/:challengeId', authenticateToken, getChallengeById);
router.post('/:challengeId/respond', authenticateToken, respondToChallenge);
router.post('/:challengeId/cancel', authenticateToken, cancelChallenge);
router.post('/:challengeId/finalize', authenticateToken, finalizeChallenge);

// Rota para verificar desafios expirados
router.post('/check-expired', authenticateToken, checkExpiredChallenges);

// Rota para verificar desafios aguardando início
router.post('/check-waiting', authenticateToken, checkAndActivateWaitingChallenges);

// Rotas para trades do desafio
router.post('/:challengeId/trade', authenticateToken, addManualTrade);
router.get('/:challengeId/trades', authenticateToken, getChallengeTrades);

export default router; 