import { Request, Response } from "express";
import prisma from "../prismaClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import 'dotenv/config';



const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// 🔹 Login
export const login = async (req: Request, res: Response): Promise<void> => {
  console.log("[POST /auth/login] requisição recebida");
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: "Corpo da requisição inválido (envie JSON)" });
      return;
    }
    const email = body.email != null ? String(body.email).trim() : '';
    const password = body.password;
    if (!email) {
      res.status(400).json({ error: "Email ou usuário é obrigatório" });
      return;
    }
    if (password == null || (typeof password !== 'string' && typeof password !== 'number')) {
      res.status(400).json({ error: "Senha é obrigatória" });
      return;
    }
    const passwordStr = typeof password === 'string' ? password : String(password);

    /* ── procura usuário ───────────────────────────────── */
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        perfil: true,
        name: true,
        primeiroAcesso: true,
        currentPlan: true,
        billingCycle: true,
        planActivatedAt: true,
        planExpiresAt: true,
        confirmed: true,
        confirmToken: true,
      }
    });
    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado" });
      return;
    }

    // Só exige confirmação se ainda houver token pendente (cadastro novo não confirmado).
    // Usuários antigos (confirmToken null) podem fazer login normalmente.
    if (user.confirmToken != null && user.confirmToken !== '') {
      res.status(403).json({
        error: "Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.",
      });
      return;
    }

    /* ── se não há senha no banco (conta Google / social) ── */
    if (!user.password) {
      res
        .status(401)
        .json({ error: "Esta conta não possui senha local configurada." });
      return;
    }

    /* ── valida a senha ─────────────────────────────────── */
    const isValid = await bcrypt.compare(passwordStr, user.password);
    if (!isValid) {
      res.status(401).json({ error: "Senha incorreta" });
      return;
    }

    /* ── gera JWT ───────────────────────────────────────── */
    console.log('🔑 Gerando JWT para usuário:', user.id);
    console.log('🔐 JWT_SECRET:', JWT_SECRET);
    
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        perfil: user.perfil,
        name: user.name,
        currentPlan: user.currentPlan,
        billingCycle: user.billingCycle,
        planActivatedAt: user.planActivatedAt?.toISOString(),
        planExpiresAt: user.planExpiresAt?.toISOString(),
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    console.log('🎫 Token gerado:', token.substring(0, 50) + '...');
    console.log('✅ Login bem-sucedido para:', user.email);
    res.json({
      message: "Login bem-sucedido",
      token,
      primeiroAcesso: user.primeiroAcesso,
    });
  } catch (err) {
    console.error("Erro ao realizar login:", err);
    res.status(500).json({ error: "Erro ao realizar login" });
  }
};


// 🔹 Primeiro acesso (força mudança de senha)
export const firstAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    
    const { email, newpassword } = req.body;
    
    if (!newpassword || newpassword.length < 8) {
      res.status(400).json({ error: "A senha deve ter no mínimo 8 caracteres" });
      return;
    }
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
     
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
     
    if (!user.primeiroAcesso) {
      res.status(400).json({ error: "Usuário já alterou a senha" });
      return;
    }

    


    const hashedPassword = await bcrypt.hash(newpassword, 10);
    
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword, primeiroAcesso: false },
    });

    res.json({
      message: "Senha alterada com sucesso. Primeiro acesso concluído.",
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao alterar senha" });
  }
};

// 🔹 Alterar senha normal (autenticado)
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, newpw, newpwrep } = req.body;

    /* ─── validação básica ─── */
    if (!email || !password || !newpw || !newpwrep) {
      res.status(400).json({ error: "Campos obrigatórios ausentes" });
      return;
    }
    if (newpw.length < 8) {
      res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres" });
      return;
    }
    if (newpw !== newpwrep) {
      res.status(400).json({ error: "As senhas novas não coincidem" });
      return;
    }

    /* ─── busca usuário ─── */
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    /* ─── verifica se há senha local ─── */
    if (!user.password) {
      res
        .status(401)
        .json({ error: "Esta conta não possui senha local configurada." });
      return;
    }

    /* ─── confirma senha atual ─── */
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: "Senha atual incorreta" });
      return;
    }

    /* ─── grava nova senha ─── */
    const hashedPassword = await bcrypt.hash(newpw, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ error: "Erro ao alterar senha" });
  }
};


// Login com Google via ID Token (mobile - google_sign_in)
export const googleTokenLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "idToken é obrigatório" });
      return;
    }

    const webClientId = process.env.GOOGLE_CLIENT_ID;
    const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
    const audiences: string[] = [];
    if (webClientId) audiences.push(webClientId);
    if (androidClientId) audiences.push(androidClientId);
    if (audiences.length === 0) {
      console.error("GOOGLE_CLIENT_ID ou GOOGLE_ANDROID_CLIENT_ID não configurado");
      res.status(500).json({ error: "Login com Google não configurado" });
      return;
    }

    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: audiences,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      res.status(401).json({ error: "Token inválido ou expirado" });
      return;
    }

    const email = payload.email;
    const googleId = payload.sub;
    const name = payload.name || payload.email?.split("@")[0] || "Usuário";

    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      user = await prisma.user.upsert({
        where: { email },
        update: {
          name,
          googleId,
          active: true,
        },
        create: {
          email,
          name,
          googleId,
          active: true,
          perfil: "usuario",
        },
      });
    } else if (user.name !== name || user.email !== email) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, email },
      });
    }

    const hasStats = await prisma.userChallengeStats.findUnique({
      where: { userId: user.id },
    });
    if (!hasStats) {
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
          maxBetAmount: 500,
        },
      });
    }

    const hasVirtualWallet = await prisma.wallet.findUnique({
      where: {
        userId_type_symbol: { userId: user.id, type: "virtual", symbol: "USDT" },
      },
    });
    if (!hasVirtualWallet) {
      await prisma.wallet.create({
        data: {
          userId: user.id,
          type: "virtual",
          symbol: "USDT",
          name: "Tether USD",
          balance: 10000,
          value: 10000,
        },
      });
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        perfil: true,
        name: true,
        currentPlan: true,
        billingCycle: true,
        planActivatedAt: true,
        planExpiresAt: true,
      },
    });
    if (!fullUser) {
      res.status(500).json({ error: "Erro ao buscar usuário" });
      return;
    }

    const token = jwt.sign(
      {
        id: fullUser.id,
        email: fullUser.email,
        perfil: fullUser.perfil,
        name: fullUser.name,
        currentPlan: fullUser.currentPlan,
        billingCycle: fullUser.billingCycle,
        planActivatedAt: fullUser.planActivatedAt?.toISOString(),
        planExpiresAt: fullUser.planExpiresAt?.toISOString(),
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login bem-sucedido",
      token,
      primeiroAcesso: false,
    });
  } catch (err) {
    console.error("Erro no login Google (idToken):", err);
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
};

export const googleCallback = async (req: Request, res: Response) => {
  console.log('🔄 Google callback iniciado');
  console.log('👤 req.user:', req.user);
  
  const user = req.user as any;
  if (!user) {
    console.error('❌ Usuário não encontrado no req.user');
    res.redirect(`${process.env.FRONT_ORIGIN}/login?error=no_user`);
    return;
  }
  
  console.log('🔑 Google callback - Gerando JWT para usuário:', user.id);
  console.log('🔐 JWT_SECRET no Google callback:', process.env.JWT_SECRET);
  console.log('🌐 FRONT_ORIGIN:', process.env.FRONT_ORIGIN);
  
  try {
    // Buscar dados completos do usuário incluindo plano
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        perfil: true,
        name: true,
        currentPlan: true,
        billingCycle: true,
        planActivatedAt: true,
        planExpiresAt: true,
      }
    });

    if (!fullUser) {
      console.error('❌ Usuário não encontrado no banco de dados');
      res.redirect(`${process.env.FRONT_ORIGIN}/login?error=user_not_found`);
      return;
    }

    const token = jwt.sign(
      {
        id: fullUser.id,
        email: fullUser.email,
        perfil: fullUser.perfil,
        name: fullUser.name,
        currentPlan: fullUser.currentPlan,
        billingCycle: fullUser.billingCycle,
        planActivatedAt: fullUser.planActivatedAt?.toISOString(),
        planExpiresAt: fullUser.planExpiresAt?.toISOString(),
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    console.log('🎫 Token Google gerado:', token.substring(0, 50) + '...');
    console.log('✅ Google login bem-sucedido para:', user.email);

    // Verificar se é requisição mobile (via state parameter do OAuth)
    const state = req.query.state as string || '';
    const isMobile = state === 'mobile';

    let redirectUrl: string;
    if (isMobile) {
      // Página intermediária faz 302 para o deep link (Custom Tab segue e app captura)
      const serverUrl = process.env.SERVER_URL || 'https://engbot-server-1-0-546289259263.southamerica-east1.run.app';
      redirectUrl = `${serverUrl}/auth/google/mobile-done?googleToken=${encodeURIComponent(token)}`;
      console.log('📱 Detectado mobile - redirecionando para mobile-done');
    } else {
      // Redirect para web SPA
      redirectUrl = `${process.env.FRONT_ORIGIN}/login/google-redirect?googleToken=${encodeURIComponent(token)}`;
      console.log('🌐 Detectado web - redirecionando para SPA');
    }
    
    res.redirect(redirectUrl);
    console.log('🔄 Redirecionando para:', redirectUrl);
    
  } catch (error) {
    
    console.error('❌ Erro ao gerar token JWT:', error);
    res.redirect(`${process.env.FRONT_ORIGIN}/login?error=token_error`);
  }
};

