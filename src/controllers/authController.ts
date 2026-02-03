import { Request, Response } from "express";
import prisma from "../prismaClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import 'dotenv/config';



const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// 🔹 Login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    

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
      }
    });
    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado" });
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
    const isValid = await bcrypt.compare(password, user.password);
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
      { expiresIn: "1h" }
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
      { expiresIn: "12h" }
    );

    console.log('🎫 Token Google gerado:', token.substring(0, 50) + '...');
    console.log('✅ Google login bem-sucedido para:', user.email);

    // Verificar se é requisição mobile (via state parameter do OAuth)
    const state = req.query.state as string || '';
    const isMobile = state === 'mobile';

    let redirectUrl: string;
    if (isMobile) {
      // Deep link para mobile app
      redirectUrl = `engbotmobile://login-callback?googleToken=${encodeURIComponent(token)}`;
      console.log('📱 Detectado mobile - redirecionando para deep link');
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

