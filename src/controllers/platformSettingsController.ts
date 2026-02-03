import { Request, Response } from 'express';
import prisma from '../prismaClient';

// Função auxiliar para extrair userId do request
const getUserId = (req: Request): string | null => {
  if (typeof req.user === 'string') {
    return req.user;
  }
  if (req.user && typeof req.user === 'object' && 'id' in req.user) {
    return (req.user as any).id;
  }
  return null;
};

// Obter configurações da plataforma (público para obter endereço Bitcoin)
export const getPlatformSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.platformSettings.findUnique({
      where: { id: 'platform' }
    });

    // Se não existir, criar registro padrão
    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          id: 'platform',
          bitcoinWalletAddress: null
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('[getPlatformSettings] Erro ao buscar configurações:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações da plataforma' });
  }
};

// Atualizar configurações da plataforma (apenas admin)
export const updatePlatformSettings = async (req: Request, res: Response) => {
  try {
    const adminId = getUserId(req);
    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { perfil: true }
    });

    if (admin?.perfil !== 'Admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores podem atualizar configurações.'
      });
    }

    const { bitcoinWalletAddress } = req.body;

    // Criar ou atualizar configurações
    const settings = await prisma.platformSettings.upsert({
      where: { id: 'platform' },
      update: {
        bitcoinWalletAddress: bitcoinWalletAddress || null
      },
      create: {
        id: 'platform',
        bitcoinWalletAddress: bitcoinWalletAddress || null
      }
    });

    res.json({
      message: 'Configurações atualizadas com sucesso',
      settings
    });
  } catch (error) {
    console.error('[updatePlatformSettings] Erro ao atualizar configurações:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações da plataforma' });
  }
};
