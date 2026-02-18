// src/services/passportGoogle.ts
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import prisma from "../prismaClient";
import jwt from "jsonwebtoken";

// Só configura o Google OAuth se as credenciais estiverem definidas
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('🔧 Configurando Google OAuth Strategy...');
  console.log('🔑 GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
  console.log('🔐 GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '***configurado***' : 'não configurado');
  
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/auth/google/callback`,
      },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        console.log('🔍 Google Strategy - Profile recebido:', {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value
        });
        
        // profile contém id, displayName, emails, photos
        const email = profile.emails?.[0]?.value;
        if (!email) {
          console.error('❌ Email não recebido do Google');
          return done(new Error("e-mail não recebido"));
        }
        
        console.log('👤 Buscando/criando usuário com email:', email);
        
        // Primeiro tenta buscar por googleId (se já existe conta Google)
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id }
        });
        
        if (user) {
          // Se encontrou por googleId, atualiza o nome se necessário
          if (user.name !== profile.displayName || user.email !== email) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                name: profile.displayName,
                email: email, // Atualiza email caso tenha mudado
              }
            });
          }
        } else {
          // Se não encontrou por googleId, tenta buscar/atualizar por email
          user = await prisma.user.upsert({
            where: { email },
            update: {
              name: profile.displayName,
              googleId: profile.id, // Vincula a conta Google ao usuário existente
              active: true,
            },
            create: {
              email,
              name: profile.displayName,
              googleId: profile.id,
              active: true,
              perfil: "usuario"
            },
          });
        }
        
        console.log('✅ Usuário processado com sucesso:', user.id);
        done(null, user);
      } catch (error) {
        console.error('❌ Erro no Google Strategy:', error);
        done(error);
      }
    }
  )
  );
  console.log('✅ Google OAuth Strategy configurado com sucesso');
} else {
  console.log('⚠️  Google OAuth não configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para habilitar.');
}
