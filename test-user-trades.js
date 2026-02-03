const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testUserTrades() {
  try {
    console.log('🔍 Testando trades do usuário...');
    
    // Buscar todos os trades (simulando a API)
    const allTrades = await prisma.trade.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📊 Total de trades encontrados: ${allTrades.length}`);
    
    // Simular o filtro que o frontend faz
    const openTrades = allTrades.filter(trade => 
      trade.status === 'open' && trade.environment === 'simulated'
    );
    
    console.log(`📈 Trades abertos simulados: ${openTrades.length}`);
    openTrades.forEach((trade, index) => {
      console.log(`  ${index + 1}. ${trade.symbol} ${trade.side} ${trade.quantity} @ ${trade.price} (${trade.environment})`);
    });
    
    // Verificar se há trades duplicados por símbolo
    const symbols = openTrades.map(t => t.symbol);
    const uniqueSymbols = [...new Set(symbols)];
    console.log(`🔍 Símbolos únicos: ${uniqueSymbols.length}`);
    console.log(`🔍 Símbolos: ${uniqueSymbols.join(', ')}`);
    
    // Verificar se há trades do mesmo símbolo
    const tradesBySymbol = {};
    openTrades.forEach(trade => {
      if (!tradesBySymbol[trade.symbol]) {
        tradesBySymbol[trade.symbol] = [];
      }
      tradesBySymbol[trade.symbol].push(trade);
    });
    
    console.log('📊 Trades por símbolo:');
    Object.entries(tradesBySymbol).forEach(([symbol, trades]) => {
      console.log(`  ${symbol}: ${trades.length} trades`);
      trades.forEach(trade => {
        console.log(`    - ${trade.side} ${trade.quantity} @ ${trade.price}`);
      });
    });
    
  } catch (error) {
    console.error('❌ Erro ao testar trades do usuário:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testUserTrades(); 