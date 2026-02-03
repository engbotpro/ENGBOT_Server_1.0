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

// Criar solicitação de testador
export const createTesterRequest = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { description } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({
        error: 'Descrição do teste e problema identificado é obrigatória'
      });
    }

    // Verificar se o usuário já tem uma solicitação pendente
    const existingPending = await prisma.testerRequest.findFirst({
      where: {
        userId,
        status: 'pending'
      }
    });

    if (existingPending) {
      return res.status(400).json({
        error: 'Você já possui uma solicitação de testador pendente. Aguarde a avaliação.'
      });
    }

    // Criar nova solicitação
    const testerRequest = await prisma.testerRequest.create({
      data: {
        userId,
        description: description.trim(),
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Solicitação de testador enviada com sucesso! Um administrador avaliará sua solicitação.',
      data: testerRequest
    });
  } catch (error) {
    console.error('Erro ao criar solicitação de testador:', error);
    res.status(500).json({
      error: 'Erro interno do servidor ao processar solicitação'
    });
  }
};

// Obter todas as solicitações (para admin)
export const getAllTesterRequests = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { perfil: true }
    });

    if (user?.perfil !== 'Admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores podem visualizar solicitações.'
      });
    }

    const requests = await prisma.testerRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Erro ao buscar solicitações de testadores:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

// Obter solicitações do próprio usuário
export const getMyTesterRequests = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const requests = await prisma.testerRequest.findMany({
      where: {
        userId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Erro ao buscar solicitações do usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

// Aprovar solicitação de testador
export const approveTesterRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
        error: 'Acesso negado. Apenas administradores podem aprovar solicitações.'
      });
    }

    // Buscar a solicitação
    const request = await prisma.testerRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!request) {
      return res.status(404).json({
        error: 'Solicitação não encontrada'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Esta solicitação já foi ${request.status === 'approved' ? 'aprovada' : 'rejeitada'}`
      });
    }

    // Atualizar status da solicitação
    const updatedRequest = await prisma.testerRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Adicionar 1 Super Crédito ao usuário
    // Buscar carteira de Super Créditos (usando Wallet com symbol='SUPER_CREDITS')
    let superCreditsWallet = await prisma.wallet.findFirst({
      where: {
        userId: request.userId,
        type: 'virtual',
        symbol: 'SUPER_CREDITS'
      }
    });

    if (!superCreditsWallet) {
      // Criar carteira de Super Créditos se não existir
      superCreditsWallet = await prisma.wallet.create({
        data: {
          userId: request.userId,
          type: 'virtual',
          symbol: 'SUPER_CREDITS',
          name: 'Super Créditos',
          balance: 1,
          value: 1
        }
      });
    } else {
      // Atualizar saldo
      await prisma.wallet.update({
        where: { id: superCreditsWallet.id },
        data: {
          balance: superCreditsWallet.balance + 1,
          value: superCreditsWallet.value + 1
        }
      });
    }

    res.json({
      message: `Testador aprovado! ${request.user.name} recebeu 1 Super Crédito.`,
      data: updatedRequest
    });
  } catch (error) {
    console.error('Erro ao aprovar solicitação de testador:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

// Rejeitar solicitação de testador
export const rejectTesterRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
        error: 'Acesso negado. Apenas administradores podem rejeitar solicitações.'
      });
    }

    // Buscar a solicitação
    const request = await prisma.testerRequest.findUnique({
      where: { id }
    });

    if (!request) {
      return res.status(404).json({
        error: 'Solicitação não encontrada'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `Esta solicitação já foi ${request.status === 'approved' ? 'aprovada' : 'rejeitada'}`
      });
    }

    // Atualizar status da solicitação
    const updatedRequest = await prisma.testerRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedAt: new Date(),
        approvedBy: adminId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      message: 'Solicitação rejeitada',
      data: updatedRequest
    });
  } catch (error) {
    console.error('Erro ao rejeitar solicitação de testador:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};
