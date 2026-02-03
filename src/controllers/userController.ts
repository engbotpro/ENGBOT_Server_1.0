import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendConfirmationEmail } from "../services/emailSender";

// 🔹 Criar usuário
export const createUser = async (req: Request, res: Response) => {
  try {
    
    const { email, name, perfil, active, currentPlan, billingCycle } = req.body;  
    
    console.log('sds',req.body )
    
    const hashedPassword = await bcrypt.hash(email, 10);

    // Preparar dados do usuário
    const userData: any = {
      email,
      name,        
      password: hashedPassword,
      perfil,
      active: active,
    };

    // Incluir campos de plano se fornecidos
    if (currentPlan && currentPlan !== '' && currentPlan !== null) {
      userData.currentPlan = currentPlan;
      userData.billingCycle = billingCycle || 'mensal';
      userData.planActivatedAt = new Date();
      
      // Calcular data de expiração baseado no billingCycle
      if (userData.billingCycle === 'anual') {
        userData.planExpiresAt = new Date(userData.planActivatedAt.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano
      } else {
        userData.planExpiresAt = new Date(userData.planActivatedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 mês
      }
    }

    const user = await prisma.user.create({
      data: userData,
    });

    // Cria estatísticas de desafio com 1000 tokens
    await prisma.userChallengeStats.create({
      data: {
        userId: user.id,
        tokens: 1000,
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        totalProfit: 0,
        totalChallenges: 0,
        activeChallenges: 0,
        bestWinStreak: 0,
        currentStreak: 0,
        averageReturn: 0,
        bestReturn: 0,
        worstReturn: 0,
        autoAccept: false,
        minBetAmount: 10,
        maxBetAmount: 500
      }
    });

    res.status(201).json(user);
  } catch (error) {
    // Loga o erro completo
    console.error("[createUser] Erro ao criar usuário:", error);
    res.status(400).json({ error: "Erro ao criar usuário" });
  }
};


export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, name, perfil, active, password } = req.body;

    // 0) Verifica se já existe
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    }

    // 1) Cria usuário não confirmado
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        perfil,
        active,
        primeiroAcesso: false,
        confirmed: false,
      },
    });

    // 2) Cria estatísticas de desafio com 1000 tokens
    await prisma.userChallengeStats.create({
      data: {
        userId: user.id,
        tokens: 1000,
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        totalProfit: 0,
        totalChallenges: 0,
        activeChallenges: 0,
        bestWinStreak: 0,
        currentStreak: 0,
        averageReturn: 0,
        bestReturn: 0,
        worstReturn: 0,
        autoAccept: false,
        minBetAmount: 10,
        maxBetAmount: 500
      }
    });

    // 2) Gera token JWT de confirmação
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "24h",
    });

    // 3) Armazena token no usuário
    await prisma.user.update({
      where: { id: user.id },
      data: { confirmToken: token },
    });

    // 4) Envia e-mail de confirmação
    await sendConfirmationEmail(email, token);

    // 5) Responde 201
    res
      .status(201)
      .json({ message: "Cadastro realizado. Confira seu e-mail para confirmar." });
  } catch (error: any) {
    console.error("[register] erro:", error);
    // Se quiser, encaminhe para um handler de erro central:
    // return next(error);
    res.status(500).json({ error: "Não foi possível cadastrar usuário." });
  }
};


// 🔹 Listar todos os usuários
export const getUsers = async (_req: Request, res: Response) => {
  console.log('users')
  try {
    const users = await prisma.user.findMany();
    console.log(users)
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
};

// 🔹 Atualizar usuário
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, perfil, active, password, currentPlan, billingCycle, planActivatedAt, planExpiresAt } = req.body;

    let pw = password;
    

    if (pw === "C@sop") {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      });
      res.json(user);
    } else {
      // Buscar usuário existente para verificar valores atuais
      const existingUser = await prisma.user.findUnique({ 
        where: { id },
        select: { 
          currentPlan: true,
          billingCycle: true,
          planActivatedAt: true,
          planExpiresAt: true
        }
      });

      // Preparar dados de atualização
      const updateData: any = { name, perfil, email, active };
      
      // Incluir campos de plano se fornecidos
      if (currentPlan !== undefined) {
        const newPlan = currentPlan || null;
        const oldPlan = existingUser?.currentPlan || null;
        
        // Se o plano foi removido (null), limpar campos relacionados
        if (newPlan === null || newPlan === '') {
          updateData.currentPlan = null;
          updateData.billingCycle = null;
          updateData.planActivatedAt = null;
          updateData.planExpiresAt = null;
        } else {
          // Se um plano foi definido
          updateData.currentPlan = newPlan;
          
          // Verificar se o plano mudou
          const planChanged = oldPlan !== newPlan;
          
          // Definir billingCycle
          if (billingCycle !== undefined) {
            updateData.billingCycle = billingCycle;
          } else if (planChanged) {
            // Se o plano mudou e não foi fornecido billingCycle, usar 'mensal' como padrão
            updateData.billingCycle = 'mensal';
          } else {
            // Manter o billingCycle existente ou usar 'mensal' como padrão
            updateData.billingCycle = existingUser?.billingCycle || 'mensal';
          }
          
          // Definir planActivatedAt
          if (planActivatedAt !== undefined) {
            updateData.planActivatedAt = planActivatedAt ? new Date(planActivatedAt) : null;
          } else if (planChanged || !existingUser?.planActivatedAt) {
            // Se o plano mudou ou não há data de ativação, definir como agora
            updateData.planActivatedAt = new Date();
          }
          // Se não mudou e já existe, manter o existente (não incluir no updateData)
          
          // Definir planExpiresAt
          if (planExpiresAt !== undefined) {
            updateData.planExpiresAt = planExpiresAt ? new Date(planExpiresAt) : null;
          } else {
            // Calcular baseado no billingCycle e data de ativação
            const finalBillingCycle = updateData.billingCycle || existingUser?.billingCycle || 'mensal';
            const activationDate = updateData.planActivatedAt || existingUser?.planActivatedAt || new Date();
            
            if (finalBillingCycle === 'anual') {
              updateData.planExpiresAt = new Date(activationDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano
            } else {
              updateData.planExpiresAt = new Date(activationDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 mês
            }
          }
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
      });   
      
      res.json(user);
    }
  } catch (error) {
    console.error("[updateUser] Erro ao atualizar usuário:", error);
    res.status(400).json({ error: "Erro ao atualizar usuário" });
  }
};

// 🔹 Excluir usuário
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ message: "Usuário deletado com sucesso" });
  } catch (error) {
    res.status(400).json({ error: "Erro ao deletar usuário" });
  }
};

// 🔹 Buscar estatísticas do dashboard
export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    // Total de usuários
    const totalUsers = await prisma.user.count();
    
    // Usuários com planos ativos (assinantes)
    const subscribers = await prisma.user.count({
      where: {
        currentPlan: {
          not: null
        },
        planExpiresAt: {
          gte: new Date()
        }
      }
    });

    // Distribuição por planos
    const planDistribution = await prisma.user.groupBy({
      by: ['currentPlan'],
      where: {
        currentPlan: {
          not: null
        },
        planExpiresAt: {
          gte: new Date()
        }
      },
      _count: {
        currentPlan: true
      }
    });

    // Calcular receita mensal baseada nos planos
    const planPrices = {
      'Básico': 29.90,
      'Pro': 59.90,
      'Premium': 99.90
    };

    let monthlyRevenue = 0;
    const planDetails = planDistribution.map(plan => {
      const planName = plan.currentPlan || 'Sem plano';
      const count = plan._count.currentPlan;
      const price = planPrices[planName as keyof typeof planPrices] || 0;
      const revenue = count * price;
      monthlyRevenue += revenue;
      
      return {
        plan: planName,
        count,
        price,
        revenue
      };
    });

    res.json({
      totalUsers,
      subscribers,
      monthlyRevenue,
      planDetails
    });
  } catch (error) {
    console.error("[getDashboardStats] Erro ao buscar estatísticas:", error);
    res.status(500).json({ error: "Erro ao buscar estatísticas do dashboard" });
  }
};

// 🔹 Buscar histórico de planos do usuário
export const getUserPlanHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const planHistory = await prisma.planHistory.findMany({
      where: {
        userId: userId
      },
      orderBy: {
        date: 'desc'
      }
    });

    res.json(planHistory);
  } catch (error) {
    console.error("[getUserPlanHistory] Erro ao buscar histórico de planos:", error);
    res.status(500).json({ error: "Erro ao buscar histórico de planos" });
  }
};

export const confirmEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string")
      return res.status(400).json({ error: "Token ausente." });

    // 1) Decodifica e verifica validade
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    // 2) Busca o usuário e compara token salvo (opcional)
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.confirmToken !== token)
      return res.status(400).json({ error: "Token inválido ou expirado." });

    // 3) Marca como confirmado e limpa o token
    await prisma.user.update({
      where: { id: user.id },
      data: { confirmed: true, confirmToken: null },
    });

    // 4) Pode redirecionar para uma página de sucesso ou enviar JSON
    res.json({ message: "E-mail confirmado com sucesso!" });
  } catch (err: any) {
    console.error("[confirmEmail] erro:", err);
    res.status(400).json({ error: "Token inválido ou expirado." });
  }
};

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

// 🔹 Aceitar termos de uso
export const acceptTerms = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        termsAccepted: true,
        termsAcceptedAt: new Date()
      }
    });

    res.json({ 
      message: 'Termos aceitos com sucesso',
      termsAccepted: true,
      termsAcceptedAt: new Date()
    });
  } catch (error) {
    console.error('[acceptTerms] Erro ao aceitar termos:', error);
    res.status(500).json({ error: 'Erro ao aceitar termos' });
  }
};

// 🔹 Verificar se os termos foram aceitos
export const checkTermsAccepted = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        termsAccepted: true,
        termsAcceptedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      termsAccepted: user.termsAccepted || false,
      termsAcceptedAt: user.termsAcceptedAt
    });
  } catch (error) {
    console.error('[checkTermsAccepted] Erro ao verificar termos:', error);
    res.status(500).json({ error: 'Erro ao verificar termos' });
  }
};