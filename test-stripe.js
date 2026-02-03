// Script para testar conexão com Stripe
require('dotenv').config();
const Stripe = require('stripe');

async function testStripeConnection() {
  try {
    console.log('🔍 Testando conexão com Stripe...');
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY não configurada no .env');
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-06-30.basil',
    });

    // Testa conexão básica
    const account = await stripe.accounts.retrieve();
    console.log('✅ Conexão com Stripe estabelecida!');
    console.log('📧 Email da conta:', account.email);
    console.log('🌍 País:', account.country);
    console.log('💰 Moedas suportadas:', account.default_currency);

    // Testa criação de Payment Intent
    console.log('\n🧪 Testando criação de Payment Intent...');
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // R$ 10,00
      currency: 'brl',
      metadata: {
        test: 'true',
      },
    });
    
    console.log('✅ Payment Intent criado com sucesso!');
    console.log('🆔 ID:', paymentIntent.id);
    console.log('💰 Valor:', paymentIntent.amount / 100, 'BRL');
    console.log('📊 Status:', paymentIntent.status);

    // Testa criação de Payment Intent PIX
    console.log('\n🧪 Testando criação de Payment Intent PIX...');
    const pixPaymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // R$ 10,00
      currency: 'brl',
      payment_method_types: ['pix'],
      metadata: {
        test: 'true',
        type: 'pix',
      },
    });
    
    console.log('✅ Payment Intent PIX criado com sucesso!');
    console.log('🆔 ID:', pixPaymentIntent.id);
    console.log('💰 Valor:', pixPaymentIntent.amount / 100, 'BRL');
    console.log('📊 Status:', pixPaymentIntent.status);
    
    if (pixPaymentIntent.next_action?.pix_display_qr_code) {
      console.log('📱 QR Code PIX disponível');
    }

    console.log('\n🎉 Todos os testes passaram! Stripe está configurado corretamente.');

  } catch (error) {
    console.error('❌ Erro ao testar Stripe:', error.message);
    
    if (error.type === 'StripeAuthenticationError') {
      console.error('💡 Verifique se STRIPE_SECRET_KEY está correta');
    } else if (error.type === 'StripeInvalidRequestError') {
      console.error('💡 Verifique se a conta Stripe está configurada para PIX');
    }
  }
}

testStripeConnection(); 