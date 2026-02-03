const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testUpdateTrade() {
  try {
    console.log('🔍 Testando atualização de trade...');
    
    // Buscar um trade aberto para testar
    const openTrade = await prisma.trade.findFirst({
      where: {
        status: 'open',
        environment: 'simulated'
      }
    });
    
    if (!openTrade) {
      console.log('❌ Nenhum trade aberto encontrado');
      return;
    }
    
    console.log('📊 Trade encontrado:', {
      id: openTrade.id,
      symbol: openTrade.symbol,
      side: openTrade.side,
      price: openTrade.price,
      status: openTrade.status
    });
    
    // Simular fechamento do trade
    const currentPrice = 117000; // Preço atual simulado
    const pnl = openTrade.side === 'buy' 
      ? (currentPrice - openTrade.price) * openTrade.quantity
      : (openTrade.price - currentPrice) * openTrade.quantity;
    
    const pnlPercent = (pnl / (openTrade.price * openTrade.quantity)) * 100;
    
    console.log('💰 PnL calculado:', { pnl, pnlPercent, currentPrice });
    
    // Atualizar o trade
    const updatedTrade = await prisma.trade.update({
      where: {
        id: openTrade.id
      },
      data: {
        status: 'closed',
        exitTime: new Date(),
        exitPrice: currentPrice,
        pnl: pnl,
        pnlPercent: pnlPercent,
        fees: 0.1
      }
    });
    
    console.log('✅ Trade atualizado com sucesso:', {
      id: updatedTrade.id,
      symbol: updatedTrade.symbol,
      status: updatedTrade.status,
      pnl: updatedTrade.pnl,
      exitPrice: updatedTrade.exitPrice
    });
    
  } catch (error) {
    console.error('❌ Erro ao testar atualização:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testUpdateTrade(); 