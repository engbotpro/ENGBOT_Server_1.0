import { Request, Response } from 'express';
import prisma from '../prismaClient';
import type { User } from '@prisma/client';

// Buscar histórico de trades do usuário
export const getUserTrades = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar trades do usuário ordenados por data de entrada (mais recentes primeiro)
    const trades = await prisma.trade.findMany({
      where: {
        userId: userId
      },
      orderBy: {
        entryTime: 'desc'
      },
      select: {
        id: true,
        symbol: true,
        side: true,
        type: true,
        quantity: true,
        price: true,
        total: true,
        tradeType: true, // 'manual' | 'automated' | 'bot'
        environment: true, // 'real' | 'simulated' | 'paper'
        botId: true,
        botName: true,
        pnl: true,
        pnlPercent: true,
        status: true,
        entryTime: true,
        exitTime: true,
        stopLoss: true,
        takeProfit: true,
        fees: true,
        exitPrice: true,
        notes: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      data: trades,
      total: trades.length
    });

  } catch (error) {
    console.error('Erro ao buscar trades do usuário:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Criar novo trade
export const createTrade = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const {
      symbol,
      side,
      type,
      quantity,
      price,
      total,
      tradeType,
      environment,
      botId,
      botName,
      stopLoss,
      takeProfit,
      fees,
      exitPrice,
      notes
    } = req.body;

    // Validar campos obrigatórios
    if (!symbol || !side || !type || !quantity || !price || !total || !tradeType || !environment) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: symbol, side, type, quantity, price, total, tradeType, environment' 
      });
    }

    // Criar o trade
    const trade = await prisma.trade.create({
      data: {
        userId,
        symbol,
        side,
        type,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        total: parseFloat(total),
        tradeType,
        environment,
        botId,
        botName,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        takeProfit: takeProfit ? parseFloat(takeProfit) : null,
        fees: fees ? parseFloat(fees) : null,
        exitPrice: exitPrice ? parseFloat(exitPrice) : null,
        notes: notes || null,
        status: 'open'
      }
    });

    res.status(201).json({
      success: true,
      data: trade
    });

  } catch (error) {
    console.error('Erro ao criar trade:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Atualizar trade (fechar posição, atualizar PnL, etc.)
export const updateTrade = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { tradeId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const {
      pnl,
      pnlPercent,
      status,
      exitTime,
      fees,
      exitPrice,
      notes,
      takeProfit,
      stopLoss
    } = req.body;

    // Verificar se o trade pertence ao usuário
    const existingTrade = await prisma.trade.findFirst({
      where: {
        id: tradeId,
        userId: userId
      }
    });

    if (!existingTrade) {
      return res.status(404).json({ error: 'Trade não encontrado' });
    }

    // Atualizar o trade - SL/TP são fixos e NUNCA devem ser alterados ao fechar
    const updateData: any = {
      pnl: pnl !== undefined ? parseFloat(pnl) : undefined,
      pnlPercent: pnlPercent !== undefined ? parseFloat(pnlPercent) : undefined,
      status: status || undefined,
      exitTime: exitTime ? new Date(exitTime) : undefined,
      fees: fees !== undefined ? parseFloat(fees) : undefined,
      exitPrice: exitPrice !== undefined ? parseFloat(exitPrice) : undefined,
      notes: notes || undefined,
    };
    // Só permite alterar SL/TP se o trade continuar aberto (não ao fechar)
    if (status !== 'closed' && status !== 'cancelled') {
      if (takeProfit !== undefined) updateData.takeProfit = takeProfit ? parseFloat(takeProfit) : null;
      if (stopLoss !== undefined) updateData.stopLoss = stopLoss ? parseFloat(stopLoss) : null;
    }

    const updatedTrade = await prisma.trade.update({
      where: { id: tradeId },
      data: updateData
    });

    // Se o trade foi fechado e tem P/L, atualizar a carteira virtual
    if (status === 'closed' && pnl !== undefined && existingTrade.environment === 'simulated') {
      try {
        const { BotTradeService } = await import('../services/botTradeService');
        await BotTradeService.updateVirtualWalletWithPnL(userId, parseFloat(pnl));
        console.log(`💰 Carteira virtual atualizada com P/L: ${parseFloat(pnl).toFixed(2)} para trade ${tradeId}`);
      } catch (error) {
        console.error(`❌ Erro ao atualizar carteira virtual para trade ${tradeId}:`, error);
        // Não falhar a requisição se houver erro ao atualizar carteira
      }
    }

    res.json({
      success: true,
      data: updatedTrade
    });

  } catch (error) {
    console.error('Erro ao atualizar trade:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Buscar estatísticas de trades do usuário
export const getTradeStats = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar todos os trades fechados do usuário
    const closedTrades = await prisma.trade.findMany({
      where: {
        userId: userId,
        status: 'closed',
        pnl: {
          not: null
        }
      }
    });

    // Calcular estatísticas
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(trade => (trade.pnl || 0) > 0).length;
    const losingTrades = closedTrades.filter(trade => (trade.pnl || 0) < 0).length;
    const totalPnL = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const totalFees = closedTrades.reduce((sum, trade) => sum + (trade.fees || 0), 0);
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const averagePnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    // Separar por tipo de trade
    const manualTrades = closedTrades.filter(trade => trade.tradeType === 'manual');
    const automatedTrades = closedTrades.filter(trade => trade.tradeType === 'automated' || trade.tradeType === 'bot');

    // Separar por ambiente
    const realTrades = closedTrades.filter(trade => trade.environment === 'real');
    const simulatedTrades = closedTrades.filter(trade => trade.environment === 'simulated' || trade.environment === 'paper');

    res.json({
      success: true,
      data: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: parseFloat(winRate.toFixed(2)),
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        totalFees: parseFloat(totalFees.toFixed(2)),
        averagePnL: parseFloat(averagePnL.toFixed(2)),
        byType: {
          manual: {
            count: manualTrades.length,
            pnl: parseFloat(manualTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2))
          },
          automated: {
            count: automatedTrades.length,
            pnl: parseFloat(automatedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2))
          }
        },
        byEnvironment: {
          real: {
            count: realTrades.length,
            pnl: parseFloat(realTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2))
          },
          simulated: {
            count: simulatedTrades.length,
            pnl: parseFloat(simulatedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2))
          }
        }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas de trades:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}; 