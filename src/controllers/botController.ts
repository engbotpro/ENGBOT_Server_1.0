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

export const getBots = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const bots = await prisma.bot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bots);
  } catch (error) {
    console.error('Erro ao buscar bots:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getBotById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const bot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    res.json(bot);
  } catch (error) {
    console.error('Erro ao buscar bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const createBot = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const {
      name,
      environment,
      symbol,
      timeframe,
      startDate,
      endDate,
      operationMode,
      operationTime,
      primaryIndicator,
      secondaryIndicator,
      confirmationIndicator,
      indicators,
      strategyId,
      strategyName,
      entryType,
      entryCondition,
      entryValue,
      exitType,
      exitCondition,
      exitValue,
      positionSizingType,
      positionSizingValue,
      maxPosition,
      partialExitsEnabled,
      partialExitsLevels,
      stopLossEnabled,
      stopLossType,
      stopLossValue,
      takeProfitEnabled,
      takeProfitType,
      takeProfitValue,
      maxDailyLoss,
      maxDrawdown,
      maxOpenPositions,
      timeFilterEnabled,
      timeFilterStart,
      timeFilterEnd,
      newsFilterEnabled,
      avoidNewsMinutes,
      correlationFilterEnabled,
      maxCorrelation,
      entryExecutionMode,
      exitExecutionMode
    } = req.body;

    // Validações básicas
    if (!name || !environment || !symbol || !startDate) {
      res.status(400).json({ error: 'Campos obrigatórios não preenchidos' });
      return;
    }

    // Validação do indicador primário (obrigatório)
    if (!primaryIndicator || primaryIndicator.trim() === '') {
      res.status(400).json({ error: 'Indicador primário é obrigatório' });
      return;
    }

    const bot = await prisma.bot.create({
      data: {
        userId,
        name,
        environment,
        symbol,
        timeframe: timeframe || '1h',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        operationMode,
        operationTime: operationTime ? JSON.stringify(operationTime) : undefined,
        primaryIndicator,
        secondaryIndicator,
        confirmationIndicator,
        indicators: indicators ? (typeof indicators === 'string' ? JSON.parse(indicators) : indicators) : undefined,
        strategyId: strategyId || undefined,
        strategyName: strategyName || undefined,
        entryType,
        entryCondition,
        entryValue,
        exitType,
        exitCondition,
        exitValue,
        positionSizingType,
        positionSizingValue,
        maxPosition,
        partialExitsEnabled,
        partialExitsLevels: partialExitsLevels ? JSON.stringify(partialExitsLevels) : undefined,
        stopLossEnabled,
        stopLossType,
        stopLossValue,
        takeProfitEnabled,
        takeProfitType,
        takeProfitValue,
        maxDailyLoss,
        maxDrawdown,
        maxOpenPositions,
        timeFilterEnabled,
        timeFilterStart,
        timeFilterEnd,
        newsFilterEnabled,
        avoidNewsMinutes,
        correlationFilterEnabled,
        maxCorrelation,
        entryExecutionMode: entryExecutionMode || 'candle_close',
        exitExecutionMode: exitExecutionMode || 'candle_close'
      }
    });

    res.status(201).json(bot);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const updateBot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const existingBot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!existingBot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    const updateData = { ...req.body };
    
    // Validação do indicador primário se fornecido
    if (updateData.primaryIndicator !== undefined) {
      if (!updateData.primaryIndicator || updateData.primaryIndicator.trim() === '') {
        res.status(400).json({ error: 'Indicador primário não pode ser vazio' });
        return;
      }
    }
    
    // Converter campos JSON se necessário
    if (updateData.operationTime) {
      updateData.operationTime = JSON.stringify(updateData.operationTime);
    }
    if (updateData.partialExitsLevels) {
      updateData.partialExitsLevels = JSON.stringify(updateData.partialExitsLevels);
    }
    if (updateData.indicators) {
      updateData.indicators = typeof updateData.indicators === 'string' 
        ? JSON.parse(updateData.indicators) 
        : updateData.indicators;
    }
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate !== undefined) {
      updateData.endDate = updateData.endDate ? new Date(updateData.endDate) : null;
    }

    const bot = await prisma.bot.update({
      where: { id },
      data: updateData
    });

    res.json(bot);
  } catch (error) {
    console.error('Erro ao atualizar bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const deleteBot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const existingBot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!existingBot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    await prisma.bot.delete({
      where: { id }
    });

    res.json({ message: 'Bot deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const toggleBotActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, deactivationReason } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const existingBot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!existingBot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    // Se tentando ativar, verificar se há saldo suficiente
    if (isActive && existingBot.environment === 'virtual') {
      // Buscar carteira virtual do usuário
      const wallet = await prisma.wallet.findFirst({
        where: {
          userId,
          type: 'virtual',
          symbol: 'USDT'
        }
      });

      const balance = wallet?.balance || 0;
      const MINIMUM_BALANCE = 1; // Saldo mínimo necessário (1 USDT)

      if (balance < MINIMUM_BALANCE) {
        res.status(400).json({ 
          error: `Saldo insuficiente para operar. Saldo atual: ${balance.toFixed(2)} USDT. Saldo mínimo necessário: ${MINIMUM_BALANCE} USDT. Adicione fundos para iniciar o robô.` 
        });
        return;
      }
    }

    const updateData: { isActive: boolean; deactivationReason?: string | null } = { isActive };
    if (isActive === false && deactivationReason != null) {
      updateData.deactivationReason = String(deactivationReason).trim() || null;
    } else if (isActive === true) {
      updateData.deactivationReason = null;
    }

    const bot = await prisma.bot.update({
      where: { id },
      data: updateData
    });

    res.json(bot);
  } catch (error) {
    console.error('Erro ao alterar status do bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const updateBotPerformance = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const existingBot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!existingBot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    const performanceData = req.body;
    
    const bot = await prisma.bot.update({
      where: { id },
      data: performanceData
    });

    res.json(bot);
  } catch (error) {
    console.error('Erro ao atualizar performance do bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getBotsByStatus = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const bots = await prisma.bot.findMany({
      where: { 
        userId,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bots);
  } catch (error) {
    console.error('Erro ao buscar bots por status:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getBotsByEnvironment = async (req: Request, res: Response) => {
  try {
    const { environment } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!['real', 'virtual'].includes(environment)) {
      res.status(400).json({ error: 'Ambiente inválido' });
      return;
    }

    const bots = await prisma.bot.findMany({
      where: { userId, environment },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bots);
  } catch (error) {
    console.error('Erro ao buscar bots por ambiente:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const getBotsBySymbol = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const bots = await prisma.bot.findMany({
      where: { 
        userId,
        symbol: { contains: symbol, mode: 'insensitive' }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bots);
  } catch (error) {
    console.error('Erro ao buscar bots por símbolo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar robôs de um usuário específico (para desafios)
export const getBotsByUserId = async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = getUserId(req);

    if (!currentUserId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Buscar robôs do usuário especificado
    const bots = await prisma.bot.findMany({
      where: { 
        userId: targetUserId
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(bots);
  } catch (error) {
    console.error('Erro ao buscar bots por userId:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar robô por ID sem restrição de usuário (para desafios - apenas nome)
export const getBotByIdPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = getUserId(req);

    if (!currentUserId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Buscar robô sem restrição de usuário (apenas para exibir nome em desafios)
    const bot = await prisma.bot.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        symbol: true
      }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    res.json(bot);
  } catch (error) {
    console.error('Erro ao buscar bot por ID público:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar trades (abertos e fechados) de um bot específico
export const getBotOpenTrades = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const bot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    // Buscar trades abertos do bot
    const openTrades = await prisma.trade.findMany({
      where: {
        botId: id,
        status: 'open'
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
        entryTime: true,
        stopLoss: true,
        takeProfit: true,
        botName: true,
        status: true
      }
    });

    // Buscar trades fechados do bot (últimos 50 para não sobrecarregar)
    const closedTrades = await prisma.trade.findMany({
      where: {
        botId: id,
        status: 'closed'
      },
      orderBy: {
        exitTime: 'desc'
      },
      take: 50, // Limitar a 50 trades fechados mais recentes
      select: {
        id: true,
        symbol: true,
        side: true,
        type: true,
        quantity: true,
        price: true,
        total: true,
        entryTime: true,
        exitTime: true,
        exitPrice: true,
        pnl: true,
        pnlPercent: true,
        stopLoss: true,
        takeProfit: true,
        botName: true,
        status: true
      }
    });

    res.json({
      success: true,
      data: {
        open: openTrades,
        closed: closedTrades
      },
      total: openTrades.length + closedTrades.length,
      openCount: openTrades.length,
      closedCount: closedTrades.length
    });
  } catch (error) {
    console.error('Erro ao buscar trades do bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Fechar todas as posições abertas de um bot
export const closeAllBotTrades = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o bot pertence ao usuário
    const bot = await prisma.bot.findFirst({
      where: { id, userId }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot não encontrado' });
      return;
    }

    // Buscar todas as posições abertas do bot
    const openTrades = await prisma.trade.findMany({
      where: {
        botId: id,
        status: 'open'
      }
    });

    if (openTrades.length === 0) {
      res.json({
        success: true,
        message: 'Nenhuma posição aberta encontrada',
        closedCount: 0
      });
      return;
    }

    // Buscar o preço atual do símbolo usando a Binance API
    const { fetchHistoricalKlines } = await import('../services/binanceService');
    const klines = await fetchHistoricalKlines(bot.symbol, bot.timeframe || '1h', 1);
    const currentPrice = klines && klines.length > 0 ? klines[klines.length - 1].close : null;

    if (!currentPrice) {
      res.status(500).json({ error: 'Não foi possível obter o preço atual do símbolo' });
      return;
    }

    // Fechar todas as posições
    let closedCount = 0;
    let totalPnL = 0;

    for (const trade of openTrades) {
      // Calcular P/L
      let pnl: number;
      if (trade.side === 'buy') {
        pnl = (currentPrice - trade.price) * trade.quantity;
      } else {
        pnl = (trade.price - currentPrice) * trade.quantity;
      }
      
      const pnlPercent = ((currentPrice - trade.price) / trade.price) * 100 * (trade.side === 'buy' ? 1 : -1);

      // Atualizar o trade
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          status: 'closed',
          exitTime: new Date(),
          exitPrice: currentPrice,
          pnl: pnl,
          pnlPercent: pnlPercent
        }
      });

      // Atualizar saldo virtual do usuário com o P/L do trade
      const { BotTradeService } = await import('../services/botTradeService');
      await BotTradeService.updateVirtualWalletWithPnL(bot.userId, pnl);

      closedCount++;
      totalPnL += pnl;
      
      console.log(`✅ Trade ${trade.id} fechado: ${trade.side.toUpperCase()} @ ${currentPrice.toFixed(2)}, P/L: ${pnl.toFixed(2)}`);
    }

    // Atualizar estatísticas do bot
    const { BotTradeService } = await import('../services/botTradeService');
    await BotTradeService.updateBotStatistics(bot.id);

    res.json({
      success: true,
      message: `${closedCount} posição(ões) fechada(s) com sucesso`,
      closedCount,
      totalPnL
    });
  } catch (error) {
    console.error('Erro ao fechar posições do bot:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
