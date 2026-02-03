import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getPlatformSettings,
  updatePlatformSettings
} from '../controllers/platformSettingsController';

const router = express.Router();

// Público - obter configurações (para endereço Bitcoin)
router.get('/', getPlatformSettings);

// Apenas admin - atualizar configurações
router.put('/', authenticateToken, async (req, res) => {
  await updatePlatformSettings(req, res);
});

export default router;
