import { Request, Response } from 'express';
import prisma from '../prismaClient';

// Obter todas as mensagens do usuário
export const getChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens do chat:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens do chat' });
  }
};

// Criar uma nova mensagem
export const createChatMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const userPerfil = (req as any).user?.perfil;
    const { text, sender } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Texto da mensagem é obrigatório' });
      return;
    }

    if (!sender || !['user', 'support'].includes(sender)) {
      res.status(400).json({ error: 'Tipo de remetente inválido' });
      return;
    }

    // Apenas admins podem enviar mensagens como 'support'
    if (sender === 'support' && userPerfil !== 'Admin') {
      res.status(403).json({ error: 'Apenas administradores podem enviar mensagens como suporte' });
      return;
    }

    // Usuários normais só podem enviar como 'user'
    const finalSender = userPerfil === 'Admin' ? sender : 'user';

    const message = await prisma.chatMessage.create({
      data: {
        userId,
        text: text.trim(),
        sender: finalSender,
        read: finalSender === 'user' ? false : true, // Mensagens do suporte são marcadas como lidas
      },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Erro ao criar mensagem do chat:', error);
    res.status(500).json({ error: 'Erro ao criar mensagem do chat' });
  }
};

// Marcar mensagens como lidas
export const markMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    await prisma.chatMessage.updateMany({
      where: {
        userId,
        sender: 'support',
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({ message: 'Mensagens marcadas como lidas' });
  } catch (error) {
    console.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
};

