import { Request, Response } from 'express';
import prisma from '../prismaClient';
import { verifyPendingBitcoinTransactions } from '../services/bitcoinVerificationService';

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

const BTC_PER_CREDIT = 0.00025; // 1 Super Crédito = 0.00025 BTC

// Criar transação Bitcoin (usuário)
export const createBitcoinTransaction = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { superCreditsAmount, txHash } = req.body;

    if (!superCreditsAmount || superCreditsAmount <= 0) {
      return res.status(400).json({ error: 'Quantidade de Super Créditos inválida' });
    }

    // Obter endereço da carteira Bitcoin
    const settings = await prisma.platformSettings.findUnique({
      where: { id: 'platform' }
    });

    if (!settings || !settings.bitcoinWalletAddress) {
      return res.status(400).json({ 
        error: 'Endereço da carteira Bitcoin não configurado. Entre em contato com o suporte.' 
      });
    }

    // Calcular valor em BTC
    const amountBTC = superCreditsAmount * BTC_PER_CREDIT;

    // Criar transação
    const transaction = await prisma.bitcoinTransaction.create({
      data: {
        userId,
        superCreditsAmount,
        amountBTC,
        txHash: txHash || null,
        walletAddress: settings.bitcoinWalletAddress,
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Tentar verificar automaticamente imediatamente se um TX Hash foi fornecido
    if (txHash) {
      // Executar verificação em background (não bloqueia a resposta)
      verifyPendingBitcoinTransactions().catch(error => {
        console.error('[createBitcoinTransaction] Erro na verificação automática:', error);
      });
    }

    res.status(201).json({
      message: 'Transação criada com sucesso. O sistema verificará automaticamente a transação no blockchain. Se for confirmada, você receberá os Super Créditos automaticamente.',
      transaction
    });
  } catch (error) {
    console.error('[createBitcoinTransaction] Erro ao criar transação:', error);
    res.status(500).json({ error: 'Erro ao criar transação Bitcoin' });
  }
};

// Obter transações do usuário
export const getMyBitcoinTransactions = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const transactions = await prisma.bitcoinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(transactions);
  } catch (error) {
    console.error('[getMyBitcoinTransactions] Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro ao buscar transações Bitcoin' });
  }
};

// Obter todas as transações (apenas admin)
export const getAllBitcoinTransactions = async (req: Request, res: Response) => {
  try {
    const adminId = getUserId(req);
    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { perfil: true }
    });

    if (admin?.perfil !== 'Admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores podem visualizar todas as transações.'
      });
    }

    const transactions = await prisma.bitcoinTransaction.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(transactions);
  } catch (error) {
    console.error('[getAllBitcoinTransactions] Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro ao buscar transações Bitcoin' });
  }
};

// Aprovar transação Bitcoin (apenas admin)
export const approveBitcoinTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = getUserId(req);
    
    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { perfil: true }
    });

    if (admin?.perfil !== 'Admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores podem aprovar transações.'
      });
    }

    // Buscar transação
    const transaction = await prisma.bitcoinTransaction.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            wallets: {
              where: {
                symbol: 'SUPER_CREDITS',
                type: 'virtual'
              }
            }
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ 
        error: `Esta transação já foi ${transaction.status === 'approved' ? 'aprovada' : 'rejeitada'}.` 
      });
    }

    // Atualizar transação
    await prisma.bitcoinTransaction.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId
      }
    });

    // Adicionar Super Créditos à carteira do usuário
    const wallet = transaction.user.wallets[0];
    if (wallet) {
      // Atualizar carteira existente
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance + transaction.superCreditsAmount
        }
      });
    } else {
      // Criar nova carteira de Super Créditos
      await prisma.wallet.create({
        data: {
          userId: transaction.userId,
          type: 'virtual',
          symbol: 'SUPER_CREDITS',
          name: 'Super Créditos',
          balance: transaction.superCreditsAmount,
          value: transaction.superCreditsAmount
        }
      });
    }

    res.json({
      message: 'Transação aprovada e Super Créditos creditados com sucesso',
      transaction: await prisma.bitcoinTransaction.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      })
    });
  } catch (error) {
    console.error('[approveBitcoinTransaction] Erro ao aprovar transação:', error);
    res.status(500).json({ error: 'Erro ao aprovar transação Bitcoin' });
  }
};

// Rejeitar transação Bitcoin (apenas admin)
export const rejectBitcoinTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const adminId = getUserId(req);
    
    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { perfil: true }
    });

    if (admin?.perfil !== 'Admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores podem rejeitar transações.'
      });
    }

    // Buscar transação
    const transaction = await prisma.bitcoinTransaction.findUnique({
      where: { id }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ 
        error: `Esta transação já foi ${transaction.status === 'approved' ? 'aprovada' : 'rejeitada'}.` 
      });
    }

    // Atualizar transação
    const updatedTransaction = await prisma.bitcoinTransaction.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedAt: new Date(),
        approvedBy: adminId,
        rejectionReason: rejectionReason || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      message: 'Transação rejeitada',
      transaction: updatedTransaction
    });
  } catch (error) {
    console.error('[rejectBitcoinTransaction] Erro ao rejeitar transação:', error);
    res.status(500).json({ error: 'Erro ao rejeitar transação Bitcoin' });
  }
};
