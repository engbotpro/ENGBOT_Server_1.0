import { Request, Response } from 'express';
import prisma from '../prismaClient';

// Helper para extrair ID do usuário
const getUserId = (req: Request): string => {
  if (typeof req.user === 'string') return req.user;
  return (req.user as any)?.id || '';
};

// Criar tipos padrão para novos usuários
const createDefaultExpenseTypes = async (userId: string) => {
  const defaultTypes = [
    'Alimentação',
    'Transporte', 
    'Moradia',
    'Lazer',
    'Saúde',
    'Educação'
  ];

  const existingTypes = await prisma.expenseType.findMany({
    where: { userId, isDefault: true }
  });

  if (existingTypes.length === 0) {
    await prisma.expenseType.createMany({
      data: defaultTypes.map(name => ({
        userId,
        name,
        isDefault: true
      }))
    });
  }
};

// Obter todos os tipos de gastos do usuário
export const getExpenseTypes = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Criar tipos padrão se não existirem
    await createDefaultExpenseTypes(userId);

    const expenseTypes = await prisma.expenseType.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' }, // Tipos padrão primeiro
        { name: 'asc' }        // Ordem alfabética
      ]
    });

    res.json(expenseTypes);
  } catch (error) {
    console.error('Erro ao buscar tipos de gastos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Criar novo tipo de gasto
export const createExpenseType = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Nome do tipo é obrigatório' });
      return;
    }

    const trimmedName = name.trim();

    // Verificar se já existe
    const existingType = await prisma.expenseType.findUnique({
      where: {
        userId_name: {
          userId,
          name: trimmedName
        }
      }
    });

    if (existingType) {
      res.status(409).json({ error: 'Tipo de gasto já existe' });
      return;
    }

    const newExpenseType = await prisma.expenseType.create({
      data: {
        userId,
        name: trimmedName,
        isDefault: false
      }
    });

    res.status(201).json(newExpenseType);
  } catch (error) {
    console.error('Erro ao criar tipo de gasto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Deletar tipo de gasto
export const deleteExpenseType = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do tipo é obrigatório' });
      return;
    }

    // Verificar se existe e pertence ao usuário
    const expenseType = await prisma.expenseType.findUnique({
      where: { id }
    });

    if (!expenseType || expenseType.userId !== userId) {
      res.status(404).json({ error: 'Tipo de gasto não encontrado' });
      return;
    }

    // Não permitir deletar tipos padrão
    if (expenseType.isDefault) {
      res.status(403).json({ error: 'Não é possível deletar tipos padrão do sistema' });
      return;
    }

    await prisma.expenseType.delete({
      where: { id }
    });

    res.json({ message: 'Tipo de gasto deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar tipo de gasto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Atualizar nome do tipo de gasto
export const updateExpenseType = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!id) {
      res.status(400).json({ error: 'ID do tipo é obrigatório' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Nome do tipo é obrigatório' });
      return;
    }

    const trimmedName = name.trim();

    // Verificar se existe e pertence ao usuário
    const expenseType = await prisma.expenseType.findUnique({
      where: { id }
    });

    if (!expenseType || expenseType.userId !== userId) {
      res.status(404).json({ error: 'Tipo de gasto não encontrado' });
      return;
    }

    // Não permitir editar tipos padrão
    if (expenseType.isDefault) {
      res.status(403).json({ error: 'Não é possível editar tipos padrão do sistema' });
      return;
    }

    // Verificar se o novo nome já existe
    const existingType = await prisma.expenseType.findUnique({
      where: {
        userId_name: {
          userId,
          name: trimmedName
        }
      }
    });

    if (existingType && existingType.id !== id) {
      res.status(409).json({ error: 'Já existe um tipo com este nome' });
      return;
    }

    const updatedExpenseType = await prisma.expenseType.update({
      where: { id },
      data: { name: trimmedName }
    });

    res.json(updatedExpenseType);
  } catch (error) {
    console.error('Erro ao atualizar tipo de gasto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};