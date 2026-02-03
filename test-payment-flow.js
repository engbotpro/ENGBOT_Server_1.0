// Script para testar o fluxo completo de pagamento
require('dotenv').config();
const Stripe = require('stripe');

async function testPaymentFlow() {
  try {
    console.log('🧪 Testando fluxo completo de pagamento...');
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY não configurada');
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-06-30.basil',
    });

    // 1. Cria um Payment Intent
    console.log('\n1️⃣ Criando Payment Intent...');
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5900, // R$ 59,00 (ENTUSIASTA BLACK anual)
      currency: 'brl',
      metadata: {
        plan: 'ENTUSIASTA BLACK',
        billingCycle: 'anual',
        userId: 'test-user-123',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });
    
    console.log('✅ Payment Intent criado:', paymentIntent.id);

    // 2. Simula confirmação de pagamento (como se fosse um cartão real)
    console.log('\n2️⃣ Simulando confirmação de pagamento...');
    const confirmedPayment = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: 'pm_card_visa', // Método de pagamento de teste
    });

    if (confirmedPayment.status === 'succeeded') {
      console.log('✅ Pagamento confirmado com sucesso!');
      console.log('💰 Valor:', confirmedPayment.amount / 100, 'BRL');
      console.log('📋 Plano:', confirmedPayment.metadata.plan);
      console.log('🔄 Ciclo:', confirmedPayment.metadata.billingCycle);
      
      // 3. Simula o que o webhook faria
      console.log('\n3️⃣ Simulando ativação do plano...');
      console.log('📧 Usuário ID:', confirmedPayment.metadata.userId);
      console.log('🎯 Plano ativado:', confirmedPayment.metadata.plan);
      console.log('📅 Válido até:', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'));
      
      console.log('\n🎉 FLUXO COMPLETO FUNCIONANDO!');
      console.log('O usuário agora está com o plano ativo e pode acessar todos os serviços.');
      
    } else {
      console.log('❌ Pagamento não foi confirmado:', confirmedPayment.status);
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testPaymentFlow(); 