import { Request, Response } from 'express';
import prisma from '../prismaClient';

interface TradeData {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: Date;
}

// Função helper para registrar transações de tokens
const recordTokenTransaction = async (
  userId: string,
  type: string,
  amount: number,
  description: string,
  challengeId?: string,
  metadata?: any
): Promise<void> => {
  try {
    // Verificar se o modelo tokenTransaction existe no Prisma Client
    // @ts-ignore - tokenTransaction será disponível após regenerar Prisma Client
    if (!prisma.tokenTransaction) {
      console.warn('⚠️ Modelo tokenTransaction não encontrado. Transação não será registrada. Execute: npx prisma generate');
      return;
    }

    // Buscar saldo atual do usuário após a transação
    const userStats = await prisma.userChallengeStats.findUnique({
      where: { userId }
    });
    
    const balanceAfter = userStats ? userStats.tokens : 0;
    
    // Criar registro da transação
    // @ts-ignore - tokenTransaction será disponível após regenerar Prisma Client
    await prisma.tokenTransaction.create({
      data: {
        userId,
        type,
        amount,
        balanceAfter,
        description,
        challengeId: challengeId || null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null
      }
    });
  } catch (error) {
    console.error('Erro ao registrar transação de tokens:', error);
    // Não lançar erro para não interromper o fluxo principal
  }
};

// Constrói o momento (UTC) de início a partir de startDate + startTime (enviados em UTC pelo cliente)
const getStartDateTimeUtc = (startDate: Date, startTime: string): Date => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD em UTC
  const [year, month, day] = startDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
};

// Função utilitária para verificar se um desafio expirou
const isChallengeExpired = (
  endDate: Date,
  endTime: string,
  startDate?: Date,
  startTime?: string
): boolean => {
  const now = new Date();

  // Montar DateTime de início em UTC (se fornecido)
  if (startDate && startTime) {
    const startDateTime = getStartDateTimeUtc(startDate, startTime);
    const startTolerance = 60_000; // 1 min
    if (now.getTime() + startTolerance < startDateTime.getTime()) {
      return false;
    }
  }

  // Montar DateTime de fim em UTC
  const [eH, eM] = endTime.split(":" ).map(Number);
  const endDateStr = endDate.toISOString().split('T')[0];
  const [year, month, day] = endDateStr.split('-').map(Number);
  const endDateTime = new Date(Date.UTC(year, month - 1, day, eH, eM, 0, 0));

  const endBuffer = 30_000;
  return now.getTime() > endDateTime.getTime() + endBuffer;
};

// Função para atualizar desafios já concluídos que não têm vencedor definido
const updateCompletedChallengesWithoutWinner = async (): Promise<void> => {
  try {
    const completedChallenges = await prisma.challenge.findMany({
      where: {
        status: 'completed',
        winnerId: null
      }
    });

    for (const challenge of completedChallenges) {
      // Buscar todos os trades do desafio para calcular vencedor
      const trades = await prisma.challengeTrade.findMany({
        where: { challengeId: challenge.id }
      });

      // Calcular lucros de cada participante
      const challengerTrades = trades.filter(t => t.userId === challenge.challengerId);
      const challengedTrades = trades.filter(t => t.userId === challenge.challengedId);

      const challengerProfit = challengerTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
      const challengedProfit = challengedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);

      // Calcular retornos percentuais
      const challengerReturn = (challengerProfit / challenge.initialBalance) * 100;
      const challengedReturn = (challengedProfit / challenge.initialBalance) * 100;

      // Determinar vencedor baseado nos retornos
      let winnerId: string | null = null;
      let loserId: string | null = null;

      if (challengerReturn > challengedReturn) {
        winnerId = challenge.challengerId;
        loserId = challenge.challengedId;
      } else if (challengedReturn > challengerReturn) {
        winnerId = challenge.challengedId;
        loserId = challenge.challengerId;
      }
      // Se empate, winnerId e loserId ficam null

      // Atualizar saldos e retornos no desafio
      const challengerCurrentBalance = challenge.initialBalance + challengerProfit;
      const challengedCurrentBalance = challenge.initialBalance + challengedProfit;

      // Atualizar o desafio com vencedor e saldos (apenas se houver vencedor)
      if (winnerId && loserId) {
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { 
            winnerId: winnerId,
            loserId: loserId,
            challengerCurrentBalance: challengerCurrentBalance,
            challengedCurrentBalance: challengedCurrentBalance,
            challengerCurrentReturn: challengerReturn,
            challengedCurrentReturn: challengedReturn,
            challengerProfit: challengerProfit,
            challengedProfit: challengedProfit,
            challengerReturn: challengerReturn,
            challengedReturn: challengedReturn,
            updatedAt: new Date()
          }
        });

        // Distribuir tokens ao vencedor (apenas se ainda não foram distribuídos)
        // Verificar se já há transações de vitória para este desafio
        const existingWinTransaction = await prisma.tokenTransaction.findFirst({
          where: {
            challengeId: challenge.id,
            type: 'challenge_won'
          }
        });

        if (!existingWinTransaction) {
          // Adicionar tokens ao vencedor
          await prisma.userChallengeStats.update({
            where: { userId: winnerId },
            data: { 
              tokens: { increment: challenge.betAmount * 2 },
              totalWins: { increment: 1 }
            }
          });

          // Atualizar estatísticas do perdedor
          await prisma.userChallengeStats.update({
            where: { userId: loserId },
            data: { 
              totalLosses: { increment: 1 }
            }
          });

          // Registrar transação de tokens
          const winnerName = winnerId === challenge.challengerId ? 'Desafiante' : 'Desafiado';
          const loserName = loserId === challenge.challengerId ? 'Desafiante' : 'Desafiado';
          
          await recordTokenTransaction(
            winnerId,
            'challenge_won',
            challenge.betAmount * 2,
            `Vitória no desafio "${challenge.title}"`,
            challenge.id,
            {
              challengeTitle: challenge.title,
              opponentName: loserName
            }
          );

          console.log(`✅ Desafio ${challenge.id} atualizado - Vencedor: ${winnerId}`);
        }
      } else {
        // Se for empate, apenas atualizar os retornos
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { 
            challengerCurrentBalance: challengerCurrentBalance,
            challengedCurrentBalance: challengedCurrentBalance,
            challengerCurrentReturn: challengerReturn,
            challengedCurrentReturn: challengedReturn,
            challengerProfit: challengerProfit,
            challengedProfit: challengedProfit,
            challengerReturn: challengerReturn,
            challengedReturn: challengedReturn,
            updatedAt: new Date()
          }
        });

        console.log(`✅ Desafio ${challenge.id} atualizado - Empate confirmado`);
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar desafios concluídos sem vencedor:', error);
  }
};

// Função para expirar desafios pendentes que passaram do horário de início
const expirePendingChallenges = async (): Promise<void> => {
  try {
    const now = new Date();
    
    // Buscar desafios pendentes
    const pendingChallenges = await prisma.challenge.findMany({
      where: {
        status: 'pending'
      }
    });

    for (const challenge of pendingChallenges) {
      // Verificar se o horário de início já passou (em UTC; cliente envia data/hora em UTC)
      if (challenge.startDate && challenge.startTime) {
        const startDateTime = getStartDateTimeUtc(challenge.startDate, challenge.startTime);
        // Só cancelar se o início já passou há mais de 2 minutos (evita cancelar no mesmo dia por fuso)
        const graceMs = 2 * 60 * 1000;
        if (now.getTime() >= startDateTime.getTime() + graceMs) {
          // Devolver tokens ao desafiante
          await prisma.userChallengeStats.update({
            where: { userId: challenge.challengerId },
            data: { tokens: { increment: challenge.betAmount } }
          });

          // Registrar transação de reembolso
          await recordTokenTransaction(
            challenge.challengerId,
            'challenge_refund',
            challenge.betAmount,
            `Desafio "${challenge.title}" expirado - reembolso`,
            challenge.id,
            {
              challengeTitle: challenge.title,
              reason: 'Desafio não respondido antes do horário de início'
            }
          );

          // Marcar desafio como cancelado
          await prisma.challenge.update({
            where: { id: challenge.id },
            data: { 
              status: 'cancelled',
              updatedAt: new Date()
            }
          });

          console.log(`⏰ Desafio pendente ${challenge.id} expirado - tokens devolvidos ao desafiante`);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao expirar desafios pendentes:', error);
  }
};

// Função para atualizar status de desafios expirados
const updateExpiredChallenges = async (): Promise<void> => {
  try {
    const expiredChallenges = await prisma.challenge.findMany({
      where: {
        status: 'active',
        endDate: {
          lt: new Date()
        }
      }
    });

    for (const challenge of expiredChallenges) {
      if (isChallengeExpired(challenge.endDate, challenge.endTime, challenge.startDate, challenge.startTime)) {
        // Buscar todos os trades do desafio para calcular vencedor
        const trades = await prisma.challengeTrade.findMany({
          where: { challengeId: challenge.id }
        });

        // Calcular lucros de cada participante
        const challengerTrades = trades.filter(t => t.userId === challenge.challengerId);
        const challengedTrades = trades.filter(t => t.userId === challenge.challengedId);

        const challengerProfit = challengerTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
        const challengedProfit = challengedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);

        // Calcular retornos percentuais
        const challengerReturn = (challengerProfit / challenge.initialBalance) * 100;
        const challengedReturn = (challengedProfit / challenge.initialBalance) * 100;

        // Determinar vencedor baseado nos retornos
        let winnerId: string | null = null;
        let loserId: string | null = null;

        if (challengerReturn > challengedReturn) {
          winnerId = challenge.challengerId;
          loserId = challenge.challengedId;
        } else if (challengedReturn > challengerReturn) {
          winnerId = challenge.challengedId;
          loserId = challenge.challengerId;
        }
        // Se empate, winnerId e loserId ficam null

        // Atualizar saldos e retornos no desafio
        const challengerCurrentBalance = challenge.initialBalance + challengerProfit;
        const challengedCurrentBalance = challenge.initialBalance + challengedProfit;

        // Atualizar o desafio com status, vencedor e saldos
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { 
            status: 'completed',
            winnerId: winnerId,
            loserId: loserId,
            challengerCurrentBalance: challengerCurrentBalance,
            challengedCurrentBalance: challengedCurrentBalance,
            challengerCurrentReturn: challengerReturn,
            challengedCurrentReturn: challengedReturn,
            challengerProfit: challengerProfit,
            challengedProfit: challengedProfit,
            challengerReturn: challengerReturn,
            challengedReturn: challengedReturn,
            updatedAt: new Date()
          }
        });

        // Se houver vencedor, distribuir tokens
        if (winnerId && loserId) {
          // Adicionar tokens ao vencedor
          await prisma.userChallengeStats.update({
            where: { userId: winnerId },
            data: { 
              tokens: { increment: challenge.betAmount * 2 }, // Recebe sua aposta + aposta do perdedor
              totalWins: { increment: 1 }
            }
          });

          // Atualizar estatísticas do perdedor
          await prisma.userChallengeStats.update({
            where: { userId: loserId },
            data: { 
              totalLosses: { increment: 1 }
            }
          });

          // Registrar transações de tokens
          const winnerName = winnerId === challenge.challengerId ? 'Desafiante' : 'Desafiado';
          const loserName = loserId === challenge.challengerId ? 'Desafiante' : 'Desafiado';
          
          await recordTokenTransaction(
            winnerId,
            'challenge_won',
            challenge.betAmount * 2,
            `Vitória no desafio "${challenge.title}"`,
            challenge.id,
            {
              challengeTitle: challenge.title,
              opponentName: loserName
            }
          );
        } else {
          // Em caso de empate, devolver tokens aos participantes
          await prisma.userChallengeStats.update({
            where: { userId: challenge.challengerId },
            data: { tokens: { increment: challenge.betAmount } }
          });

          await prisma.userChallengeStats.update({
            where: { userId: challenge.challengedId },
            data: { tokens: { increment: challenge.betAmount } }
          });
        }

        console.log(`🕐 Desafio ${challenge.id} marcado como expirado${winnerId ? ` - Vencedor: ${winnerId}` : ' - Empate'}`);
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar desafios expirados:', error);
  }
};

// Buscar estatísticas de desafio de um usuário
export const getUserChallengeStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    let stats = await prisma.userChallengeStats.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    // Se não existir, criar estatísticas padrão
    if (!stats) {
      console.log(`🆕 Criando estatísticas padrão para usuário ${userId}`);
      
      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          foto: true
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Criar estatísticas padrão
      stats = await prisma.userChallengeStats.create({
        data: {
          userId,
          tokens: 1000,
          totalWins: 0,
          totalLosses: 0,
          winRate: 0,
          totalProfit: 0,
          totalChallenges: 0,
          activeChallenges: 0,
          rank: null,
          bestWinStreak: 0,
          currentStreak: 0,
          averageReturn: 0,
          bestReturn: 0,
          worstReturn: 0,
          autoAccept: false,
          minBetAmount: 10,
          maxBetAmount: 500
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              foto: true
            }
          }
        }
      });

      console.log(`✅ Estatísticas criadas para usuário ${user.name}`);
    }

    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Listar todos os usuários disponíveis para desafio
export const getAvailableUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentUserId, search } = req.query;
    
    // Construir filtros de busca
    const whereConditions: any = {
      userId: {
        not: currentUserId as string
      }
    };

    // Adicionar filtro de busca por nome se fornecido
    if (search) {
      whereConditions.user = {
        active: true,
        name: {
          contains: search as string,
          mode: 'insensitive' // Busca case-insensitive
        }
      };
    } else {
      whereConditions.user = {
        active: true
      };
    }

    // Primeiro, buscar usuários que já têm estatísticas
    let users = await prisma.userChallengeStats.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      },
      orderBy: [
        { rank: 'asc' },
        { winRate: 'desc' }
      ]
    });

    // Se não há usuários com estatísticas ou se há busca, buscar todos os usuários ativos
    if (users.length === 0 || search) {
      const allUsers = await prisma.user.findMany({
        where: {
          id: {
            not: currentUserId as string
          },
          active: true,
          ...(search && {
            name: {
              contains: search as string,
              mode: 'insensitive'
            }
          })
        },
        select: {
          id: true,
          name: true,
          email: true,
          foto: true
        },
        orderBy: {
          name: 'asc'
        }
      });

      // Para usuários sem estatísticas, criar dados padrão
      const usersWithoutStats = allUsers.filter(user => 
        !users.some(u => u.user.id === user.id)
      );

      const defaultStats = usersWithoutStats.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.foto || '/src/assets/images/avatar.jpg',
        tokens: 1000, // Valor padrão
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        totalProfit: 0,
        rank: 999, // Ranking baixo para novos usuários
        bestWinStreak: 0,
        currentStreak: 0,
        averageReturn: 0,
        bestReturn: 0,
        worstReturn: 0,
        totalChallenges: 0,
        activeChallenges: 0
      }));

      // Combinar usuários com e sem estatísticas
      const formattedUsersWithStats = users.map(stats => ({
        id: stats.user.id,
        name: stats.user.name,
        email: stats.user.email,
        avatar: stats.user.foto || '/src/assets/images/avatar.jpg',
        tokens: stats.tokens,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
        winRate: stats.winRate,
        totalProfit: stats.totalProfit,
        rank: stats.rank,
        bestWinStreak: stats.bestWinStreak,
        currentStreak: stats.currentStreak,
        averageReturn: stats.averageReturn,
        bestReturn: stats.bestReturn,
        worstReturn: stats.worstReturn,
        totalChallenges: stats.totalChallenges,
        activeChallenges: stats.activeChallenges
      }));

      const allFormattedUsers = [...formattedUsersWithStats, ...defaultStats];
      
      // Ordenar por nome se há busca, senão por ranking
      if (search) {
        allFormattedUsers.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        allFormattedUsers.sort((a, b) => (a.rank || 999) - (b.rank || 999));
      }

      res.json(allFormattedUsers);
    } else {
      // Formatar dados para o frontend (usuários com estatísticas)
      const formattedUsers = users.map(stats => ({
        id: stats.user.id,
        name: stats.user.name,
        email: stats.user.email,
        avatar: stats.user.foto || '/src/assets/images/avatar.jpg',
        tokens: stats.tokens,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
        winRate: stats.winRate,
        totalProfit: stats.totalProfit,
        rank: stats.rank,
        bestWinStreak: stats.bestWinStreak,
        currentStreak: stats.currentStreak,
        averageReturn: stats.averageReturn,
        bestReturn: stats.bestReturn,
        worstReturn: stats.worstReturn,
        totalChallenges: stats.totalChallenges,
        activeChallenges: stats.activeChallenges
      }));

      res.json(formattedUsers);
    }
  } catch (error) {
    console.error('Erro ao buscar usuários disponíveis:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Criar ou atualizar estatísticas de um usuário
export const createOrUpdateUserStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const statsData = req.body;

    const stats = await prisma.userChallengeStats.upsert({
      where: { userId },
      update: statsData,
      create: {
        userId,
        ...statsData
      }
    });

    res.json(stats);
  } catch (error) {
    console.error('Erro ao criar/atualizar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar ranking dos usuários
export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;

    const leaderboard = await prisma.userChallengeStats.findMany({
      where: {
        user: {
          active: true
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      },
      orderBy: [
        { tokens: 'desc' },
        { winRate: 'desc' },
        { totalWins: 'desc' }
      ],
      take: Number(limit)
    });

    const formattedLeaderboard = leaderboard.map((stats, index) => ({
      position: index + 1,
      id: stats.user.id,
      name: stats.user.name,
      avatar: stats.user.foto || '/src/assets/images/avatar.jpg',
      tokens: stats.tokens,
      totalWins: stats.totalWins,
      totalLosses: stats.totalLosses,
      winRate: stats.winRate,
      totalProfit: stats.totalProfit,
      rank: stats.rank,
      bestWinStreak: stats.bestWinStreak,
      currentStreak: stats.currentStreak,
      averageReturn: stats.averageReturn
    }));

    res.json(formattedLeaderboard);
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Atualizar tokens de um usuário (após desafio)
export const updateUserTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { tokens, totalWins, totalLosses, totalProfit } = req.body;

    const updatedStats = await prisma.userChallengeStats.update({
      where: { userId },
      data: {
        tokens,
        totalWins,
        totalLosses,
        totalProfit,
        winRate: totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0,
        totalChallenges: totalWins + totalLosses,
        updatedAt: new Date()
      }
    });

    res.json(updatedStats);
  } catch (error) {
    console.error('Erro ao atualizar tokens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar estatísticas resumidas de todos os usuários
export const getAllUsersStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await prisma.userChallengeStats.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      },
      orderBy: { tokens: 'desc' }
    });

    // Buscar dinheiro virtual (soma dos valores das carteiras virtuais) para cada usuário
    const formattedStats = await Promise.all(
      stats.map(async (stat) => {
        // Buscar todas as carteiras virtuais do usuário
        const virtualWallets = await prisma.wallet.findMany({
          where: {
            userId: stat.userId,
            type: 'virtual',
            isActive: true
          }
        });

        // Calcular o total de dinheiro virtual (soma dos valores)
        const virtualMoney = virtualWallets.reduce((sum, wallet) => sum + (wallet.value || 0), 0);

        return {
          id: stat.user.id,
          name: stat.user.name,
          email: stat.user.email,
          avatar: stat.user.foto || '/src/assets/images/avatar.jpg',
          tokens: stat.tokens,
          virtualMoney: virtualMoney, // Dinheiro virtual total
          totalWins: stat.totalWins,
          totalLosses: stat.totalLosses,
          winRate: stat.winRate,
          totalProfit: stat.totalProfit,
          rank: stat.rank,
          bestWinStreak: stat.bestWinStreak,
          currentStreak: stat.currentStreak,
          averageReturn: stat.averageReturn,
          totalChallenges: stat.totalChallenges,
          activeChallenges: stat.activeChallenges
        };
      })
    );

    res.json(formattedStats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas de todos os usuários:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Criar novo desafio
export const createChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      challengerId,
      challengedId,
      type,
      duration,
      betAmount,
      initialBalance,
      startTime,
      endTime,
      startDate,
      endDate,
      challengerBotId,
      challengedBotId
    } = req.body;

    // Verificar se os usuários existem
    const [challenger, challenged] = await Promise.all([
      prisma.user.findUnique({ where: { id: challengerId } }),
      prisma.user.findUnique({ where: { id: challengedId } })
    ]);

    if (!challenger || !challenged) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    // Verificar se o desafiante tem tokens suficientes
    const challengerStats = await prisma.userChallengeStats.findUnique({
      where: { userId: challengerId }
    });

    if (!challengerStats || challengerStats.tokens < betAmount) {
      res.status(400).json({ error: 'Tokens insuficientes para criar o desafio' });
      return;
    }

    // Verificar se o desafiado tem tokens suficientes
    const challengedStats = await prisma.userChallengeStats.findUnique({
      where: { userId: challengedId }
    });

    if (!challengedStats || challengedStats.tokens < betAmount) {
      res.status(400).json({ error: 'O usuário desafiado não tem tokens suficientes para aceitar o desafio' });
      return;
    }

    // Criar o desafio
    const challenge = await prisma.challenge.create({
      data: {
        title,
        description,
        challengerId,
        challengedId,
        type,
        status: 'pending',
        duration,
        betAmount,
        initialBalance,
        startTime,
        endTime,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        challengerCurrentBalance: initialBalance,
        challengedCurrentBalance: initialBalance,
        challengerBotId: challengerBotId || null,
        challengedBotId: challengedBotId || null
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    // Deduzir tokens do desafiante
    const updatedChallengerStats = await prisma.userChallengeStats.update({
      where: { userId: challengerId },
      data: { tokens: { decrement: betAmount } }
    });

    // Registrar transação
    await recordTokenTransaction(
      challengerId,
      'challenge_created',
      -betAmount,
      `Aposta criada no desafio "${challenge.title}"`,
      challenge.id,
      {
        challengeTitle: challenge.title,
        opponentName: challenged.name,
        betAmount
      }
    );

    // Formatar resposta
    const formattedChallenge = {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      challenger: {
        id: challenge.challenger.id,
        name: challenge.challenger.name,
        email: challenge.challenger.email,
        avatar: challenge.challenger.foto || '/src/assets/images/avatar.jpg',
        tokens: challengerStats.tokens - betAmount,
        totalWins: challengerStats.totalWins,
        totalLosses: challengerStats.totalLosses,
        winRate: challengerStats.winRate,
        totalProfit: challengerStats.totalProfit
      },
      challenged: {
        id: challenge.challenged.id,
        name: challenge.challenged.name,
        email: challenge.challenged.email,
        avatar: challenge.challenged.foto || '/src/assets/images/avatar.jpg',
        tokens: 0, // Será carregado se necessário
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        totalProfit: 0
      },
      type: challenge.type,
      status: challenge.status,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      startTime: challenge.startTime,
      endTime: challenge.endTime,
      duration: challenge.duration,
      betAmount: challenge.betAmount,
      initialBalance: challenge.initialBalance,
      challengerBotId: challenge.challengerBotId,
      challengedBotId: challenge.challengedBotId,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt
    };

    res.status(201).json(formattedChallenge);
  } catch (error) {
    console.error('Erro ao criar desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Buscar desafios do usuário
export const getUserChallenges = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Primeiro, expirar desafios pendentes que passaram do horário de início
    await expirePendingChallenges();
    
    // Verificar e ativar desafios que estão aguardando início
    await checkAndActivateWaitingChallenges();
    
    // Atualizar desafios concluídos que não têm vencedor definido
    await updateCompletedChallengesWithoutWinner();

    const challenges = await prisma.challenge.findMany({
      where: {
        OR: [
          { challengerId: userId },
          { challengedId: userId }
        ]
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Carregar estatísticas dos usuários
    const formattedChallenges = await Promise.all(
      challenges.map(async (challenge) => {
        const [challengerStats, challengedStats] = await Promise.all([
          prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengerId } }),
          prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengedId } })
        ]);

        return {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          challenger: {
            id: challenge.challenger.id,
            name: challenge.challenger.name,
            email: challenge.challenger.email,
            avatar: challenge.challenger.foto || '/src/assets/images/avatar.jpg',
            tokens: challengerStats?.tokens || 0,
            totalWins: challengerStats?.totalWins || 0,
            totalLosses: challengerStats?.totalLosses || 0,
            winRate: challengerStats?.winRate || 0,
            totalProfit: challengerStats?.totalProfit || 0
          },
          challenged: {
            id: challenge.challenged.id,
            name: challenge.challenged.name,
            email: challenge.challenged.email,
            avatar: challenge.challenged.foto || '/src/assets/images/avatar.jpg',
            tokens: challengedStats?.tokens || 0,
            totalWins: challengedStats?.totalWins || 0,
            totalLosses: challengedStats?.totalLosses || 0,
            winRate: challengedStats?.winRate || 0,
            totalProfit: challengedStats?.totalProfit || 0
          },
          type: challenge.type,
          status: (() => {
            // Verificar se o desafio expirou em tempo real
            if (challenge.status === 'active' && isChallengeExpired(challenge.endDate, challenge.endTime, challenge.startDate, challenge.startTime)) {
              // Atualizar o status no banco de dados
              prisma.challenge.update({
                where: { id: challenge.id },
                data: { 
                  status: 'completed',
                  updatedAt: new Date()
                }
              }).catch(console.error);
              return 'completed';
            }
            return challenge.status;
          })(),
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          startTime: challenge.startTime,
          endTime: challenge.endTime,
          duration: challenge.duration,
          betAmount: challenge.betAmount,
          initialBalance: challenge.initialBalance,
          challengerCurrentBalance: challenge.challengerCurrentBalance,
          challengedCurrentBalance: challenge.challengedCurrentBalance,
          challengerCurrentReturn: challenge.challengerCurrentReturn,
          challengedCurrentReturn: challenge.challengedCurrentReturn,
          challengerBotId: challenge.challengerBotId,
          challengedBotId: challenge.challengedBotId,
          createdAt: challenge.createdAt,
          updatedAt: challenge.updatedAt
        };
      })
    );

    res.json(formattedChallenges);
  } catch (error) {
    console.error('Erro ao buscar desafios do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Buscar desafios ativos
export const getActiveChallenges = async (req: Request, res: Response): Promise<void> => {
  try {
    // Primeiro, expirar desafios pendentes que passaram do horário de início
    await expirePendingChallenges();
    
    // Atualizar desafios expirados
    await updateExpiredChallenges();
    
    const challenges = await prisma.challenge.findMany({
      where: {
        status: 'active'
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Carregar estatísticas dos usuários
    const formattedChallenges = await Promise.all(
      challenges.map(async (challenge) => {
        const [challengerStats, challengedStats] = await Promise.all([
          prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengerId } }),
          prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengedId } })
        ]);

        return {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          challenger: {
            id: challenge.challenger.id,
            name: challenge.challenger.name,
            email: challenge.challenger.email,
            avatar: challenge.challenger.foto || '/src/assets/images/avatar.jpg',
            tokens: challengerStats?.tokens || 0,
            totalWins: challengerStats?.totalWins || 0,
            totalLosses: challengerStats?.totalLosses || 0,
            winRate: challengerStats?.winRate || 0,
            totalProfit: challengerStats?.totalProfit || 0
          },
          challenged: {
            id: challenge.challenged.id,
            name: challenge.challenged.name,
            email: challenge.challenged.email,
            avatar: challenge.challenged.foto || '/src/assets/images/avatar.jpg',
            tokens: challengedStats?.tokens || 0,
            totalWins: challengedStats?.totalWins || 0,
            totalLosses: challengedStats?.totalLosses || 0,
            winRate: challengedStats?.winRate || 0,
            totalProfit: challengedStats?.totalProfit || 0
          },
          type: challenge.type,
          status: (() => {
            // Verificar se o desafio expirou em tempo real
            if (challenge.status === 'active' && isChallengeExpired(challenge.endDate, challenge.endTime, challenge.startDate, challenge.startTime)) {
              // Atualizar o status no banco de dados
              prisma.challenge.update({
                where: { id: challenge.id },
                data: { 
                  status: 'completed',
                  updatedAt: new Date()
                }
              }).catch(console.error);
              return 'completed';
            }
            return challenge.status;
          })(),
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          startTime: challenge.startTime,
          endTime: challenge.endTime,
          duration: challenge.duration,
          betAmount: challenge.betAmount,
          initialBalance: challenge.initialBalance,
          challengerCurrentBalance: challenge.challengerCurrentBalance,
          challengedCurrentBalance: challenge.challengedCurrentBalance,
          challengerCurrentReturn: challenge.challengerCurrentReturn,
          challengedCurrentReturn: challenge.challengedCurrentReturn,
          challengerBotId: challenge.challengerBotId,
          challengedBotId: challenge.challengedBotId,
          createdAt: challenge.createdAt,
          updatedAt: challenge.updatedAt
        };
      })
    );

    res.json(formattedChallenges);
  } catch (error) {
    console.error('Erro ao buscar desafios ativos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Responder a um desafio
export const respondToChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;
    const { accept } = req.body;

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: true,
        challenged: true
      }
    });

    if (!challenge) {
      res.status(404).json({ error: 'Desafio não encontrado' });
      return;
    }

    if (challenge.status !== 'pending') {
      res.status(400).json({ error: 'Desafio não está pendente' });
      return;
    }

    // Se o desafio foi rejeitado
    if (!accept) {
      console.log(`❌ Desafiado rejeitando desafio - Devolvendo ${challenge.betAmount} tokens ao desafiante`);
      
      // Devolver tokens ao desafiante
      const updatedStats = await prisma.userChallengeStats.update({
        where: { userId: challenge.challengerId },
        data: { tokens: { increment: challenge.betAmount } }
      });

      // Registrar transação
      await recordTokenTransaction(
        challenge.challengerId,
        'challenge_refund',
        challenge.betAmount,
        `Desafio "${challenge.title}" rejeitado - Tokens devolvidos`,
        challenge.id,
        {
          challengeTitle: challenge.title,
          opponentName: challenge.challenged.name,
          betAmount: challenge.betAmount
        }
      );

      // Marcar desafio como cancelado
      const updatedChallenge = await prisma.challenge.update({
        where: { id: challengeId },
        data: { 
          status: 'cancelled'
        },
        include: {
          challenger: {
            select: {
              id: true,
              name: true,
              email: true,
              foto: true
            }
          },
          challenged: {
            select: {
              id: true,
              name: true,
              email: true,
              foto: true
            }
          },
          winner: {
            select: {
              id: true,
              name: true,
              email: true,
              foto: true
            }
          },
          loser: {
            select: {
              id: true,
              name: true,
              email: true,
              foto: true
            }
          }
        }
      });

      console.log(`✅ Desafio rejeitado e cancelado - Tokens devolvidos ao desafiante`);

      // Formatar resposta
      const formattedChallenge = {
        id: updatedChallenge.id,
        title: updatedChallenge.title,
        description: updatedChallenge.description,
        type: updatedChallenge.type,
        status: updatedChallenge.status,
        duration: updatedChallenge.duration,
        betAmount: updatedChallenge.betAmount,
        initialBalance: updatedChallenge.initialBalance,
        startDate: updatedChallenge.startDate,
        endDate: updatedChallenge.endDate,
        startTime: updatedChallenge.startTime,
        endTime: updatedChallenge.endTime,
        challenger: updatedChallenge.challenger,
        challenged: updatedChallenge.challenged,
        challengerCurrentBalance: updatedChallenge.challengerCurrentBalance,
        challengedCurrentBalance: updatedChallenge.challengedCurrentBalance,
        challengerCurrentReturn: updatedChallenge.challengerCurrentReturn,
        challengedCurrentReturn: updatedChallenge.challengedCurrentReturn,
        challengerProfit: updatedChallenge.challengerProfit,
        challengedProfit: updatedChallenge.challengedProfit,
        challengerReturn: updatedChallenge.challengerReturn,
        challengedReturn: updatedChallenge.challengedReturn,
        winner: updatedChallenge.winner,
        loser: updatedChallenge.loser,
        challengerBotId: updatedChallenge.challengerBotId,
        challengedBotId: updatedChallenge.challengedBotId
      };

      res.json(formattedChallenge);
      return;
    }

    // Se o desafio foi aceito, continuar com a lógica de aceitação
    // Verificar se o desafio já expirou antes de aceitar
    {
      const now = new Date();
      
      // Para duelos de robôs, verificar se já passou do horário de fim
      if (challenge.type === 'bot_duel') {
        const [eH, eM] = challenge.endTime.split(":" ).map(Number);
        
        // Usar a data local para evitar problemas de fuso horário
        const endDateStr = challenge.endDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const [year, month, day] = endDateStr.split('-').map(Number);
        
        const endDT = new Date(year, month - 1, day, eH, eM, 0, 0);
        
        // Adicionar buffer de 1 minuto para evitar expiração prematura
        const bufferTime = 60 * 1000; // 1 minuto
        const endDTWithBuffer = new Date(endDT.getTime() + bufferTime);
        
        
        if (now > endDTWithBuffer) {
          res.status(400).json({ error: 'Este desafio expirou e não pode mais ser aceito' });
          return;
        }
      }
    }

    // Verificar se o desafiado tem tokens suficientes
    const challengedStats = await prisma.userChallengeStats.findUnique({
      where: { userId: challenge.challengedId }
    });

    if (!challengedStats || challengedStats.tokens < challenge.betAmount) {
      res.status(400).json({ error: 'Tokens insuficientes para aceitar o desafio' });
      return;
    }

    console.log(`💰 Desafiado aceitando desafio - Deduzindo ${challenge.betAmount} tokens`);

    let newStatus: string;
    let startDate: Date;
    let endDate: Date;

    if (challenge.type === 'manual_trading') {
      // Para trading manual: começar imediatamente
      const now = new Date();
      startDate = now;
      
      // Calcular data de fim baseada na duração
      const durationInMs = challenge.duration * 24 * 60 * 60 * 1000; // duração em dias para ms
      endDate = new Date(now.getTime() + durationInMs);
      
      newStatus = 'active';
      
      console.log(`🎯 Trading Manual - Iniciando imediatamente`);
      console.log(`⏰ Início: ${startDate.toISOString()}`);
      console.log(`⏰ Fim: ${endDate.toISOString()}`);
    } else {
      // Para duelo de robôs: verificar se já chegou o horário de início (UTC)
      const now = new Date();
      const startDateTime = getStartDateTimeUtc(challenge.startDate, challenge.startTime);
      
      // Verificar se o desafio já expirou mesmo antes de começar
      if (isChallengeExpired(challenge.endDate, challenge.endTime, challenge.startDate, challenge.startTime)) {
        res.status(400).json({ error: 'Este desafio expirou e não pode mais ser aceito' });
        return;
      }
      
      const isStartTimeReached = now.getTime() >= startDateTime.getTime();
      newStatus = isStartTimeReached ? 'active' : 'waiting_start';
      
      startDate = new Date(challenge.startDate);
      endDate = new Date(challenge.endDate);

      console.log(`🤖 Duelo de Robôs - Verificando horário de início`);
      console.log(`⏰ Horário atual: ${now.toISOString()}`);
      console.log(`⏰ Horário de início: ${startDateTime.toISOString()}`);
      console.log(`📊 Status definido: ${newStatus}`);
    }

    // Atualizar status e deduzir tokens
    const updatedChallenge = await prisma.challenge.update({
      where: { id: challengeId },
      data: { 
        status: newStatus,
        startDate: startDate,
        endDate: endDate
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        winner: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        loser: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    const updatedChallengedStats = await prisma.userChallengeStats.update({
      where: { userId: challenge.challengedId },
      data: { tokens: { decrement: challenge.betAmount } }
    });

    // Registrar transação
    await recordTokenTransaction(
      challenge.challengedId,
      'challenge_accepted',
      -challenge.betAmount,
      `Aposta aceita no desafio "${challenge.title}"`,
      challenge.id,
      {
        challengeTitle: challenge.title,
        opponentName: challenge.challenger.name,
        betAmount: challenge.betAmount
      }
    );

    console.log(`✅ Desafio ${newStatus === 'active' ? 'ativado' : 'aguardando início'} - Tokens deduzidos do desafiado`);

    // Formatar resposta
    const formattedChallenge = {
      id: updatedChallenge.id,
      title: updatedChallenge.title,
      description: updatedChallenge.description,
      type: updatedChallenge.type,
      status: updatedChallenge.status,
      duration: updatedChallenge.duration,
      betAmount: updatedChallenge.betAmount,
      initialBalance: updatedChallenge.initialBalance,
      startDate: updatedChallenge.startDate,
      endDate: updatedChallenge.endDate,
      startTime: updatedChallenge.startTime,
      endTime: updatedChallenge.endTime,
      challenger: updatedChallenge.challenger,
      challenged: updatedChallenge.challenged,
      challengerCurrentBalance: updatedChallenge.challengerCurrentBalance,
      challengedCurrentBalance: updatedChallenge.challengedCurrentBalance,
      challengerCurrentReturn: updatedChallenge.challengerCurrentReturn,
      challengedCurrentReturn: updatedChallenge.challengedCurrentReturn,
      challengerProfit: updatedChallenge.challengerProfit,
      challengedProfit: updatedChallenge.challengedProfit,
      challengerReturn: updatedChallenge.challengerReturn,
      challengedReturn: updatedChallenge.challengedReturn,
      winner: updatedChallenge.winner,
      loser: updatedChallenge.loser,
      challengerBotId: updatedChallenge.challengerBotId,
      challengedBotId: updatedChallenge.challengedBotId
    };

    res.json(formattedChallenge);
  } catch (error) {
    console.error('Erro ao responder ao desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Cancelar desafio
export const cancelChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;
    const { userId } = req.body;

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId }
    });

    if (!challenge) {
      res.status(404).json({ error: 'Desafio não encontrado' });
      return;
    }

    if (challenge.challengerId !== userId) {
      res.status(403).json({ error: 'Apenas o desafiante pode cancelar o desafio' });
      return;
    }

    if (challenge.status !== 'pending') {
      res.status(400).json({ error: 'Apenas desafios pendentes podem ser cancelados' });
      return;
    }

    // Cancelar desafio e devolver tokens
    await Promise.all([
      prisma.challenge.update({
        where: { id: challengeId },
        data: { status: 'cancelled' }
      }),
      prisma.userChallengeStats.update({
        where: { userId: challenge.challengerId },
        data: { tokens: { increment: challenge.betAmount } }
      })
    ]);

    // Retornar desafio atualizado
    const updatedChallenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    if (updatedChallenge) {
      const [challengerStats, challengedStats] = await Promise.all([
        prisma.userChallengeStats.findUnique({ where: { userId: updatedChallenge.challengerId } }),
        prisma.userChallengeStats.findUnique({ where: { userId: updatedChallenge.challengedId } })
      ]);

      const formattedChallenge = {
        id: updatedChallenge.id,
        title: updatedChallenge.title,
        description: updatedChallenge.description,
        challenger: {
          id: updatedChallenge.challenger.id,
          name: updatedChallenge.challenger.name,
          email: updatedChallenge.challenger.email,
          avatar: updatedChallenge.challenger.foto || '/src/assets/images/avatar.jpg',
          tokens: challengerStats?.tokens || 0,
          totalWins: challengerStats?.totalWins || 0,
          totalLosses: challengerStats?.totalLosses || 0,
          winRate: challengerStats?.winRate || 0,
          totalProfit: challengerStats?.totalProfit || 0
        },
        challenged: {
          id: updatedChallenge.challenged.id,
          name: updatedChallenge.challenged.name,
          email: updatedChallenge.challenged.email,
          avatar: updatedChallenge.challenged.foto || '/src/assets/images/avatar.jpg',
          tokens: challengedStats?.tokens || 0,
          totalWins: challengedStats?.totalWins || 0,
          totalLosses: challengedStats?.totalLosses || 0,
          winRate: challengedStats?.winRate || 0,
          totalProfit: challengedStats?.totalProfit || 0
        },
        type: updatedChallenge.type,
        status: updatedChallenge.status,
        startDate: updatedChallenge.startDate,
        endDate: updatedChallenge.endDate,
        startTime: updatedChallenge.startTime,
        endTime: updatedChallenge.endTime,
        duration: updatedChallenge.duration,
        betAmount: updatedChallenge.betAmount,
        initialBalance: updatedChallenge.initialBalance,
        challengerCurrentBalance: updatedChallenge.challengerCurrentBalance,
        challengedCurrentBalance: updatedChallenge.challengedCurrentBalance,
        challengerCurrentReturn: updatedChallenge.challengerCurrentReturn,
        challengedCurrentReturn: updatedChallenge.challengedCurrentReturn,
        createdAt: updatedChallenge.createdAt,
        updatedAt: updatedChallenge.updatedAt
      };

      res.json(formattedChallenge);
    } else {
      res.status(404).json({ error: 'Desafio não encontrado após cancelamento' });
    }
  } catch (error) {
    console.error('Erro ao cancelar desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Adicionar trade manual ao desafio
export const addManualTrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;
    const { userId, trade } = req.body;

    console.log('addManualTrade - challengeId:', challengeId);
    console.log('addManualTrade - userId:', userId);
    console.log('addManualTrade - trade:', trade);

    // Validar dados do trade
    if (!trade || !trade.symbol || !trade.side || !trade.quantity || !trade.price) {
      console.log('Validação falhou - dados incompletos:', { trade });
      res.status(400).json({ error: 'Dados do trade incompletos. Necessário: symbol, side, quantity, price' });
      return;
    }

    // Validar tipos e valores
    if (typeof trade.quantity !== 'number' || trade.quantity <= 0) {
      console.log('Validação falhou - quantidade inválida:', trade.quantity);
      res.status(400).json({ error: 'Quantidade deve ser um número positivo' });
      return;
    }

    if (typeof trade.price !== 'number' || trade.price <= 0) {
      console.log('Validação falhou - preço inválido:', trade.price);
      res.status(400).json({ error: 'Preço deve ser um número positivo' });
      return;
    }

    if (!['buy', 'sell'].includes(trade.side)) {
      console.log('Validação falhou - side inválido:', trade.side);
      res.status(400).json({ error: 'Side deve ser "buy" ou "sell"' });
      return;
    }

    // Verificar se o desafio existe e está ativo
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId }
    });

    if (!challenge) {
      res.status(404).json({ error: 'Desafio não encontrado' });
      return;
    }

    if (challenge.status !== 'active') {
      res.status(400).json({ error: 'Desafio não está ativo' });
      return;
    }

    // Verificar se o usuário é participante do desafio
    if (challenge.challengerId !== userId && challenge.challengedId !== userId) {
      res.status(403).json({ error: 'Usuário não é participante deste desafio' });
      return;
    }

    // Calcular o resultado do trade
    const tradeValue = trade.quantity * trade.price;
    const isChallenger = challenge.challengerId === userId;
    
    // Simular resultado do trade (ganho ou perda de 1-5%)
    const tradeResult = Math.random() * 0.1 - 0.05; // -5% a +5%
    const profitLoss = tradeValue * tradeResult;

    // Verificar se já existe um trade similar para evitar duplicatas
    const existingTrade = await prisma.challengeTrade.findFirst({
      where: {
        challengeId,
        userId,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        timestamp: new Date(trade.timestamp)
      }
    });

    if (existingTrade) {
      res.status(400).json({ error: 'Trade similar já existe para este desafio' });
      return;
    }

    // Atualizar saldo do usuário no desafio
    const currentBalance = isChallenger ? challenge.challengerCurrentBalance : challenge.challengedCurrentBalance;
    const newBalance = (currentBalance || challenge.initialBalance) + profitLoss;
    const newReturn = ((newBalance - challenge.initialBalance) / challenge.initialBalance) * 100;

    // Salvar o trade
    await prisma.challengeTrade.create({
      data: {
        challengeId,
        userId,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        timestamp: new Date(trade.timestamp),
        profit: profitLoss
      }
    });

    // Atualizar saldo no desafio
    if (isChallenger) {
      await prisma.challenge.update({
        where: { id: challengeId },
        data: {
          challengerCurrentBalance: newBalance,
          challengerCurrentReturn: newReturn
        }
      });
    } else {
      await prisma.challenge.update({
        where: { id: challengeId },
        data: {
          challengedCurrentBalance: newBalance,
          challengedCurrentReturn: newReturn
        }
      });
    }

    // Retornar desafio atualizado
    const updatedChallenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    if (updatedChallenge) {
      const [challengerStats, challengedStats] = await Promise.all([
        prisma.userChallengeStats.findUnique({ where: { userId: updatedChallenge.challengerId } }),
        prisma.userChallengeStats.findUnique({ where: { userId: updatedChallenge.challengedId } })
      ]);

      const formattedChallenge = {
        id: updatedChallenge.id,
        title: updatedChallenge.title,
        description: updatedChallenge.description,
        challenger: {
          id: updatedChallenge.challenger.id,
          name: updatedChallenge.challenger.name,
          email: updatedChallenge.challenger.email,
          avatar: updatedChallenge.challenger.foto || '/src/assets/images/avatar.jpg',
          tokens: challengerStats?.tokens || 0,
          totalWins: challengerStats?.totalWins || 0,
          totalLosses: challengerStats?.totalLosses || 0,
          winRate: challengerStats?.winRate || 0,
          totalProfit: challengerStats?.totalProfit || 0
        },
        challenged: {
          id: updatedChallenge.challenged.id,
          name: updatedChallenge.challenged.name,
          email: updatedChallenge.challenged.email,
          avatar: updatedChallenge.challenged.foto || '/src/assets/images/avatar.jpg',
          tokens: challengedStats?.tokens || 0,
          totalWins: challengedStats?.totalWins || 0,
          totalLosses: challengedStats?.totalLosses || 0,
          winRate: challengedStats?.winRate || 0,
          totalProfit: challengedStats?.totalProfit || 0
        },
        type: updatedChallenge.type,
        status: updatedChallenge.status,
        startDate: updatedChallenge.startDate,
        endDate: updatedChallenge.endDate,
        startTime: updatedChallenge.startTime,
        endTime: updatedChallenge.endTime,
        duration: updatedChallenge.duration,
        betAmount: updatedChallenge.betAmount,
        initialBalance: updatedChallenge.initialBalance,
        challengerCurrentBalance: updatedChallenge.challengerCurrentBalance,
        challengedCurrentBalance: updatedChallenge.challengedCurrentBalance,
        challengerCurrentReturn: updatedChallenge.challengerCurrentReturn,
        challengedCurrentReturn: updatedChallenge.challengedCurrentReturn,
        createdAt: updatedChallenge.createdAt,
        updatedAt: updatedChallenge.updatedAt
      };

      res.json(formattedChallenge);
    } else {
      res.status(404).json({ error: 'Desafio não encontrado após atualização' });
    }
  } catch (error) {
    console.error('Erro ao adicionar trade:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
};

// Buscar trades de um desafio
export const getChallengeTrades = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;

    const trades = await prisma.challengeTrade.findMany({
      where: { challengeId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Filtrar trades de exemplo/simulados criados por scripts de teste
    // Trades criados pelo script simulateTrade.ts têm características específicas:
    // - price: exatamente 50000
    // - quantity: exatamente 0.001
    // - symbol: 'BTCUSDT'
    // - profit: valor aleatório entre -50 e 50
    // 
    // NOTA: A melhor solução seria adicionar um campo 'isSimulated' ou 'source' 
    // no schema do banco para identificar a origem do trade, mas por enquanto
    // vamos filtrar por características conhecidas de trades de teste.
    const filteredTrades = trades.filter(trade => {
      // Verificar se é um trade suspeito de ser do script de teste
      const isTestScriptTrade = 
        trade.price === 50000 &&
        trade.quantity === 0.001 &&
        trade.symbol === 'BTCUSDT';
      
      if (isTestScriptTrade) {
        // Filtrar este trade (é do script de teste)
        return false;
      }
      
      // Manter todos os outros trades (criados pelos usuários ou pelo sistema de duelos)
      return true;
    });

    const formattedTrades = filteredTrades.map(trade => ({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      timestamp: trade.timestamp,
      profit: trade.profit,
      user: {
        id: trade.user.id,
        name: trade.user.name,
        email: trade.user.email
      }
    }));

    res.json(formattedTrades);
  } catch (error) {
    console.error('Erro ao buscar trades do desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Finalizar desafio e calcular vencedor
export const finalizeChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Buscar o desafio
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    if (!challenge) {
      res.status(404).json({ error: 'Desafio não encontrado' });
      return;
    }

    // Verificar se o usuário é participante do desafio
    if (challenge.challengerId !== userId && challenge.challengedId !== userId) {
      res.status(403).json({ error: 'Você não é participante deste desafio' });
      return;
    }

    // Verificar se o desafio está ativo
    if (challenge.status !== 'active') {
      res.status(400).json({ error: 'Desafio não está ativo' });
      return;
    }

    // Verificar se ainda há tempo restante
    const now = new Date();
    const [hours, minutes] = challenge.endTime.split(':').map(Number);
    const endDateTime = new Date(challenge.endDate);
    endDateTime.setHours(hours, minutes, 0, 0);
    
    const timeRemaining = endDateTime.getTime() - now.getTime();
    const isEarlyFinish = timeRemaining > 0;

    console.log(`🏁 Finalizando desafio ${challengeId}...`);
    if (isEarlyFinish) {
      console.log(`⚠️ Finalização antecipada! Quem finalizou perderá automaticamente.`);
    }

    // Buscar todos os trades do desafio
    const trades = await prisma.challengeTrade.findMany({
      where: { challengeId },
      include: {
        user: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`📊 Encontrados ${trades.length} trades no desafio`);

    // Calcular lucros de cada participante
    const challengerTrades = trades.filter(t => t.userId === challenge.challengerId);
    const challengedTrades = trades.filter(t => t.userId === challenge.challengedId);

    const challengerProfit = challengerTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
    const challengedProfit = challengedTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);

    // Calcular retornos percentuais
    const challengerReturn = (challengerProfit / challenge.initialBalance) * 100;
    const challengedReturn = (challengedProfit / challenge.initialBalance) * 100;

    // Determinar vencedor
    let winnerId: string | null = null;
    let loserId: string | null = null;

    // Se foi finalização antecipada, quem finalizou perde automaticamente
    if (isEarlyFinish) {
      if (userId === challenge.challengerId) {
        winnerId = challenge.challengedId;
        loserId = challenge.challengerId;
        console.log(`🏆 Vencedor: Desafiado (finalização antecipada pelo desafiante)`);
      } else {
        winnerId = challenge.challengerId;
        loserId = challenge.challengedId;
        console.log(`🏆 Vencedor: Desafiante (finalização antecipada pelo desafiado)`);
      }
    } else {
      // Finalização no tempo normal - comparar retornos
      if (challengerReturn > challengedReturn) {
        winnerId = challenge.challengerId;
        loserId = challenge.challengedId;
      } else if (challengedReturn > challengerReturn) {
        winnerId = challenge.challengedId;
        loserId = challenge.challengerId;
      }
      // Se empate, winnerId e loserId ficam null
    }
    
    console.log(`🏆 Resultados: Desafiante: ${challengerReturn.toFixed(2)}% | Desafiado: ${challengedReturn.toFixed(2)}%`);
    
    if (winnerId) {
      const winnerName = winnerId === challenge.challengerId ? 'Desafiante' : 'Desafiado';
      const reason = isEarlyFinish ? ' (finalização antecipada)' : '';
      console.log(`🎯 Vencedor: ${winnerName}${reason}`);
      console.log(`💰 Distribuindo ${challenge.betAmount} tokens do perdedor para o vencedor`);
    } else {
      console.log(`🤝 Desafio empatado - Devolvendo tokens aos participantes`);
    }

    // Atualizar o desafio
    const updatedChallenge = await prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: 'completed',
        winnerId,
        loserId,
        challengerProfit,
        challengedProfit,
        challengerCurrentReturn: challengerReturn,
        challengedCurrentReturn: challengedReturn,
        updatedAt: new Date()
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        winner: winnerId ? {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        } : false
      }
    });

    // Atualizar estatísticas dos participantes
    const [updatedChallengerStats, updatedChallengedStats] = await Promise.all([
      // Atualizar estatísticas do desafiante
      prisma.userChallengeStats.upsert({
        where: { userId: challenge.challengerId },
        update: {
          totalChallenges: { increment: 1 },
          totalWins: winnerId === challenge.challengerId ? { increment: 1 } : undefined,
          totalLosses: loserId === challenge.challengerId ? { increment: 1 } : undefined,
          totalProfit: { increment: challengerProfit },
          winRate: winnerId === challenge.challengerId ? undefined : undefined, // Será recalculado
          tokens: winnerId === challenge.challengerId ? { increment: challenge.betAmount } : { decrement: challenge.betAmount }
        },
        create: {
          userId: challenge.challengerId,
          tokens: winnerId === challenge.challengerId ? 1000 + challenge.betAmount : 1000 - challenge.betAmount,
          totalWins: winnerId === challenge.challengerId ? 1 : 0,
          totalLosses: loserId === challenge.challengerId ? 1 : 0,
          totalChallenges: 1,
          totalProfit: challengerProfit,
          winRate: winnerId === challenge.challengerId ? 100 : 0
        }
      }),
      // Atualizar estatísticas do desafiado
      prisma.userChallengeStats.upsert({
        where: { userId: challenge.challengedId },
        update: {
          totalChallenges: { increment: 1 },
          totalWins: winnerId === challenge.challengedId ? { increment: 1 } : undefined,
          totalLosses: loserId === challenge.challengedId ? { increment: 1 } : undefined,
          totalProfit: { increment: challengedProfit },
          tokens: winnerId === challenge.challengedId ? { increment: challenge.betAmount } : { decrement: challenge.betAmount }
        },
        create: {
          userId: challenge.challengedId,
          tokens: winnerId === challenge.challengedId ? 1000 + challenge.betAmount : 1000 - challenge.betAmount,
          totalWins: winnerId === challenge.challengedId ? 1 : 0,
          totalLosses: loserId === challenge.challengedId ? 1 : 0,
          totalChallenges: 1,
          totalProfit: challengedProfit,
          winRate: winnerId === challenge.challengedId ? 100 : 0
        }
      })
    ]);

    // Registrar transações de tokens
    if (!winnerId) {
      // Empate - devolver tokens
      console.log('🤝 Desafio empatado - devolvendo tokens aos participantes');
      await Promise.all([
        recordTokenTransaction(
          challenge.challengerId,
          'challenge_refund',
          challenge.betAmount,
          `Desafio "${challenge.title}" empatado - Tokens devolvidos`,
          challenge.id,
          {
            challengeTitle: challenge.title,
            opponentName: challenge.challenged.name,
            betAmount: challenge.betAmount,
            result: 'draw'
          }
        ),
        recordTokenTransaction(
          challenge.challengedId,
          'challenge_refund',
          challenge.betAmount,
          `Desafio "${challenge.title}" empatado - Tokens devolvidos`,
          challenge.id,
          {
            challengeTitle: challenge.title,
            opponentName: challenge.challenger.name,
            betAmount: challenge.betAmount,
            result: 'draw'
          }
        )
      ]);
      console.log(`✅ ${challenge.betAmount} tokens devolvidos ao desafiante e ao desafiado`);
    } else if (winnerId && loserId) {
      // Vencedor ganha tokens, perdedor perde tokens
      const winnerName = winnerId === challenge.challengerId ? challenge.challenger.name : challenge.challenged.name;
      const loserName = loserId === challenge.challengerId ? challenge.challenger.name : challenge.challenged.name;
      
      await Promise.all([
        recordTokenTransaction(
          winnerId,
          'challenge_won',
          challenge.betAmount,
          `Vitória no desafio "${challenge.title}" - Ganhou ${challenge.betAmount} tokens`,
          challenge.id,
          {
            challengeTitle: challenge.title,
            opponentName: loserName,
            betAmount: challenge.betAmount,
            result: 'win',
            profit: winnerId === challenge.challengerId ? challengerProfit : challengedProfit
          }
        ),
        recordTokenTransaction(
          loserId,
          'challenge_lost',
          -challenge.betAmount,
          `Derrota no desafio "${challenge.title}" - Perdeu ${challenge.betAmount} tokens`,
          challenge.id,
          {
            challengeTitle: challenge.title,
            opponentName: winnerName,
            betAmount: challenge.betAmount,
            result: 'loss',
            loss: loserId === challenge.challengerId ? challengerProfit : challengedProfit
          }
        )
      ]);
      console.log(`✅ ${challenge.betAmount} tokens transferidos do perdedor para o vencedor`);
    }

    // Recalcular win rates
    const [challengerStats, challengedStats] = await Promise.all([
      prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengerId } }),
      prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengedId } })
    ]);

    if (challengerStats && challengerStats.totalChallenges > 0) {
      await prisma.userChallengeStats.update({
        where: { userId: challenge.challengerId },
        data: {
          winRate: (challengerStats.totalWins / challengerStats.totalChallenges) * 100
        }
      });
    }

    if (challengedStats && challengedStats.totalChallenges > 0) {
      await prisma.userChallengeStats.update({
        where: { userId: challenge.challengedId },
        data: {
          winRate: (challengedStats.totalWins / challengedStats.totalChallenges) * 100
        }
      });
    }

    console.log(`✅ Desafio finalizado! Vencedor: ${winnerId || 'Empate'}`);

    // Formatar resposta
    const formattedChallenge = {
      id: updatedChallenge.id,
      title: updatedChallenge.title,
      description: updatedChallenge.description,
      challenger: {
        id: updatedChallenge.challenger.id,
        name: updatedChallenge.challenger.name,
        email: updatedChallenge.challenger.email,
        avatar: updatedChallenge.challenger.foto || '/src/assets/images/avatar.jpg',
        tokens: challengerStats?.tokens || 0,
        totalWins: challengerStats?.totalWins || 0,
        totalLosses: challengerStats?.totalLosses || 0,
        winRate: challengerStats?.winRate || 0,
        totalProfit: challengerStats?.totalProfit || 0
      },
      challenged: {
        id: updatedChallenge.challenged.id,
        name: updatedChallenge.challenged.name,
        email: updatedChallenge.challenged.email,
        avatar: updatedChallenge.challenged.foto || '/src/assets/images/avatar.jpg',
        tokens: challengedStats?.tokens || 0,
        totalWins: challengedStats?.totalWins || 0,
        totalLosses: challengedStats?.totalLosses || 0,
        winRate: challengedStats?.winRate || 0,
        totalProfit: challengedStats?.totalProfit || 0
      },
      type: updatedChallenge.type,
      status: updatedChallenge.status,
      startDate: updatedChallenge.startDate,
      endDate: updatedChallenge.endDate,
      startTime: updatedChallenge.startTime,
      endTime: updatedChallenge.endTime,
      duration: updatedChallenge.duration,
      betAmount: updatedChallenge.betAmount,
      initialBalance: updatedChallenge.initialBalance,
      challengerReturn: challengerReturn,
      challengedReturn: challengedReturn,
      challengerProfit: challengerProfit,
      challengedProfit: challengedProfit,
      winner: updatedChallenge.winner ? {
        id: updatedChallenge.winner.id,
        name: updatedChallenge.winner.name,
        email: updatedChallenge.winner.email,
        avatar: updatedChallenge.winner.foto || '/src/assets/images/avatar.jpg',
        tokens: winnerId === challenge.challengerId ? challengerStats?.tokens || 0 : challengedStats?.tokens || 0,
        totalWins: winnerId === challenge.challengerId ? challengerStats?.totalWins || 0 : challengedStats?.totalWins || 0,
        totalLosses: winnerId === challenge.challengerId ? challengerStats?.totalLosses || 0 : challengedStats?.totalLosses || 0,
        winRate: winnerId === challenge.challengerId ? challengerStats?.winRate || 0 : challengedStats?.winRate || 0,
        totalProfit: winnerId === challenge.challengerId ? challengerStats?.totalProfit || 0 : challengedStats?.totalProfit || 0
      } : null,
      createdAt: updatedChallenge.createdAt,
      updatedAt: updatedChallenge.updatedAt
    };

    res.json(formattedChallenge);
  } catch (error) {
    console.error('Erro ao finalizar desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
    return;
  }
}; 

// Verificar e atualizar desafios expirados via API
export const checkExpiredChallenges = async (req: Request, res: Response): Promise<void> => {
  try {
    await updateExpiredChallenges();
    
    const expiredCount = await prisma.challenge.count({
      where: {
        status: 'completed',
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Últimas 24 horas
        }
      }
    });
    
    res.json({ 
      message: 'Verificação de desafios expirados concluída',
      expiredCount,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Erro ao verificar desafios expirados:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}; 

// Verificar saldo de tokens de um usuário
export const getUserTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    const userStats = await prisma.userChallengeStats.findUnique({
      where: { userId },
      select: {
        userId: true,
        tokens: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!userStats) {
      res.status(404).json({ error: 'Estatísticas do usuário não encontradas' });
      return;
    }

    res.json({
      userId: userStats.userId,
      name: userStats.user.name,
      email: userStats.user.email,
      tokens: userStats.tokens
    });
  } catch (error) {
    console.error('Erro ao buscar tokens do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Buscar histórico de transações de tokens do usuário
export const getTokenHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Verificar se o modelo tokenTransaction existe no Prisma Client
    // @ts-ignore - tokenTransaction será disponível após regenerar Prisma Client
    if (!prisma.tokenTransaction) {
      console.warn('⚠️ Modelo tokenTransaction não encontrado. Execute: npx prisma generate');
      res.json({
        transactions: [],
        total: 0,
        message: 'Modelo TokenTransaction ainda não foi criado. Execute a migration e regenere o Prisma Client.'
      });
      return;
    }

    // @ts-ignore - tokenTransaction será disponível após regenerar Prisma Client
    let transactions;
    try {
      transactions = await prisma.tokenTransaction.findMany({
        where: { userId },
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error: any) {
      // Se a tabela não existir no banco de dados
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        console.warn('⚠️ Tabela TokenTransaction não existe no banco de dados. Execute a migration.');
        res.json({
          transactions: [],
          total: 0,
          message: 'Histórico de tokens ainda não está disponível. A tabela precisa ser criada no banco de dados.'
        });
        return;
      }
      // Re-lançar outros erros
      throw error;
    }

    const formattedTransactions = transactions.map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      challenge: tx.challenge ? {
        id: tx.challenge.id,
        title: tx.challenge.title,
        type: tx.challenge.type,
        status: tx.challenge.status
      } : null,
      metadata: tx.metadata,
      createdAt: tx.createdAt
    }));

    res.json({
      transactions: formattedTransactions,
      total: formattedTransactions.length
    });
  } catch (error: any) {
    console.error('Erro ao buscar histórico de tokens:', error);
    
    // Se a tabela não existir, retornar resposta amigável
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      res.json({
        transactions: [],
        total: 0,
        message: 'Histórico de tokens ainda não está disponível. A tabela precisa ser criada no banco de dados.'
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'O modelo TokenTransaction pode não estar disponível. Execute: npx prisma generate'
    });
  }
};

// Buscar desafio específico por ID
export const getChallengeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.params;

    // Expirar desafios pendentes que passaram do horário de início
    await expirePendingChallenges();
    
    // Atualizar desafios concluídos que não têm vencedor definido
    await updateCompletedChallengesWithoutWinner();

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        winner: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        },
        loser: {
          select: {
            id: true,
            name: true,
            email: true,
            foto: true
          }
        }
      }
    });

    if (!challenge) {
      res.status(404).json({ error: 'Desafio não encontrado' });
      return;
    }

    // Carregar estatísticas dos usuários
    const [challengerStats, challengedStats] = await Promise.all([
      prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengerId } }),
      prisma.userChallengeStats.findUnique({ where: { userId: challenge.challengedId } })
    ]);

    const formattedChallenge = {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      challenger: {
        id: challenge.challenger.id,
        name: challenge.challenger.name,
        email: challenge.challenger.email,
        avatar: challenge.challenger.foto || '/src/assets/images/avatar.jpg',
        tokens: challengerStats?.tokens || 0,
        totalWins: challengerStats?.totalWins || 0,
        totalLosses: challengerStats?.totalLosses || 0,
        winRate: challengerStats?.winRate || 0,
        totalProfit: challengerStats?.totalProfit || 0
      },
      challenged: {
        id: challenge.challenged.id,
        name: challenge.challenged.name,
        email: challenge.challenged.email,
        avatar: challenge.challenged.foto || '/src/assets/images/avatar.jpg',
        tokens: challengedStats?.tokens || 0,
        totalWins: challengedStats?.totalWins || 0,
        totalLosses: challengedStats?.totalLosses || 0,
        winRate: challengedStats?.winRate || 0,
        totalProfit: challengedStats?.totalProfit || 0
      },
      type: challenge.type,
      status: challenge.status,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      startTime: challenge.startTime,
      endTime: challenge.endTime,
      duration: challenge.duration,
      betAmount: challenge.betAmount,
      initialBalance: challenge.initialBalance,
      challengerCurrentBalance: challenge.challengerCurrentBalance,
      challengedCurrentBalance: challenge.challengedCurrentBalance,
      challengerCurrentReturn: challenge.challengerCurrentReturn,
      challengedCurrentReturn: challenge.challengedCurrentReturn,
      challengerProfit: challenge.challengerProfit,
      challengedProfit: challenge.challengedProfit,
      challengerReturn: challenge.challengerReturn,
      challengedReturn: challenge.challengedReturn,
      challengerBotId: challenge.challengerBotId,
      challengedBotId: challenge.challengedBotId,
      winner: challenge.winner ? {
        id: challenge.winner.id,
        name: challenge.winner.name,
        email: challenge.winner.email,
        avatar: challenge.winner.foto || '/src/assets/images/avatar.jpg'
      } : null,
      loser: challenge.loser ? {
        id: challenge.loser.id,
        name: challenge.loser.name,
        email: challenge.loser.email,
        avatar: challenge.loser.foto || '/src/assets/images/avatar.jpg'
      } : null,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt
    };

    res.json(formattedChallenge);
  } catch (error) {
    console.error('Erro ao buscar desafio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}; 

// Função para verificar e ativar desafios que estão aguardando início
export const checkAndActivateWaitingChallenges = async (): Promise<void> => {
  try {
    const now = new Date();
    
    // Buscar desafios que estão aguardando início (apenas duelos de robôs)
    const waitingChallenges = await prisma.challenge.findMany({
      where: {
        status: 'waiting_start',
        type: 'bot_duel' // Só verificar duelos de robôs
      }
    });

    for (const challenge of waitingChallenges) {
      const startDateTime = getStartDateTimeUtc(challenge.startDate, challenge.startTime);
      
      // Verificar se o desafio já expirou
      if (isChallengeExpired(challenge.endDate, challenge.endTime, challenge.startDate, challenge.startTime)) {
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { status: 'completed' }
        });
        
        console.log(`🕐 Duelo de Robôs ${challenge.id} marcado como expirado (aguardando início)`);
        continue;
      }
      
      // Se chegou o horário de início, ativar o desafio
      if (now.getTime() >= startDateTime.getTime()) {
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { status: 'active' }
        });
        
        console.log(`🚀 Duelo de Robôs ${challenge.id} ativado automaticamente`);
      }
    }
  } catch (error) {
    console.error('Erro ao verificar desafios aguardando início:', error);
  }
}; 