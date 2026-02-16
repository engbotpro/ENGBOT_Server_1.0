// src/controllers/calcCompoundInterest.ts
import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to convert comma to dot and parse number
const parseNumber = (value: any): number => {
  if (typeof value === 'string') {
    return Number(value.replace(',', '.'));
  }
  return Number(value);
};

interface CompoundInput {
  initial: number;
  rate: number;
  ratePeriod: 'ANUAL' | 'MENSAL';
  term: number;
  termUnit: 'ANOS' | 'MESES';
  monthly: number;      // mantido apenas para compatibilidade; sempre 0
  userId: string;
  tax: number;          // alíquota de imposto (%)
}

export interface SpendingEntry {
  id: number
  description: string
  value: number
  expenseType?: string // Tipo de gasto selecionado pelo usuário
}

export interface SpendingPlanType {
  receitas: SpendingEntry[]
  despesas: SpendingEntry[]
  receitasReais?: SpendingEntry[]  // Dados realizados
  despesasReais?: SpendingEntry[]  // Dados realizados
}

export const calcCompoundInterest = async (
  req: Request<{}, {}, CompoundInput>,
  res: Response,
): Promise<void> => {
  try {
    const {
      initial,
      rate,
      ratePeriod,
      term,
      termUnit,
      userId,
      tax,
    } = req.body;

    // Converte vírgulas em pontos para os campos numéricos
    const parsedInitial = parseNumber(initial);
    const parsedRate = parseNumber(rate);
    const parsedTerm = parseNumber(term);
    const parsedTax = parseNumber(tax);

    /* ---------- Conversões auxiliares ---------- */
    const totalMonths = termUnit === 'ANOS' ? parsedTerm * 12 : parsedTerm;
    const i           = ratePeriod === 'ANUAL' ? parsedRate / 100 / 12 : parsedRate / 100;

    /* ---------- Montante final ---------- */
    const total = parsedInitial * Math.pow(1 + i, totalMonths);

    /* ---------- Lucro, imposto, líquido ---------- */
    const profit   = total - parsedInitial;
    const taxValue = profit * (parsedTax / 100);
    const netValue = total - taxValue;

    /* ---------- Atualiza ou cria ---------- */
    const existing = await prisma.compoundInterest.findFirst({
      where: { userId },
    });

    const data = {
      userId,
      initial: parsedInitial,
      rate: parsedRate,
      ratePeriod,
      term: parsedTerm,
      termUnit,
      monthly: 0,
      totalMonths,
      interestPerMonth: i,
      montantePrincipal: total,
      tax: parsedTax,          // alíquota (%)
      total,        // montante bruto
      taxValue,     // imposto em R$
      netValue,     // líquido
    };

    if (existing) {
      await prisma.compoundInterest.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.compoundInterest.create({ data });
    }

    /* ---------- Resposta ---------- */
    res.json({ total, taxValue, netValue });
  } catch (err) {
    console.error('Erro em calcCompoundInterest:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const getCompoundInterest = async (
  req: Request<{ userId: string }>,   // :userId na URL
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;

    /* ---------- Consulta ---------- */
    const record = await prisma.compoundInterest.findFirst({
      where: { userId },
      
    });

    if (!record) {
      res.status(404).json({ message: 'Nenhum cálculo encontrado para este usuário.' });
      return;
    }

    /* ---------- Resposta ---------- */
    res.json(record);                   // devolve tudo: initial, rate, total, etc.
  } catch (err) {
    console.error('Erro em getCompoundInterest:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const deleteCompoundInterest = async (
  req: Request<{ userId: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;

    const deleted = await prisma.compoundInterest.deleteMany({
      where: { userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ message: 'Nenhum cálculo encontrado para excluir.' });
      return;
    }

    res.status(204).end(); // sem conteúdo
  } catch (err) {
    console.error('Erro em deleteCompoundInterest:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const calcFinancialIndependence = async (
  req: Request<
    {},
    {},
    {
      initial: number;
      rate: number;
      ratePeriod: 'ANUAL' | 'MENSAL';
      term: number;
      termUnit: 'ANOS' | 'MESES';
      userId: string;
      tax: number;
      monthly: number; // aporte já em meses
    }
  >,
  res: Response,
): Promise<void> => {
  try {
    const {
      initial,
      rate,
      ratePeriod,
      term,
      termUnit,
      userId,
      tax,
      monthly,
    } = req.body;

    // Converte vírgulas em pontos para os campos numéricos
    const parsedInitial = parseNumber(initial);
    const parsedRate = parseNumber(rate);
    const parsedTerm = parseNumber(term);
    const parsedTax = parseNumber(tax);
    const parsedMonthly = parseNumber(monthly);

    /* —— cálculos —— */
    const totalMonths = termUnit === 'ANOS' ? parsedTerm * 12 : parsedTerm;
    const i = ratePeriod === 'ANUAL' ? parsedRate / 100 / 12 : parsedRate / 100;

    const factor      = Math.pow(1 + i, totalMonths);
    const principalFV = parsedInitial * factor;
    const contribFV   = i !== 0 ? parsedMonthly * (factor - 1) / i : parsedMonthly * totalMonths;

    const total     = principalFV + contribFV;
    const profit    = total - (parsedInitial + parsedMonthly * totalMonths);
    const taxValue  = profit * (parsedTax / 100);
    const netValue  = total - taxValue;
    const safeWithdraw = netValue * i;

    /* —— grava na nova tabela —— */
    const existing = await prisma.financialIndependence.findFirst({
      where: { userId },
    });

    

    const data = {
      userId,
      initial: parsedInitial,
      rate: parsedRate,
      ratePeriod,
      term: parsedTerm,
      termUnit,
      monthly: parsedMonthly,
      totalMonths,
      interestPerMonth: i,
      montantePrincipal: principalFV,
      tax: parsedTax,
      total,
      taxValue,
      netValue,
      safeWithdraw,
    };

    if (existing) {
      console.log('ssss2')
      await prisma.financialIndependence.update({
        where: { id: existing.id },
        data,
      });
    } else {
      console.log('ssss')
      await prisma.financialIndependence.create({ data });
    }

    res.json({ total, taxValue, netValue, safeWithdraw });
  } catch (err) {
    console.error('Erro em calcFinancialIndependence:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const getFinancialIndependence = async (
  req: Request<{ userId: string }>,  // Correto: apenas os params
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;

    console.log('sdsd2', userId, typeof userId);

   const record = await prisma.financialIndependence.findFirst({
  where: {
    userId: userId, // .trim() por segurança
  },
});

    console.log('sdsd3', record);

    if (!record) {
      res.status(404).json({ message: 'Nenhum cálculo encontrado para este usuário.' });
      return;
    }

    res.json(record);
  } catch (err) {
    console.error('Erro em getFinancialIndependence:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const deleteFinancialIndependence = async (
  req: Request<{ userId: string }>,
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;

    const deleted = await prisma.financialIndependence.deleteMany({
      where: { userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ message: 'Nenhum cálculo encontrado para excluir.' });
      return;
    }

    res.status(204).end(); // sem conteúdo
  } catch (err) {
    console.error('Erro em deleteCompoundInterest:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

export const getSpending = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    console.log('🟡 [getSpending] Buscando dados para userId:', userId);

    const plan = await prisma.spendingPlan.findUnique({
      where: { userId: userId.trim() },
    });

    if (!plan) {
      console.log('🟡 [getSpending] Nenhum plano encontrado para userId:', userId);
      res.json({ receitas: [], despesas: [], receitasReais: [], despesasReais: [] });
      return;
    }

    console.log('🟡 [getSpending] Plano encontrado no banco:', {
      hasReceitas: !!plan.receitas,
      hasDespesas: !!plan.despesas,
      hasReceitasReais: !!(plan as any).receitasReais,
      hasDespesasReais: !!(plan as any).despesasReais,
    });

    const rawReceitas = plan.receitas;
    const rawDespesas = plan.despesas;

    if (!Array.isArray(rawReceitas) || !Array.isArray(rawDespesas)) {
      throw new Error("Formato inesperado de receitas/despesas");
    }

    // <-- aqui o cast via unknown
    const receitas = rawReceitas as unknown as SpendingEntry[];
    const despesas = rawDespesas as unknown as SpendingEntry[];
    
    // Carregar dados realizados se existirem
    const rawReceitasReais = (plan as any).receitasReais;
    const rawDespesasReais = (plan as any).despesasReais;
    
    console.log('🟡 [getSpending] Dados realizados brutos:', {
      rawReceitasReaisType: typeof rawReceitasReais,
      rawReceitasReaisIsArray: Array.isArray(rawReceitasReais),
      rawReceitasReaisLength: Array.isArray(rawReceitasReais) ? rawReceitasReais.length : 'N/A',
      rawDespesasReaisType: typeof rawDespesasReais,
      rawDespesasReaisIsArray: Array.isArray(rawDespesasReais),
      rawDespesasReaisLength: Array.isArray(rawDespesasReais) ? rawDespesasReais.length : 'N/A',
    });
    
    const receitasReais = (Array.isArray(rawReceitasReais) 
      ? rawReceitasReais as unknown as SpendingEntry[] 
      : []) as SpendingEntry[];
    const despesasReais = (Array.isArray(rawDespesasReais) 
      ? rawDespesasReais as unknown as SpendingEntry[] 
      : []) as SpendingEntry[];

    console.log('🟡 [getSpending] Dados processados para retorno:', {
      receitasCount: receitas.length,
      despesasCount: despesas.length,
      receitasReaisCount: receitasReais.length,
      despesasReaisCount: despesasReais.length,
    });

    res.json({ receitas, despesas, receitasReais, despesasReais });
  } catch (err) {
    console.error('❌ [getSpending] Erro:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};





export const calcSpending = async (
  req: Request<{ userId: string }, {}, SpendingPlanType>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { receitas, despesas, receitasReais, despesasReais } = req.body;

    console.log('🔵 [calcSpending] Recebido request para userId:', userId);
    console.log('🔵 [calcSpending] Dados recebidos:', {
      receitasCount: receitas?.length || 0,
      despesasCount: despesas?.length || 0,
      receitasReaisCount: receitasReais?.length || 0,
      despesasReaisCount: despesasReais?.length || 0,
      receitasReaisDefined: receitasReais !== undefined,
      despesasReaisDefined: despesasReais !== undefined,
    });

    // Preparar dados para update - só incluir campos que foram enviados
    const updateData: Record<string, Prisma.InputJsonValue> = {};
    if (receitas !== undefined) {
      updateData.receitas = receitas as unknown as Prisma.InputJsonValue;
    }
    if (despesas !== undefined) {
      updateData.despesas = despesas as unknown as Prisma.InputJsonValue;
    }
    if (receitasReais !== undefined) {
      updateData.receitasReais = receitasReais.length > 0
        ? (receitasReais as unknown as Prisma.InputJsonValue)
        : ([] as unknown as Prisma.InputJsonValue);
      console.log('🔵 [calcSpending] receitasReais adicionado ao updateData:', receitasReais.length);
    } else {
      console.log('🔵 [calcSpending] receitasReais é undefined, não será atualizado');
    }
    if (despesasReais !== undefined) {
      updateData.despesasReais = despesasReais.length > 0
        ? (despesasReais as unknown as Prisma.InputJsonValue)
        : ([] as unknown as Prisma.InputJsonValue);
      console.log('🔵 [calcSpending] despesasReais adicionado ao updateData:', despesasReais.length);
    } else {
      console.log('🔵 [calcSpending] despesasReais é undefined, não será atualizado');
    }

    console.log('🔵 [calcSpending] updateData preparado:', {
      hasReceitas: 'receitas' in updateData,
      hasDespesas: 'despesas' in updateData,
      hasReceitasReais: 'receitasReais' in updateData,
      hasDespesasReais: 'despesasReais' in updateData,
    });

    const plan = await prisma.spendingPlan.upsert({
      where: { userId: userId.trim() },
      create: {
        userId: userId.trim(),
        receitas: (receitas ?? []) as unknown as Prisma.InputJsonValue,
        despesas: (despesas ?? []) as unknown as Prisma.InputJsonValue,
        receitasReais: (receitasReais ?? []) as unknown as Prisma.InputJsonValue,
        despesasReais: (despesasReais ?? []) as unknown as Prisma.InputJsonValue,
      },
      update: updateData,
    });

    console.log('🟢 [calcSpending] Dados salvos no banco:', {
      receitasCount: Array.isArray(plan.receitas) ? (plan.receitas as any[]).length : 0,
      despesasCount: Array.isArray(plan.despesas) ? (plan.despesas as any[]).length : 0,
      receitasReaisCount: plan.receitasReais && Array.isArray(plan.receitasReais) ? (plan.receitasReais as any[]).length : 0,
      despesasReaisCount: plan.despesasReais && Array.isArray(plan.despesasReais) ? (plan.despesasReais as any[]).length : 0,
      receitasReaisExists: !!plan.receitasReais,
      despesasReaisExists: !!plan.despesasReais,
    });

    res.json(plan);
  } catch (err) {
    console.error('❌ [calcSpending] Erro:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
};

