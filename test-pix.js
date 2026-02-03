// Script para testar geração de PIX
require('dotenv').config();
const Stripe = require('stripe');

async function testPixGeneration() {
  try {
    console.log('🧪 Testando geração de PIX...');
    
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY não configurada');
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-06-30.basil',
    });

    // Testa criação de Payment Intent PIX
    console.log('\n1️⃣ Criando Payment Intent PIX...');
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5900, // R$ 59,00
      currency: 'brl',
      payment_method_types: ['pix'],
      metadata: {
        plan: 'ENTUSIASTA BLACK',
        billingCycle: 'anual',
        userId: 'test-user-123',
      },
    });
    
    console.log('✅ Payment Intent PIX criado:', paymentIntent.id);
    console.log('📊 Status:', paymentIntent.status);
    console.log('💰 Valor:', paymentIntent.amount / 100, 'BRL');

    // Verifica se o PIX foi gerado
    if (paymentIntent.next_action?.pix_display_qr_code) {
      console.log('\n🎉 PIX GERADO COM SUCESSO!');
      console.log('📱 QR Code URL:', paymentIntent.next_action.pix_display_qr_code.image_url_png);
      console.log('📋 Código PIX disponível');
      
      // Verifica se há código PIX copia e cola
      if (paymentIntent.next_action.pix_display_qr_code.image_url_png) {
        console.log('✅ QR Code gerado corretamente');
      }
      
    } else {
      console.log('\n❌ PIX NÃO FOI GERADO');
      console.log('🔍 Payment Intent completo:', JSON.stringify(paymentIntent, null, 2));
      console.log('\n💡 Possíveis causas:');
      console.log('   - PIX não está habilitado na conta Stripe');
      console.log('   - Conta não está configurada para Brasil');
      console.log('   - PIX está em modo de preview');
    }

  } catch (error) {
    console.error('❌ Erro ao testar PIX:', error.message);
    
    if (error.type === 'StripeInvalidRequestError') {
      console.log('\n💡 Dicas para resolver:');
      console.log('1. Acesse: https://dashboard.stripe.com/settings/payment_methods');
      console.log('2. Procure por "PIX" e habilite');
      console.log('3. Verifique se sua conta está configurada para Brasil');
    }
  }
}

testPixGeneration(); 