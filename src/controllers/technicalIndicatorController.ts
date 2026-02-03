import { Request, Response, RequestHandler } from 'express';
import prisma from '../prismaClient';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

// Buscar indicadores do usuário
export const getUserIndicators: RequestHandler = async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const indicators = await prisma.technicalIndicator.findMany({
      where: {
        userId,
        active: true,
      },
      orderBy: {
        order: 'asc',
      },
    });

    res.json(indicators);
  } catch (error) {
    console.error('Erro ao buscar indicadores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Criar novo indicador
export const createIndicator: RequestHandler = async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { type, config } = req.body;

    if (!type || !config) {
      res.status(400).json({ error: 'Tipo e configuração são obrigatórios' });
      return;
    }

    // Buscar o maior order atual para este usuário
    const maxOrder = await prisma.technicalIndicator.aggregate({
      where: {
        userId,
        type,
      },
      _max: {
        order: true,
      },
    });

    const newOrder = (maxOrder._max.order || 0) + 1;

    const indicator = await prisma.technicalIndicator.create({
      data: {
        userId,
        type,
        config,
        order: newOrder,
      },
    });

    res.status(201).json(indicator);
  } catch (error) {
    console.error('Erro ao criar indicador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Atualizar indicador
export const updateIndicator: RequestHandler = async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const { id } = req.params;
    const { config } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!config) {
      res.status(400).json({ error: 'Configuração é obrigatória' });
      return;
    }

    const indicator = await prisma.technicalIndicator.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!indicator) {
      res.status(404).json({ error: 'Indicador não encontrado' });
      return;
    }

    const updatedIndicator = await prisma.technicalIndicator.update({
      where: {
        id,
      },
      data: {
        config,
        updatedAt: new Date(),
      },
    });

    res.json(updatedIndicator);
  } catch (error) {
    console.error('Erro ao atualizar indicador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Deletar indicador
export const deleteIndicator: RequestHandler = async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const indicator = await prisma.technicalIndicator.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!indicator) {
      res.status(404).json({ error: 'Indicador não encontrado' });
      return;
    }

    await prisma.technicalIndicator.delete({
      where: {
        id,
      },
    });

    res.json({ message: 'Indicador deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar indicador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Atualizar ordem dos indicadores
export const updateIndicatorsOrder: RequestHandler = async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const { indicators } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!Array.isArray(indicators)) {
      res.status(400).json({ error: 'Lista de indicadores é obrigatória' });
      return;
    }

    // Atualizar a ordem de todos os indicadores
    for (const indicator of indicators) {
      await prisma.technicalIndicator.update({
        where: {
          id: indicator.id,
          userId,
        },
        data: {
          order: indicator.order,
        },
      });
    }

    res.json({ message: 'Ordem atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar ordem dos indicadores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}; 