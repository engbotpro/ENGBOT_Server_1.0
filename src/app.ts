// src/app.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import http from "http";
import bcrypt from "bcryptjs";
import passport from "passport";

import "./services/passportGoogle";      // ← registra GoogleStrategy
import prisma from "./prismaClient";

import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import calculateRoutes from "./routes/calculateRoutes";
import technicalIndicatorRoutes from "./routes/technicalIndicatorRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import tradeRoutes from "./routes/tradeRoutes";
import challengeRoutes from "./routes/challengeRoutes";
import pendingOrderRoutes from "./routes/pendingOrderRoutes";
import walletRoutes from "./routes/walletRoutes";
import botRoutes from "./routes/botRoutes";
import testerRoutes from "./routes/testerRoutes";
import chatRoutes from "./routes/chatRoutes";
import platformSettingsRoutes from "./routes/platformSettingsRoutes";
import bitcoinTransactionRoutes from "./routes/bitcoinTransactionRoutes";
import expenseTypesRoutes from "./routes/expenseTypesRoutes";
import backtestRoutes from "./routes/backtestRoutes";
import { authenticateToken } from "./middleware/authMiddleware";

const PORT = Number(process.env.PORT) || 5000;
export const JWT_SECRET = process.env.JWT_SECRET ?? "supersecretkey";

async function ensureAdminUser() {
  const exists = await prisma.user.findFirst({ where: { email: "root" } });
  if (!exists) {
    const hashed = await bcrypt.hash("C@sop30", 10);
    await prisma.user.create({
      data: {
        email: "root",
        name: "Administrador",
        password: hashed,
        perfil: "Admin",
        active: true,
      },
    });
    console.log("👤 Usuário admin criado");
  }
}

async function ensureTokenTransactionTable() {
  try {
    // Verificar se a tabela existe tentando uma query simples
    await prisma.$executeRawUnsafe('SELECT 1 FROM "TokenTransaction" LIMIT 1');
    console.log("✅ Tabela TokenTransaction já existe");
  } catch (error: any) {
    // Se a tabela não existir, criar
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      console.log("🔧 Criando tabela TokenTransaction...");
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "TokenTransaction" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "amount" DOUBLE PRECISION NOT NULL,
            "balanceAfter" DOUBLE PRECISION NOT NULL,
            "challengeId" TEXT,
            "description" TEXT NOT NULL,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
          );
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "TokenTransaction_userId_idx" ON "TokenTransaction"("userId");
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "TokenTransaction_challengeId_idx" ON "TokenTransaction"("challengeId");
        `);
        
        // Adicionar foreign keys se não existirem
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "TokenTransaction" 
            ADD CONSTRAINT "TokenTransaction_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          `);
        } catch (e: any) {
          if (!e.message?.includes('already exists')) {
            console.log("⚠️ Foreign key userId já existe ou erro:", e.message);
          }
        }
        
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "TokenTransaction" 
            ADD CONSTRAINT "TokenTransaction_challengeId_fkey" 
            FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          `);
        } catch (e: any) {
          if (!e.message?.includes('already exists')) {
            console.log("⚠️ Foreign key challengeId já existe ou erro:", e.message);
          }
        }
        
        console.log("✅ Tabela TokenTransaction criada com sucesso!");
      } catch (createError: any) {
        console.error("❌ Erro ao criar tabela TokenTransaction:", createError.message);
      }
    } else {
      console.error("❌ Erro ao verificar tabela TokenTransaction:", error.message);
    }
  }
}

async function bootstrap() {
  try {
    const app = express();
    const server = http.createServer(app);

    /* ─────────── Middlewares ─────────── */
    app.use(
      cors({
        origin: (origin, callback) => {
          // Permitir requisições sem origin (mobile apps, Postman, etc)
          if (!origin) {
            return callback(null, true);
          }
          
          // Permitir todas as origens localhost em qualquer porta (desenvolvimento)
          if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
          }
          
          // Permitir origens configuradas no .env (trim para remover espaços)
          const allowedOrigins = (process.env.CORS_ORIGIN || "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
          if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          // Permitir Vercel preview/deploy URLs (engbot-client-1-0*.vercel.app)
          if (origin.endsWith(".vercel.app")) {
            return callback(null, true);
          }
          
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    /* Passport precisa ser inicializado antes das rotas que o usam  */
    app.use(passport.initialize());

    /* ─────────── Rotas ─────────── */
    // Health check sem DB - Cloud Run precisa disso para passar no startup
    app.get("/health", (_req: Request, res: Response) => {
      res.status(200).json({ status: "ok" });
    });

    app.get("/", (_req: Request, res: Response) => {
      
      res.send("Servidor Backend em TypeScript está rodando! 🚀");
    });

    app.use("/users", userRoutes);
    app.use("/auth", authRoutes); // contém /auth/google e /auth/google/callback
    app.use("/calculate", calculateRoutes); // Removido authenticateToken temporariamente
    app.use("/indicators", technicalIndicatorRoutes);
    app.use("/api/payments", paymentRoutes);
    app.use("/api/trades", tradeRoutes);
    app.use("/api/challenges", challengeRoutes);
    app.use("/api/pending-orders", pendingOrderRoutes);
    app.use("/api/wallets", walletRoutes);
    app.use("/api/bots", botRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/tester-requests", testerRoutes);
    app.use("/api/platform-settings", platformSettingsRoutes);
    app.use("/api/bitcoin-transactions", bitcoinTransactionRoutes);
    app.use("/api/expense-types", expenseTypesRoutes);
    app.use("/api/backtests", backtestRoutes);
  

    /* ─────────── Inicialização ─────────── */
    // Escutar na porta PRIMEIRO (Cloud Run exige isso no timeout)
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ API online: http://0.0.0.0:${PORT}`);
      // DB init em background para não bloquear o startup
      Promise.all([
        ensureAdminUser(),
        ensureTokenTransactionTable(),
      ]).catch((err) => {
        console.error("❌ Erro na inicialização do banco:", err?.message || err);
      });
    });

    // Iniciar serviço automático de trades para duelos de robôs
    // Executa a cada 2 minutos
    setInterval(async () => {
      try {
        const { BotDuelTradeService } = await import('./services/botDuelTradeService');
        await BotDuelTradeService.executeTradesForActiveDuels();
      } catch (error) {
        console.error('❌ Erro no serviço automático de trades para duelos:', error);
      }
    }, 2 * 60 * 1000); // 2 minutos

    // Iniciar serviço automático de trades para robôs ativos individuais
    // Executa a cada minuto para verificar todos os timeframes
    setInterval(async () => {
      try {
        const { BotTradeService } = await import('./services/botTradeService');
        await BotTradeService.executeTradesForActiveBots();
      } catch (error) {
        console.error('❌ Erro no serviço automático de trades para robôs:', error);
      }
    }, 60 * 1000); // 1 minuto - verifica todos os timeframes

    // Atualizar estatísticas de todos os bots periodicamente (a cada 5 minutos)
    // Isso garante que as estatísticas estejam sempre atualizadas, mesmo sem novos trades
    setInterval(async () => {
      try {
        const { BotTradeService } = await import('./services/botTradeService');
        await BotTradeService.updateAllBotsStatistics();
      } catch (error) {
        console.error('❌ Erro ao atualizar estatísticas de todos os bots:', error);
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Verificar transações Bitcoin pendentes automaticamente (a cada 5 minutos)
    setInterval(async () => {
      try {
        const { verifyPendingBitcoinTransactions } = await import('./services/bitcoinVerificationService');
        await verifyPendingBitcoinTransactions();
      } catch (error) {
        console.error('❌ Erro ao verificar transações Bitcoin:', error);
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Executar imediatamente ao iniciar
    setTimeout(async () => {
      try {
        const { BotDuelTradeService } = await import('./services/botDuelTradeService');
        await BotDuelTradeService.executeTradesForActiveDuels();
        
        const { BotTradeService } = await import('./services/botTradeService');
        await BotTradeService.executeTradesForActiveBots();
        
        // Atualizar estatísticas de todos os bots ao iniciar
        await BotTradeService.updateAllBotsStatistics();
      } catch (error) {
        console.error('❌ Erro ao executar trades iniciais:', error);
      }
    }, 5000); // Aguardar 5 segundos após iniciar

    /* ─────────── Encerramento gracioso ─────────── */
    const shutdown = async () => {
      console.log("\n⏳ Encerrando…");
      await prisma.$disconnect();
      server.close(() => {
        console.log("👋 Servidor fechado");
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error("❌ Erro de inicialização:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();

/* Exportar app facilita testes (supertest/vitest) */
export {};
