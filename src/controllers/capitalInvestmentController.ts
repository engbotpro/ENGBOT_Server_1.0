import { Request, Response } from 'express';
import prisma from '../prismaClient';
import { fetchCurrentPrice } from '../services/binanceService';

/**
 * Lista todos os investimentos do usuário (Capital Total).
 * Inclui valor atual calculado (cripto: cotação; renda fixa: juros acumulados).
 */
export const listInvestments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const investments = await prisma.capitalInvestment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const withCurrentValue = await Promise.all(
      investments.map(async (inv) => {
        const currentValue = await getCurrentValue(inv);
        return {
          ...inv,
          currentValue,
        };
      })
    );

    const totalInvested = investments.reduce((sum, i) => sum + i.amountInvested, 0);
    const valorTotal = withCurrentValue.reduce((sum, i) => sum + (i.currentValue ?? i.amountInvested), 0);

    res.status(200).json({
      success: true,
      data: {
        investments: withCurrentValue,
        totalInvested,
        valorTotal,
      },
    });
  } catch (error) {
    console.error('Erro ao listar investimentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar investimentos',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Retorna o valor atual de um investimento (cripto: cotação; renda fixa: principal + juros até hoje).
 */
async function getCurrentValue(inv: {
  type: string;
  amountInvested: number;
  quantity: number | null;
  symbol: string | null;
  interestRate: number | null;
  startDate: Date | null;
  createdAt: Date;
}): Promise<number | null> {
  if (inv.type === 'crypto' && inv.quantity != null && inv.quantity > 0 && inv.symbol) {
    const symbol = inv.symbol.toUpperCase().endsWith('USDT') ? inv.symbol.toUpperCase() : `${inv.symbol.toUpperCase()}USDT`;
    const price = await fetchCurrentPrice(symbol);
    if (price != null && price > 0) return inv.quantity * price;
    return null;
  }
  if (inv.type === 'fixed_income' && inv.interestRate != null) {
    const start = inv.startDate || inv.createdAt;
    const now = new Date();
    const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0) return inv.amountInvested;
    return inv.amountInvested * Math.pow(1 + inv.interestRate / 100, years);
  }
  return inv.amountInvested;
}

/**
 * Cria um novo investimento.
 * Body: type, name, symbol?, amountInvested, quantity?, interestRate?, maturityDate?, startDate?, notes?
 */
export const createInvestment = async (req: Request, res: Response) => {
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
        message: 'Para renda fixa é obrigatório informar a data de vencimento (maturityDate)',
      });
    }
    if (type === 'crypto' && (quantity == null || quantity <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Para cripto é obrigatório informar quantity > 0',
      });
    }

    const investment = await prisma.capitalInvestment.create({
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
      message: 'Investimento adicionado',
      data: investment,
    });
  } catch (error) {
    console.error('Erro ao criar investimento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar investimento',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Atualiza um investimento.
 */
export const updateInvestment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.capitalInvestment.findFirst({
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

    const investment = await prisma.capitalInvestment.update({
      where: { id },
      data,
    });

    res.status(200).json({
      success: true,
      message: 'Investimento atualizado',
      data: investment,
    });
  } catch (error) {
    console.error('Erro ao atualizar investimento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar investimento',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Remove um investimento.
 */
export const deleteInvestment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const existing = await prisma.capitalInvestment.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Investimento não encontrado',
      });
    }

    await prisma.capitalInvestment.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Investimento removido',
    });
  } catch (error) {
    console.error('Erro ao remover investimento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover investimento',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Resumo: total investido e valor total (soma dos valores atuais).
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const investments = await prisma.capitalInvestment.findMany({
      where: { userId },
    });

    const totalInvested = investments.reduce((sum, i) => sum + i.amountInvested, 0);
    let valorTotal = 0;
    for (const inv of investments) {
      const cv = await getCurrentValue(inv);
      valorTotal += cv ?? inv.amountInvested;
    }

    res.status(200).json({
      success: true,
      data: {
        totalInvested,
        valorTotal,
      },
    });
  } catch (error) {
    console.error('Erro ao obter resumo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter resumo',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/** Tipo de investimento para simulação (igual à web e ao mobile) */
interface SimInvestment {
  type: string;
  initialValue: number;
  monthlyContribution: number;
  expectedReturn: number;
  returnPeriod?: string;
  taxRate?: number;
}

interface SimResultRow {
  month: number;
  totalValue: number;
  totalContribution: number;
  totalProfit: number;
  totalTax: number;
  netProfit: number;
  cryptoValue: number;
  stockValue: number;
  fixedIncomeValue: number;
  realEstateValue: number;
}

/**
 * Simulação do capital: projeta patrimônio mês a mês (igual à lógica da web ProfitPlan / mobile).
 * POST body: { investments: SimInvestment[], simulationMonths?: number, includeCryptoVolatility?: boolean, cryptoVolatility?: number }
 */
export const simulateCapital = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const investments: SimInvestment[] = Array.isArray(body.investments) ? body.investments : [];
    const simulationMonths = Math.min(Math.max(Number(body.simulationMonths) || 12, 1), 360);
    const includeCryptoVolatility = body.includeCryptoVolatility !== false;
    const cryptoVolatility = Math.min(Math.max(Number(body.cryptoVolatility) || 50, 0), 100) / 100;

    if (investments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Envie ao menos um investimento em body.investments',
      });
    }

    const totalAporteMensal = investments.reduce((s, i) => s + (Number(i.monthlyContribution) || 0), 0);
    let totalContribution = investments.reduce((s, i) => s + (Number(i.initialValue) || 0), 0);
    const simulation: SimResultRow[] = [];

    for (let month = 0; month <= simulationMonths; month++) {
      let cryptoValue = 0;
      let stockValue = 0;
      let fixedIncomeValue = 0;
      let realEstateValue = 0;
      let monthTotalValue = 0;
      let monthTotalProfit = 0;
      let monthTotalTax = 0;

      for (const inv of investments) {
        const initial = Number(inv.initialValue) || 0;
        const monthlyContrib = Number(inv.monthlyContribution) || 0;
        const expectedReturn = Number(inv.expectedReturn) || 0;
        const returnPeriod = inv.returnPeriod || 'ANNUAL';
        const taxRate = Number(inv.taxRate) || 0;

        let monthlyReturn = returnPeriod === 'MONTHLY'
          ? expectedReturn / 100
          : expectedReturn / 12 / 100;

        if (inv.type === 'CRYPTO' && includeCryptoVolatility) {
          const r = (Math.random() - 0.5) * cryptoVolatility * 0.5;
          monthlyReturn += r;
        }

        let investmentValue: number;
        let investmentContribution: number;

        if (month === 0) {
          investmentValue = initial;
          investmentContribution = initial;
        } else {
          const factor = monthlyReturn > 0 ? Math.pow(1 + monthlyReturn, month) : 1;
          const contribFactor = monthlyReturn > 0
            ? (Math.pow(1 + monthlyReturn, month) - 1) / monthlyReturn
            : month;
          investmentValue = initial * factor + monthlyContrib * contribFactor;
          investmentContribution = initial + monthlyContrib * month;
        }

        const investmentProfit = investmentValue - investmentContribution;
        const investmentTax = investmentProfit > 0 ? (investmentProfit * taxRate) / 100 : 0;

        monthTotalValue += investmentValue;
        monthTotalProfit += investmentProfit;
        monthTotalTax += investmentTax;

        switch (String(inv.type).toUpperCase()) {
          case 'CRYPTO':
            cryptoValue += investmentValue;
            break;
          case 'STOCK':
            stockValue += investmentValue;
            break;
          case 'FIXED_INCOME':
            fixedIncomeValue += investmentValue;
            break;
          case 'REAL_ESTATE':
            realEstateValue += investmentValue;
            break;
          default:
            cryptoValue += investmentValue;
            break;
        }
      }

      if (month > 0) {
        totalContribution += totalAporteMensal;
      }

      simulation.push({
        month,
        totalValue: monthTotalValue,
        totalContribution,
        totalProfit: monthTotalProfit,
        totalTax: monthTotalTax,
        netProfit: monthTotalProfit - monthTotalTax,
        cryptoValue,
        stockValue,
        fixedIncomeValue,
        realEstateValue,
      });
    }

    res.status(200).json({
      success: true,
      data: { simulation },
    });
  } catch (error) {
    console.error('Erro na simulação do capital:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao simular',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};
