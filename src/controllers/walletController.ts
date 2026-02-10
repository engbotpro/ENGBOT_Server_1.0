import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Função auxiliar para garantir saldo mínimo de $1000 na carteira virtual
const ensureMinimumVirtualBalance = async (userId: string) => {
  try {
    const MINIMUM_BALANCE = 1000;
    
    // Buscar todas as carteiras virtuais do usuário
    const virtualWallets = await prisma.wallet.findMany({
      where: {
        userId,
        type: 'virtual',
        isActive: true
      }
    });
    
    // Calcular saldo total virtual
    const totalBalance = virtualWallets.reduce((sum, wallet) => sum + wallet.value, 0);
    
    // Se o saldo total for menor que o mínimo, ajustar
    if (totalBalance < MINIMUM_BALANCE) {
      const difference = MINIMUM_BALANCE - totalBalance;
      
      // Buscar ou criar carteira USDT
      const usdtWallet = virtualWallets.find(w => w.symbol === 'USDT');
      
      if (usdtWallet) {
        // Atualizar saldo USDT existente
        await prisma.wallet.update({
          where: {
            userId_type_symbol: {
              userId,
              type: 'virtual',
              symbol: 'USDT'
            }
          },
          data: {
            balance: usdtWallet.balance + difference,
            value: usdtWallet.value + difference,
            isActive: true
          }
        });
      } else {
        // Criar nova carteira USDT
        await prisma.wallet.create({
          data: {
            userId,
            type: 'virtual',
            symbol: 'USDT',
            name: 'US Dollar Tether',
            balance: difference,
            value: difference,
            isActive: true
          }
        });
      }
      
      console.log(`Saldo virtual ajustado para usuário ${userId}: adicionados $${difference.toFixed(2)} para manter mínimo de $${MINIMUM_BALANCE}`);
    }
  } catch (error) {
    console.error('Erro ao garantir saldo mínimo virtual:', error);
    // Não lançar erro, apenas logar
  }
};

// Criar ou atualizar saldo na carteira
export const updateWalletBalance = async (req: Request, res: Response) => {
  try {
    const { type, symbol, name, balance, value } = req.body;
    const userId = (req as any).user.id;

    // Validar entrada
    if (!type || !symbol || !name || balance === undefined || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos. Necessário: type, symbol, name, balance, value'
      });
    }

    if (!['virtual', 'real'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de carteira deve ser "virtual" ou "real"'
      });
    }

    // Usar upsert para criar ou atualizar o saldo
    let wallet;
    
    // Definir threshold para considerar como zero (0.00000001)
    const ZERO_THRESHOLD = 0.00000001;
    
    // Se o saldo for 0 ou insignificante, remover o ativo da carteira
    if (balance <= ZERO_THRESHOLD) {
      // Verificar se o ativo existe antes de tentar deletar
      const existingWallet = await prisma.wallet.findUnique({
        where: {
          userId_type_symbol: {
            userId,
            type,
            symbol
          }
        }
      });

      if (existingWallet) {
        // Marcar como inativo em vez de deletar para manter histórico
        wallet = await prisma.wallet.update({
          where: {
            userId_type_symbol: {
              userId,
              type,
              symbol
            }
          },
          data: {
            balance: 0,
            value: 0,
            isActive: false
          }
        });
      } else {
        // Se não existe, não criar um ativo com saldo 0
        return res.status(400).json({
          success: false,
          message: 'Não é possível criar ativo com saldo zero'
        });
      }
    } else {
      // Saldo maior que 0, criar ou atualizar normalmente
      wallet = await prisma.wallet.upsert({
        where: {
          userId_type_symbol: {
            userId,
            type,
            symbol
          }
        },
        update: {
          balance,
          value,
          name,
          isActive: true // Reativar se estava inativo
        },
        create: {
          userId,
          type,
          symbol,
          name,
          balance,
          value,
          isActive: true
        }
      });
    }

    // Se for carteira virtual, garantir saldo mínimo após atualização
    if (type === 'virtual') {
      await ensureMinimumVirtualBalance(userId);
    }

    res.status(200).json({
      success: true,
      message: 'Saldo da carteira atualizado com sucesso',
      data: wallet
    });
  } catch (error) {
    console.error('Erro ao atualizar saldo da carteira:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Obter todas as carteiras do usuário
export const getUserWallets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { type } = req.query; // 'virtual' ou 'real'

    const whereClause: any = {
      userId,
      isActive: true
    };

    if (type && ['virtual', 'real'].includes(type as string)) {
      whereClause.type = type;
    }

    const wallets = await prisma.wallet.findMany({
      where: whereClause,
      orderBy: [
        { type: 'asc' },
        { symbol: 'asc' }
      ]
    });

    // Agrupar por tipo para facilitar o frontend
    const groupedWallets = {
      virtual: wallets.filter(w => w.type === 'virtual'),
      real: wallets.filter(w => w.type === 'real')
    };

    res.status(200).json({
      success: true,
      message: 'Carteiras recuperadas com sucesso',
      data: type ? wallets : groupedWallets
    });
  } catch (error) {
    console.error('Erro ao buscar carteiras:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Inicializar carteira virtual com $10,000
export const initializeVirtualWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Verificar se já existe carteira virtual USDT
    const existingWallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: {
          userId,
          type: 'virtual',
          symbol: 'USDT'
        }
      }
    });

    if (existingWallet) {
      return res.status(400).json({
        success: false,
        message: 'Carteira virtual já foi inicializada'
      });
    }

    // Criar carteira virtual com $10,000 USDT
    const virtualWallet = await prisma.wallet.create({
      data: {
        userId,
        type: 'virtual',
        symbol: 'USDT',
        name: 'Tether USD',
        balance: 10000,
        value: 10000
      }
    });

    res.status(201).json({
      success: true,
      message: 'Carteira virtual inicializada com $10,000',
      data: virtualWallet
    });
  } catch (error) {
    console.error('Erro ao inicializar carteira virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Transferir saldo entre ativos (compra/venda simulada)
export const transferBalance = async (req: Request, res: Response) => {
  try {
    const { fromSymbol, toSymbol, amount, price, walletType = 'virtual' } = req.body;
    const userId = (req as any).user.id;

    // Validar entrada
    if (!fromSymbol || !toSymbol || !amount || !price) {
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos. Necessário: fromSymbol, toSymbol, amount, price'
      });
    }

    if (amount <= 0 || price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount e price devem ser maiores que zero'
      });
    }

    // Buscar carteira de origem
    const fromWallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: {
          userId,
          type: walletType,
          symbol: fromSymbol
        }
      }
    });

    if (!fromWallet || fromWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente na carteira de origem'
      });
    }

    const totalValue = amount * price;

    // Usar transação para garantir consistência
    const result = await prisma.$transaction(async (tx) => {
      // Reduzir saldo da carteira de origem
      await tx.wallet.update({
        where: {
          userId_type_symbol: {
            userId,
            type: walletType,
            symbol: fromSymbol
          }
        },
        data: {
          balance: fromWallet.balance - amount,
          value: fromWallet.value - totalValue
        }
      });

      // Aumentar saldo da carteira de destino (criar se não existir)
      await tx.wallet.upsert({
        where: {
          userId_type_symbol: {
            userId,
            type: walletType,
            symbol: toSymbol
          }
        },
        update: {
          balance: {
            increment: fromSymbol === 'USD' ? totalValue / price : amount
          },
          value: {
            increment: totalValue
          }
        },
        create: {
          userId,
          type: walletType,
          symbol: toSymbol,
          name: toSymbol === 'USD' ? 'US Dollar' : toSymbol,
          balance: fromSymbol === 'USD' ? totalValue / price : amount,
          value: totalValue
        }
      });

      return { success: true };
    });

    // Se for carteira virtual, garantir saldo mínimo após transferência
    if (walletType === 'virtual') {
      await ensureMinimumVirtualBalance(userId);
    }

    res.status(200).json({
      success: true,
      message: 'Transferência realizada com sucesso',
      data: result
    });
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Obter resumo das carteiras
export const getWalletSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const wallets = await prisma.wallet.findMany({
      where: {
        userId,
        isActive: true
      }
    });

    const summary = {
      virtual: {
        totalValue: wallets
          .filter(w => w.type === 'virtual')
          .reduce((sum, w) => sum + w.value, 0),
        assetsCount: wallets.filter(w => w.type === 'virtual').length
      },
      real: {
        totalValue: wallets
          .filter(w => w.type === 'real')
          .reduce((sum, w) => sum + w.value, 0),
        assetsCount: wallets.filter(w => w.type === 'real').length
      }
    };

    res.status(200).json({
      success: true,
      message: 'Resumo das carteiras recuperado com sucesso',
      data: summary
    });
  } catch (error) {
    console.error('Erro ao obter resumo das carteiras:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// Deletar/desativar um ativo da carteira
export const removeWalletAsset = async (req: Request, res: Response) => {
  try {
    const { type, symbol } = req.params;
    const userId = (req as any).user.id;

    if (!type || !symbol) {
      return res.status(400).json({
        success: false,
        message: 'Tipo e símbolo são obrigatórios'
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: {
          userId,
          type,
          symbol
        }
      }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Ativo não encontrado na carteira'
      });
    }

    // Desativar em vez de deletar para manter histórico
    const updatedWallet = await prisma.wallet.update({
      where: {
        userId_type_symbol: {
          userId,
          type,
          symbol
        }
      },
      data: {
        isActive: false,
        balance: 0,
        value: 0
      }
    });

    res.status(200).json({
      success: true,
      message: 'Ativo removido da carteira com sucesso',
      data: updatedWallet
    });
  } catch (error) {
    console.error('Erro ao remover ativo da carteira:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

/**
 * Executa ordem spot virtual (compra ou venda): atualiza carteiras e registra trade no histórico.
 * Body: { side, symbol, quantity, price, stopLoss?, takeProfit? }
 */
export const executeVirtualSpotOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { side, symbol, quantity, price, stopLoss, takeProfit } = req.body;

    if (!side || !symbol || !quantity || quantity <= 0 || !price || price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Necessário: side (buy|sell), symbol (ex: BTCUSDT), quantity (>0), price (>0)',
      });
    }

    const sideLower = String(side).toLowerCase();
    if (sideLower !== 'buy' && sideLower !== 'sell') {
      return res.status(400).json({
        success: false,
        message: 'side deve ser "buy" ou "sell"',
      });
    }

    // symbol ex: BTCUSDT -> base = BTC, quote = USDT
    const baseSymbol = symbol.replace(/USDT$/i, '');
    const quoteSymbol = 'USDT';
    const totalUsdt = quantity * price;

    const usdtWallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: { userId, type: 'virtual', symbol: quoteSymbol },
      },
    });

    const baseWallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: { userId, type: 'virtual', symbol: baseSymbol },
      },
    });

    if (sideLower === 'buy') {
      if (!usdtWallet || usdtWallet.balance < totalUsdt) {
        return res.status(400).json({
          success: false,
          message: 'Saldo USDT insuficiente para compra',
        });
      }
    } else {
      const baseBalance = baseWallet?.balance ?? 0;
      if (baseBalance < quantity) {
        return res.status(400).json({
          success: false,
          message: `Saldo insuficiente de ${baseSymbol}. Disponível: ${baseBalance.toFixed(8)}`,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (sideLower === 'buy') {
        await tx.wallet.update({
          where: {
            userId_type_symbol: { userId, type: 'virtual', symbol: quoteSymbol },
          },
          data: {
            balance: usdtWallet!.balance - totalUsdt,
            value: usdtWallet!.value - totalUsdt,
          },
        });
        await tx.wallet.upsert({
          where: {
            userId_type_symbol: { userId, type: 'virtual', symbol: baseSymbol },
          },
          update: {
            balance: { increment: quantity },
            value: { increment: totalUsdt },
          },
          create: {
            userId,
            type: 'virtual',
            symbol: baseSymbol,
            name: baseSymbol,
            balance: quantity,
            value: totalUsdt,
            isActive: true,
          },
        });
      } else {
        await tx.wallet.update({
          where: {
            userId_type_symbol: { userId, type: 'virtual', symbol: baseSymbol },
          },
          data: {
            balance: baseWallet!.balance - quantity,
            value: baseWallet!.value - totalUsdt,
          },
        });
        await tx.wallet.upsert({
          where: {
            userId_type_symbol: { userId, type: 'virtual', symbol: quoteSymbol },
          },
          update: {
            balance: { increment: totalUsdt },
            value: { increment: totalUsdt },
          },
          create: {
            userId,
            type: 'virtual',
            symbol: quoteSymbol,
            name: 'Tether USD',
            balance: totalUsdt,
            value: totalUsdt,
            isActive: true,
          },
        });
      }

      const trade = await tx.trade.create({
        data: {
          userId,
          symbol,
          side: sideLower,
          type: 'market',
          quantity,
          price,
          total: totalUsdt,
          tradeType: 'manual',
          environment: 'simulated',
          status: 'closed',
          entryTime: new Date(),
          exitTime: new Date(),
          exitPrice: price,
          pnl: 0,
          pnlPercent: 0,
          stopLoss: stopLoss != null && stopLoss !== '' ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit != null && takeProfit !== '' ? parseFloat(takeProfit) : null,
        },
      });
      (req as any).__createdTrade = trade;
    });

    const createdTrade = (req as any).__createdTrade;
    await ensureMinimumVirtualBalance(userId);

    const wallets = await prisma.wallet.findMany({
      where: { userId, type: 'virtual', isActive: true },
    });

    res.status(200).json({
      success: true,
      message: sideLower === 'buy' ? 'Compra virtual executada' : 'Venda virtual executada',
      data: {
        trade: createdTrade,
        wallets,
      },
    });
  } catch (error) {
    console.error('Erro ao executar ordem spot virtual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

// Limpar ativos com saldo zero ou muito baixo
export const cleanupZeroBalances = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ZERO_THRESHOLD = 0.00000001;

    // Buscar todos os ativos ativos do usuário
    const wallets = await prisma.wallet.findMany({
      where: {
        userId,
        isActive: true
      }
    });

    let cleanedCount = 0;

    // Iterar sobre cada carteira e verificar saldo
    for (const wallet of wallets) {
      if (wallet.balance <= ZERO_THRESHOLD) {
        await prisma.wallet.update({
          where: {
            userId_type_symbol: {
              userId,
              type: wallet.type,
              symbol: wallet.symbol
            }
          },
          data: {
            isActive: false,
            balance: 0,
            value: 0
          }
        });
        cleanedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `${cleanedCount} ativos com saldo zero foram removidos`,
      data: { cleanedCount }
    });
  } catch (error) {
    console.error('Erro ao limpar saldos zero:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};