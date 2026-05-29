import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prismaClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendConfirmationEmail } from "../services/emailSender";
import { generateUniqueReferralCode, getReferralInfo as fetchReferralInfo, applyReferralCode as applyReferral, dismissReferralPrompt as dismissReferral, ReferralError } from "../services/referralService";

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

    const referralCode = await generateUniqueReferralCode();
    userData.referralCode = referralCode;

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

    // Cria carteira virtual com $10.000 USDT inicial
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: "virtual",
        symbol: "USDT",
        name: "Tether USD",
        balance: 10000,
        value: 10000
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
    const body = req.body || {};
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password;
    const passwordConfirm = body.passwordConfirm ?? body.confirmPassword;
    const name = (body.name || email.split("@")[0] || "Usuário").trim();

    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Senha é obrigatória." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }
    if (passwordConfirm !== undefined && password !== passwordConfirm) {
      return res.status(400).json({ error: "As senhas não coincidem." });
    }

    // 0) Verifica se já existe
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    }

    // 1) Cria usuário não confirmado
    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = await generateUniqueReferralCode();
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        perfil: "User",
        active: true,
        primeiroAcesso: true,
        confirmed: false,
        referralCode,
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

    // 3) Cria carteira virtual com $10.000 USDT inicial
    await prisma.wallet.create({
      data: {
        userId: user.id,
        type: "virtual",
        symbol: "USDT",
        name: "Tether USD",
        balance: 10000,
        value: 10000
      }
    });

    // 4) Gera token JWT de confirmação
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "24h",
    });

    // 5) Armazena token no usuário
    await prisma.user.update({
      where: { id: user.id },
      data: { confirmToken: token },
    });

    // 6) Envia e-mail de confirmação (não bloqueia o cadastro se falhar)
    try {
      const protocol = (req.get("x-forwarded-proto") as string) || req.protocol || "https";
      const host = (req.get("x-forwarded-host") || req.get("host") || "").split(":")[0];
      // Se host for localhost, usar SERVER_URL (link do email deve ser acessível pelo usuário)
      const baseUrl = host && !/^localhost$|^127\.0\.0\.1$/i.test(host)
        ? `${protocol}://${req.get("x-forwarded-host") || req.get("host")}`
        : (process.env.SERVER_URL || process.env.BACKEND_URL || process.env.API_URL) || undefined;
      await sendConfirmationEmail(email, token, baseUrl);
    } catch (emailErr: any) {
      console.error("[register] Erro ao enviar e-mail de confirmação:", emailErr);
      // Usuário já foi criado; retorna sucesso com mensagem alternativa
      return res.status(201).json({
        message: "Cadastro realizado. Não foi possível enviar o e-mail de confirmação automaticamente. Entre em contato pelo 'Fale com a EngBot' para solicitar a confirmação.",
        emailNotSent: true,
      });
    }

    // 7) Responde 201
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

// 🔹 Excluir usuário (remove manualmente dados associados via SQL - banco em produção não tem CASCADE)
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log("[deleteUser] Iniciando exclusão do usuário:", id);
  try {
    await prisma.$transaction(async (tx) => {
      const del = (table: string) => tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE "userId" = ${id}`);
      await del('"ChallengeTrade"');
      await del('"TokenTransaction"');
      await tx.$executeRaw(Prisma.sql`DELETE FROM "Challenge" WHERE "challengerId" = ${id} OR "challengedId" = ${id} OR "winnerId" = ${id} OR "loserId" = ${id}`);
      await del('"Trade"');
      await del('"PendingOrder"');
      await del('"Backtest"');
      await del('"CapitalSimulationInvestment"');
      await del('"CapitalInvestment"');
      await del('"ExpenseType"');
      await del('"BitcoinTransaction"');
      await del('"TesterRequest"');
      await del('"ChatMessage"');
      await del('"UserFeedback"');
      await del('"Bot"');
      await del('"Wallet"');
      await del('"UserChallengeStats"');
      await del('"PlanHistory"');
      await del('"PixTransaction"');
      await del('"PaymentTransaction"');
      await del('"TechnicalIndicator"');
      await del('"SpendingPlan"');
      await del('"FinancialIndependence"');
      await del('"CompoundInterest"');
      await tx.user.delete({ where: { id } });
    });
    console.log("[deleteUser] Usuário deletado com sucesso:", id);
    res.json({ message: "Usuário deletado com sucesso" });
  } catch (error: any) {
    console.error("[deleteUser] Erro:", error?.message);
    const code = error?.code;
    if (code === "P2025") {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }
    res.status(400).json({ error: "Erro ao deletar usuário." });
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

export const resendConfirmationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    const emailStr = (email || "").trim().toLowerCase();
    if (!emailStr) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    const user = await prisma.user.findUnique({ where: { email: emailStr } });
    if (!user) {
      return res.status(404).json({ error: "E-mail não encontrado." });
    }
    if (!user.confirmToken) {
      return res.status(400).json({ error: "Esta conta já está confirmada. Faça login." });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: "24h" });
    await prisma.user.update({
      where: { id: user.id },
      data: { confirmToken: token },
    });

    try {
      const protocol = (req.get("x-forwarded-proto") as string) || req.protocol || "https";
      const host = (req.get("x-forwarded-host") || req.get("host") || "").split(":")[0];
      const baseUrl = host && !/^localhost$|^127\.0\.0\.1$/i.test(host)
        ? `${protocol}://${req.get("x-forwarded-host") || req.get("host")}`
        : (process.env.SERVER_URL || process.env.BACKEND_URL || process.env.API_URL) || undefined;
      await sendConfirmationEmail(emailStr, token, baseUrl);
    } catch (emailErr: any) {
      console.error("[resendConfirmation] Erro ao enviar e-mail:", emailErr);
      return res.status(500).json({ error: "Não foi possível enviar o e-mail. Tente novamente mais tarde." });
    }

    res.status(200).json({ message: "E-mail de confirmação reenviado. Verifique sua caixa de entrada e spam." });
  } catch (err: any) {
    console.error("[resendConfirmation] erro:", err);
    res.status(500).json({ error: "Erro ao processar solicitação." });
  }
};

export const confirmEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).send(
        "<html><body><p>Token ausente.</p></body></html>"
      );
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.confirmToken !== token) {
      return res.status(400).send(
        "<html><body><p>Token inválido ou expirado. Solicite um novo e-mail de confirmação.</p></body></html>"
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { confirmed: true, confirmToken: null },
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>E-mail confirmado</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#0A1419;color:#eee;">
  <h1 style="color:#39FF14;">E-mail confirmado!</h1>
  <p>Sua conta foi ativada. Você já pode fazer login no app.</p>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err: any) {
    console.error("[confirmEmail] erro:", err);
    res.status(400).send(
      "<html><body><p>Token inválido ou expirado.</p></body></html>"
    );
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

export const getReferralInfo = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const info = await fetchReferralInfo(userId);
    res.json(info);
  } catch (error) {
    if (error instanceof ReferralError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[getReferralInfo] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar indicações' });
  }
};

export const applyReferralCodeHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Código de indicação é obrigatório.' });
    }

    const result = await applyReferral(userId, code);
    const info = await fetchReferralInfo(userId);

    res.json({
      message: 'Código de indicação aplicado com sucesso.',
      result,
      ...info,
    });
  } catch (error) {
    if (error instanceof ReferralError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[applyReferralCode] Erro:', error);
    res.status(500).json({ error: 'Erro ao aplicar código' });
  }
};

export const dismissReferralPromptHandler = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    await dismissReferral(userId);
    res.json({ message: 'Prompt de indicação dispensado.', referralPromptSeen: true });
  } catch (error) {
    console.error('[dismissReferralPrompt] Erro:', error);
    res.status(500).json({ error: 'Erro ao dispensar prompt de indicação' });
  }
};