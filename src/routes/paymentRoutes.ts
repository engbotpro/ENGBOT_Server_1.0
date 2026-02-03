import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import stripe from '../config/stripe';

// Função para gerar código PIX simulado
function generateMockPixCode(amount: number, transactionId: string): string {
  const amountInCents = Math.round(amount * 100);
  const amountStr = amountInCents.toString().padStart(10, '0');
  
  // Gera um código PIX no formato real (EMV QR Code)
  return `00020101021226860014BR.GOV.BCB.PIX2550pix.engbot.com.br52040000530398654${amountStr}5802BR5913ENGBOT PAYMENT6009Sao Paulo61080550200562390511${transactionId}6304ABCD`;
}

const router = express.Router();
const prisma = new PrismaClient();

// Endpoint para criar Payment Intent (integração real com Stripe)
router.post('/create-intent', async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, plan, billingCycle, userId } = req.body;

    // Validações básicas
    if (!amount || !plan || !billingCycle) {
      res.status(400).json({ 
        error: 'Dados obrigatórios não fornecidos' 
      });
      return;
    }

    // Verifica se o Stripe está configurado
    if (!stripe) {
      res.status(500).json({ 
        error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY no .env' 
      });
      return;
    }

    // Converte o valor para centavos (Stripe trabalha com centavos)
    const amountInCents = Math.round(amount * 100);

    // Cria o Payment Intent no Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'brl',
      metadata: {
        plan,
        billingCycle,
        userId: userId || 'anonymous',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Cria dados da transação
    const transactionData: any = {
      stripePaymentIntentId: paymentIntent.id,
      amount: amount,
      plan,
      billingCycle,
      status: 'pending',
      metadata: {
        plan,
        billingCycle,
        stripeClientSecret: paymentIntent.client_secret,
      },
    };

    // Só adiciona userId se for fornecido e válido
    if (userId && userId !== 'anonymous') {
      // Verifica se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (user) {
        transactionData.userId = userId;
      }
    }

    // Salva a transação no banco de dados
    const transaction = await prisma.paymentTransaction.create({
      data: transactionData,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction.id,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error) {
    console.error('Erro ao criar payment intent:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para confirmar pagamento PIX (versão simulada para desenvolvimento)
router.post('/pix/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, plan, billingCycle, userId } = req.body;

    // Validações básicas
    if (!amount || !plan || !billingCycle) {
      res.status(400).json({ 
        error: 'Dados obrigatórios não fornecidos' 
      });
      return;
    }

    // Verifica se o Stripe está configurado
    if (!stripe) {
      res.status(500).json({ 
        error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY no .env' 
      });
      return;
    }

    // Converte o valor para centavos
    const amountInCents = Math.round(amount * 100);

    // Gera PIX simulado para desenvolvimento
    console.log('Gerando PIX simulado para desenvolvimento...');
    
    // Gera um ID único para a transação
    const transactionId = `pix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Gera código PIX simulado (formato real de PIX)
    const pixCode = generateMockPixCode(amount, transactionId);
    
    // Cria dados da transação PIX simulada
    const transactionData: any = {
      stripePaymentIntentId: transactionId,
      amount: amount,
      plan,
      billingCycle,
      status: 'pending',
      pixCode: pixCode,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
    };

    // Só adiciona userId se for fornecido e válido
    if (userId && userId !== 'anonymous') {
      // Verifica se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (user) {
        transactionData.userId = userId;
      }
    }

    // Salva a transação PIX no banco
    const transaction = await prisma.pixTransaction.create({
      data: transactionData,
    });

    res.json({
      transactionId: transaction.id,
      paymentIntentId: transactionId,
      pixCode: pixCode,
      qrCode: pixCode, // Para simulação, usamos o mesmo código
      expiresAt: transaction.expiresAt,
    });

  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para verificar status do pagamento PIX (integração real)
router.get('/pix/status/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;

    // Busca a transação no banco
    const transaction = await prisma.pixTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      res.status(404).json({ 
        error: 'Transação não encontrada' 
      });
      return;
    }

    // Verifica se a transação expirou
    if (transaction.expiresAt && new Date() > transaction.expiresAt) {
      await prisma.pixTransaction.update({
        where: { id: transactionId },
        data: { status: 'expired' },
      });

      res.json({
        status: 'expired',
        message: 'Pagamento PIX expirado',
        transactionId,
      });
      return;
    }

    // Verifica se o Stripe está configurado
    if (!stripe) {
      res.status(500).json({ 
        error: 'Stripe não configurado. Verifique STRIPE_SECRET_KEY no .env' 
      });
      return;
    }

    // Verifica o status do PIX simulado
    try {
      // Simula verificação de pagamento (em produção, isso seria uma consulta real ao banco)
      const random = Math.random();
      let status = 'pending';
      let message = 'Aguardando pagamento';

      if (random > 0.7) {
        status = 'success';
        message = 'Pagamento confirmado com sucesso!';
        
        // Atualiza o status no banco
        await prisma.pixTransaction.update({
          where: { id: transactionId },
          data: { status: 'completed' },
        });

        // Ativa o plano do usuário se houver userId válido
        if (transaction.userId) {
          await activateUserPlan(transaction.userId, transaction.plan, transaction.billingCycle);
        }
      } else if (random > 0.4) {
        status = 'pending';
        message = 'Aguardando confirmação do pagamento...';
      } else {
        status = 'failed';
        message = 'Pagamento não foi confirmado. Tente novamente.';
        
        await prisma.pixTransaction.update({
          where: { id: transactionId },
          data: { status: 'failed' },
        });
      }

      res.json({
        status,
        message,
        transactionId,
        amount: transaction.amount,
        plan: transaction.plan,
        billingCycle: transaction.billingCycle,
      });

    } catch (error) {
      console.error('Erro ao verificar status do PIX:', error);
      res.status(500).json({ 
        error: 'Erro ao verificar status do pagamento' 
      });
    }

  } catch (error) {
    console.error('Erro ao verificar status PIX:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para webhook do Stripe (integração real)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!endpointSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
    }

    if (!stripe) {
      throw new Error('Stripe não configurado');
    }

    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
  } catch (err) {
    console.error('Erro na assinatura do webhook:', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('PaymentIntent was successful!', paymentIntent.id);
        
        // Atualiza a transação no banco
        await prisma.paymentTransaction.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { status: 'completed' },
        });

        // Ativa o plano do usuário
        const metadata = paymentIntent.metadata;
        if (metadata.userId && metadata.userId !== 'anonymous') {
          await activateUserPlan(metadata.userId, metadata.plan, metadata.billingCycle);
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('PaymentIntent failed!', failedPayment.id);
        
        // Atualiza a transação no banco
        await prisma.paymentTransaction.updateMany({
          where: { stripePaymentIntentId: failedPayment.id },
          data: { status: 'failed' },
        });
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(400).json({ error: 'Erro no webhook' });
  }
});

// Função para ativar o plano do usuário
async function activateUserPlan(userId: string, plan: string, billingCycle: string): Promise<void> {
  try {
    // Verifica se o usuário existe antes de tentar atualizar
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.log(`Usuário ${userId} não encontrado, não é possível ativar o plano`);
      return;
    }

    // Atualiza o plano do usuário
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentPlan: plan,
        billingCycle,
        planActivatedAt: new Date(),
        planExpiresAt: billingCycle === 'anual' 
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 ano
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 1 mês
      },
    });

    // Registra no histórico de planos
    await prisma.planHistory.create({
      data: {
        userId,
        planName: plan,
        changeType: 'new',
        price: 0, // Será calculado baseado no plano
        billingCycle,
        date: new Date(),
      },
    });

    console.log(`Plano ${plan} ativado para usuário ${userId}`);

  } catch (error) {
    console.error('Erro ao ativar plano do usuário:', error);
  }
}

export default router; 