const fetch = require('node-fetch');

async function testAPI() {
  try {
    console.log('🔍 Testando API de trades...');
    
    // Simular token de autenticação (você precisa substituir por um token válido)
    const token = 'seu-token-aqui';
    
    // Testar GET /api/trades
    console.log('📊 Testando GET /api/trades...');
    const response = await fetch('http://localhost:5000/api/trades', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Dados recebidos:', data);
    } else {
      const error = await response.text();
      console.log('❌ Erro:', error);
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar API:', error);
  }
}

testAPI(); 