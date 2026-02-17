import { Request, Response } from 'express';
import prisma from '../prismaClient';

const getUserId = (req: Request): string | null => {
  const user = (req as any).user;
  return user?.id ?? null;
};

const isAdmin = (req: Request): boolean => {
  const user = (req as any).user;
  return String(user?.perfil || '').toLowerCase() === 'admin';
};

// Enviar feedback (erro ou sugestão)
export const createFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { message, type } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Mensagem é obrigatória' });
      return;
    }

    const feedbackType = (type === 'error' ? 'error' : 'suggestion') as string;

    const feedback = await prisma.userFeedback.create({
      data: {
        userId,
        message: message.trim(),
        type: feedbackType,
      },
    });

    res.status(201).json(feedback);
  } catch (error) {
    console.error('Erro ao criar feedback:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

// Listar minhas mensagens (usuário logado)
export const getMyFeedbacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const feedbacks = await prisma.userFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(feedbacks);
  } catch (error) {
    console.error('Erro ao buscar feedbacks:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
};

// Listar todas as mensagens (apenas admin)
export const getAllFeedbacks = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
      return;
    }

    const feedbacks = await prisma.userFeedback.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(feedbacks);
  } catch (error) {
    console.error('Erro ao buscar feedbacks (admin):', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
};
