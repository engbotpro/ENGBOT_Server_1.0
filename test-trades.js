const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTrades() {
  try {
    console.log('🔍 Testando trades no banco de dados...');
    
    // Buscar todos os trades
    const allTrades = await prisma.trade.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📊 Total de trades encontrados: ${allTrades.length}`);
    
    // Mostrar trades abertos
    const openTrades = allTrades.filter(trade => trade.status === 'open');
    console.log(`📈 Trades abertos: ${openTrades.length}`);
    openTrades.forEach(trade => {
      console.log(`  - ${trade.symbol} ${trade.side} ${trade.quantity} @ ${trade.price} (${trade.environment})`);
    });
    
    // Mostrar trades fechados
    const closedTrades = allTrades.filter(trade => trade.status === 'closed');
    console.log(`📉 Trades fechados: ${closedTrades.length}`);
    closedTrades.forEach(trade => {
      console.log(`  - ${trade.symbol} ${trade.side} ${trade.quantity} @ ${trade.price} -> ${trade.exitPrice} PnL: ${trade.pnl}`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao testar trades:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTrades(); 