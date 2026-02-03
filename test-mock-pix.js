// Script para testar PIX simulado
require('dotenv').config();

// Função para gerar código PIX simulado
function generateMockPixCode(amount, transactionId) {
  const amountInCents = Math.round(amount * 100);
  const amountStr = amountInCents.toString().padStart(10, '0');
  
  return `00020101021226860014BR.GOV.BCB.PIX2550pix.engbot.com.br52040000530398654${amountStr}5802BR5913ENGBOT PAYMENT6009Sao Paulo61080550200562390511${transactionId}6304ABCD`;
}

async function testMockPix() {
  try {
    console.log('🧪 Testando PIX simulado...');
    
    const amount = 59.00; // R$ 59,00
    const transactionId = `pix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('\n1️⃣ Gerando código PIX simulado...');
    const pixCode = generateMockPixCode(amount, transactionId);
    
    console.log('✅ Código PIX gerado:', pixCode);
    console.log('📊 Comprimento:', pixCode.length, 'caracteres');
    console.log('💰 Valor:', amount, 'BRL');
    console.log('🆔 Transaction ID:', transactionId);
    
    console.log('\n2️⃣ Simulando verificação de status...');
    
    // Simula diferentes status
    for (let i = 0; i < 5; i++) {
      const random = Math.random();
      let status, message;
      
      if (random > 0.7) {
        status = 'success';
        message = 'Pagamento confirmado com sucesso!';
      } else if (random > 0.4) {
        status = 'pending';
        message = 'Aguardando confirmação...';
      } else {
        status = 'failed';
        message = 'Pagamento não confirmado';
      }
      
      console.log(`   Tentativa ${i + 1}: ${status} - ${message}`);
      
      if (status === 'success') {
        console.log('🎉 PAGAMENTO CONFIRMADO!');
        console.log('✅ Plano ativado automaticamente');
        break;
      }
      
      // Aguarda 2 segundos antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n📱 Para testar no frontend:');
    console.log('1. Vá para a aba de pagamentos');
    console.log('2. Selecione um plano');
    console.log('3. Escolha PIX');
    console.log('4. Clique em "Gerar Pagamento PIX"');
    console.log('5. Clique em "Já Paguei via Pix" várias vezes até confirmar');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testMockPix(); 