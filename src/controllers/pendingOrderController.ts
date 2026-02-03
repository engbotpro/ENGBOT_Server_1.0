import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Criar nova ordem pendente
export const createPendingOrder = async (req: Request, res: Response) => {
  try {
    const { symbol, side, type, quantity, price, total, takeProfit, stopLoss, notes, environment = 'simulated' } = req.body;
    const userId = (req as any).user.id;

    const pendingOrder = await prisma.pendingOrder.create({
      data: {
        userId,
        symbol,
        side,
        type,
        quantity,
        price,
        total,
        takeProfit,
        stopLoss,
        notes,
        environment,
        status: 'pending'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Ordem pendente criada com sucesso',
      data: pendingOrder
    });
  } catch (error) {
    console.error('Erro ao criar ordem pendente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Obter todas as ordens pendentes do usuário
export const getPendingOrders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const pendingOrders = await prisma.pendingOrder.findMany({
      where: {
        userId,
        status: 'pending'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Ordens pendentes recuperadas com sucesso',
      data: pendingOrders
    });
  } catch (error) {
    console.error('Erro ao buscar ordens pendentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Atualizar ordem pendente (executar, cancelar ou editar)
export const updatePendingOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, exitPrice, pnl, pnlPercent, price, quantity, takeProfit, stopLoss } = req.body;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    const pendingOrder = await prisma.pendingOrder.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!pendingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Ordem pendente não encontrada'
      });
    }

    // Se a ordem não está mais pendente, não permitir edição
    if (pendingOrder.status !== 'pending' && (price || quantity || takeProfit !== undefined || stopLoss !== undefined)) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível editar uma ordem que não está pendente'
      });
    }

    // Preparar dados para atualização
    const updateData: any = {};
    
    // Se status foi fornecido, atualizar status
    if (status) {
      updateData.status = status;
    }
    
    // Se campos de edição foram fornecidos, atualizar
    if (price !== undefined) {
      updateData.price = parseFloat(price);
      updateData.total = updateData.price * (quantity !== undefined ? parseFloat(quantity) : pendingOrder.quantity);
    }
    
    if (quantity !== undefined) {
      updateData.quantity = parseFloat(quantity);
      updateData.total = (price !== undefined ? parseFloat(price) : pendingOrder.price) * updateData.quantity;
    }
    
    // Recalcular total se price ou quantity mudaram
    if (price !== undefined || quantity !== undefined) {
      if (!updateData.total) {
        updateData.total = (price !== undefined ? parseFloat(price) : pendingOrder.price) * (quantity !== undefined ? parseFloat(quantity) : pendingOrder.quantity);
      }
    }
    
    if (takeProfit !== undefined) {
      updateData.takeProfit = takeProfit === null || takeProfit === '' ? null : parseFloat(takeProfit);
    }
    
    if (stopLoss !== undefined) {
      updateData.stopLoss = stopLoss === null || stopLoss === '' ? null : parseFloat(stopLoss);
    }

    // Atualizar a ordem pendente
    const updatedOrder = await prisma.pendingOrder.update({
      where: { id },
      data: updateData
    });

    // NÃO criar trade automaticamente quando status é 'filled' via PUT
    // O trade deve ser criado apenas via endpoint /execute ou diretamente
    // Isso evita duplicação de trades
    let trade = null;

    res.status(200).json({
      success: true,
      message: 'Ordem pendente atualizada com sucesso',
      data: {
        pendingOrder: updatedOrder,
        trade
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar ordem pendente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Cancelar ordem pendente
export const cancelPendingOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const pendingOrder = await prisma.pendingOrder.findFirst({
      where: {
        id,
        userId,
        status: 'pending'
      }
    });

    if (!pendingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Ordem pendente não encontrada'
      });
    }

    const updatedOrder = await prisma.pendingOrder.update({
      where: { id },
      data: {
        status: 'cancelled'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Ordem pendente cancelada com sucesso',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Erro ao cancelar ordem pendente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Executar ordem pendente (quando condições são atendidas)
export const executePendingOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { exitPrice, pnl, pnlPercent } = req.body;
    const userId = (req as any).user.id;

    const pendingOrder = await prisma.pendingOrder.findFirst({
      where: {
        id,
        userId,
        status: 'pending'
      }
    });

    if (!pendingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Ordem pendente não encontrada'
      });
    }

    // Atualizar ordem para executada (apenas status)
    const updatedOrder = await prisma.pendingOrder.update({
      where: { id },
      data: {
        status: 'filled'
      }
    });

    // Criar trade executado
    const trade = await prisma.trade.create({
      data: {
        userId,
        symbol: pendingOrder.symbol,
        side: pendingOrder.side,
        type: pendingOrder.type,
        quantity: pendingOrder.quantity,
        price: exitPrice || pendingOrder.price,
        total: (exitPrice || pendingOrder.price) * pendingOrder.quantity,
        tradeType: 'manual',
        environment: pendingOrder.environment,
        status: 'closed',
        takeProfit: pendingOrder.takeProfit,
        stopLoss: pendingOrder.stopLoss,
        exitPrice,
        pnl,
        pnlPercent,
        notes: `Ordem limit executada: ${pendingOrder.notes || ''}`
      }
    });

    res.status(200).json({
      success: true,
      message: 'Ordem pendente executada com sucesso',
      data: {
        pendingOrder: updatedOrder,
        trade
      }
    });
  } catch (error) {
    console.error('Erro ao executar ordem pendente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}; 