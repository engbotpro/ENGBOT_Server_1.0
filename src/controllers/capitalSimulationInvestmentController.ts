import { Request, Response } from 'express';
import prisma from '../prismaClient';

/**
 * Lista investimentos de simulação do usuário (não aparecem em Capital Total).
 */
export const list = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const investments = await prisma.capitalSimulationInvestment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const totalInvested = investments.reduce((sum, i) => sum + i.amountInvested, 0);
    res.status(200).json({
      success: true,
      data: {
        investments,
        totalInvested,
        valorTotal: totalInvested,
      },
    });
  } catch (error) {
    console.error('Erro ao listar investimentos de simulação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Cria investimento de simulação.
 * Body: type, name, symbol?, amountInvested, quantity?, interestRate?, maturityDate?, startDate?, notes?
 */
export const create = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      type,
      name,
      symbol,
      amountInvested,
      quantity,
      interestRate,
      maturityDate,
      startDate,
      notes,
    } = req.body;

    if (!type || !name || amountInvested == null || amountInvested < 0) {
      return res.status(400).json({
        success: false,
        message: 'Necessário: type, name, amountInvested (>= 0)',
      });
    }
    if (type === 'fixed_income' && !maturityDate) {
      return res.status(400).json({
        success: false,
        message: 'Para renda fixa informe a data de vencimento (maturityDate)',
      });
    }
    if (type === 'crypto' && (quantity == null || quantity <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Para cripto é obrigatório informar quantity > 0',
      });
    }

    const investment = await prisma.capitalSimulationInvestment.create({
      data: {
        userId,
        type: String(type),
        name: String(name),
        symbol: symbol != null ? String(symbol) : null,
        amountInvested: Number(amountInvested),
        quantity: quantity != null ? Number(quantity) : null,
        interestRate: interestRate != null ? Number(interestRate) : null,
        maturityDate: maturityDate ? new Date(maturityDate) : null,
        startDate: startDate ? new Date(startDate) : null,
        notes: notes != null ? String(notes) : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Investimento de simulação adicionado',
      data: investment,
    });
  } catch (error) {
    console.error('Erro ao criar investimento de simulação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Atualiza investimento de simulação.
 */
export const update = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.capitalSimulationInvestment.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Investimento não encontrado',
      });
    }

    const data: any = {};
    if (body.type != null) data.type = String(body.type);
    if (body.name != null) data.name = String(body.name);
    if (body.symbol !== undefined) data.symbol = body.symbol ? String(body.symbol) : null;
    if (body.amountInvested != null) data.amountInvested = Number(body.amountInvested);
    if (body.quantity !== undefined) data.quantity = body.quantity != null ? Number(body.quantity) : null;
    if (body.interestRate !== undefined) data.interestRate = body.interestRate != null ? Number(body.interestRate) : null;
    if (body.maturityDate !== undefined) data.maturityDate = body.maturityDate ? new Date(body.maturityDate) : null;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

    const investment = await prisma.capitalSimulationInvestment.update({
      where: { id },
      data,
    });

    res.status(200).json({
      success: true,
      message: 'Investimento de simulação atualizado',
      data: investment,
    });
  } catch (error) {
    console.error('Erro ao atualizar investimento de simulação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Remove investimento de simulação.
 */
export const remove = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const existing = await prisma.capitalSimulationInvestment.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Investimento não encontrado',
      });
    }

    await prisma.capitalSimulationInvestment.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Investimento de simulação removido',
    });
  } catch (error) {
    console.error('Erro ao remover investimento de simulação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};
