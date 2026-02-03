import { Request, Response } from 'express';
import prisma from '../prismaClient';

// Criar um novo backtest
export const createBacktest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      userId,
      name,
      botId,
      startDate,
      endDate,
      startTime,
      endTime,
      symbol,
      timeframe,
      initialCapital,
      commission,
      slippage,
      strategy,
      strategyConfig,
    } = req.body;

    if (!userId || !name || !startDate || !endDate || !symbol || !initialCapital) {
      res.status(400).json({ error: 'Campos obrigatórios faltando' });
      return;
    }

    const backtest = await prisma.backtest.create({
      data: {
        userId,
        name,
        botId: botId || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        startTime: startTime || '00:00',
        endTime: endTime || '23:59',
        symbol,
        timeframe: timeframe || '1h',
        initialCapital: parseFloat(initialCapital),
        commission: parseFloat(commission) || 0.1,
        slippage: parseFloat(slippage) || 0.05,
        strategy: strategy || null,
        strategyConfig: strategyConfig || null,
        status: 'pending',
      },
      include: {
        bot: true,
      },
    });

    res.status(201).json(backtest);
  } catch (error) {
    console.error('Erro ao criar backtest:', error);
    res.status(500).json({ error: 'Erro ao criar backtest' });
  }
};

// Listar backtests do usuário
export const getBacktests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const backtests = await prisma.backtest.findMany({
      where: { userId },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            symbol: true,
            timeframe: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(backtests);
  } catch (error) {
    console.error('Erro ao buscar backtests:', error);
    res.status(500).json({ error: 'Erro ao buscar backtests' });
  }
};

// Buscar backtest por ID
export const getBacktestById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backtest = await prisma.backtest.findUnique({
      where: { id },
      include: {
        bot: true,
      },
    });

    if (!backtest) {
      res.status(404).json({ error: 'Backtest não encontrado' });
      return;
    }

    res.json(backtest);
  } catch (error) {
    console.error('Erro ao buscar backtest:', error);
    res.status(500).json({ error: 'Erro ao buscar backtest' });
  }
};

// Atualizar backtest (resultados)
export const updateBacktest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      finalCapital,
      totalReturn,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      trades,
      equityCurve,
      status,
      errorMessage,
    } = req.body;

    const backtest = await prisma.backtest.update({
      where: { id },
      data: {
        finalCapital: finalCapital !== undefined ? parseFloat(finalCapital) : undefined,
        totalReturn: totalReturn !== undefined ? parseFloat(totalReturn) : undefined,
        totalTrades: totalTrades !== undefined ? parseInt(totalTrades) : undefined,
        winningTrades: winningTrades !== undefined ? parseInt(winningTrades) : undefined,
        losingTrades: losingTrades !== undefined ? parseInt(losingTrades) : undefined,
        winRate: winRate !== undefined ? parseFloat(winRate) : undefined,
        profitFactor: profitFactor !== undefined ? parseFloat(profitFactor) : undefined,
        maxDrawdown: maxDrawdown !== undefined ? parseFloat(maxDrawdown) : undefined,
        sharpeRatio: sharpeRatio !== undefined ? parseFloat(sharpeRatio) : undefined,
        trades: trades || undefined,
        equityCurve: equityCurve || undefined,
        status: status || undefined,
        errorMessage: errorMessage || undefined,
      },
      include: {
        bot: true,
      },
    });

    res.json(backtest);
  } catch (error) {
    console.error('Erro ao atualizar backtest:', error);
    res.status(500).json({ error: 'Erro ao atualizar backtest' });
  }
};

// Deletar backtest
export const deleteBacktest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.backtest.delete({
      where: { id },
    });

    res.json({ message: 'Backtest deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar backtest:', error);
    res.status(500).json({ error: 'Erro ao deletar backtest' });
  }
};

// Salvar backtest completo (criar e já incluir resultados)
export const saveCompleteBacktest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      userId,
      name,
      botId,
      startDate,
      endDate,
      startTime,
      endTime,
      symbol,
      timeframe,
      initialCapital,
      commission,
      slippage,
      strategy,
      strategyConfig,
      // Resultados
      finalCapital,
      totalReturn,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      trades,
      equityCurve,
    } = req.body;

    if (!userId || !name || !startDate || !endDate || !symbol || !initialCapital) {
      res.status(400).json({ error: 'Campos obrigatórios faltando' });
      return;
    }

    const backtest = await prisma.backtest.create({
      data: {
        userId,
        name,
        botId: botId || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        startTime: startTime || '00:00',
        endTime: endTime || '23:59',
        symbol,
        timeframe: timeframe || '1h',
        initialCapital: parseFloat(initialCapital),
        commission: parseFloat(commission) || 0.1,
        slippage: parseFloat(slippage) || 0.05,
        strategy: strategy || null,
        strategyConfig: strategyConfig || null,
        // Resultados
        finalCapital: finalCapital !== undefined ? parseFloat(finalCapital) : null,
        totalReturn: totalReturn !== undefined ? parseFloat(totalReturn) : null,
        totalTrades: totalTrades !== undefined ? parseInt(totalTrades) : 0,
        winningTrades: winningTrades !== undefined ? parseInt(winningTrades) : 0,
        losingTrades: losingTrades !== undefined ? parseInt(losingTrades) : 0,
        winRate: winRate !== undefined ? parseFloat(winRate) : null,
        profitFactor: profitFactor !== undefined ? parseFloat(profitFactor) : null,
        maxDrawdown: maxDrawdown !== undefined ? parseFloat(maxDrawdown) : null,
        sharpeRatio: sharpeRatio !== undefined ? parseFloat(sharpeRatio) : null,
        trades: trades || null,
        equityCurve: equityCurve || null,
        status: 'completed',
      },
      include: {
        bot: true,
      },
    });

    res.status(201).json(backtest);
  } catch (error) {
    console.error('Erro ao salvar backtest completo:', error);
    res.status(500).json({ error: 'Erro ao salvar backtest' });
  }
};
