import prisma from '../prismaClient';

async function testBotStats() {
  try {
    console.log('🔍 Verificando estatísticas dos bots...\n');

    // Buscar todos os bots
    const bots = await prisma.bot.findMany({
      include: {
        trades: true
      }
    });

    for (const bot of bots) {
      console.log(`\n📊 Bot: ${bot.name} (ID: ${bot.id})`);
      console.log(`   - Total de trades (campo): ${bot.totalTrades}`);
      console.log(`   - Trades reais no banco: ${bot.trades.length}`);
      console.log(`   - Trades abertos: ${bot.trades.filter(t => t.status === 'open').length}`);
      console.log(`   - Trades fechados: ${bot.trades.filter(t => t.status === 'closed').length}`);
      console.log(`   - Lucro líquido: ${bot.netProfit}`);
      console.log(`   - Win Rate: ${(bot.winRate * 100).toFixed(2)}%`);
      
      // Verificar se há trades sem botId
      const tradesWithoutBotId = await prisma.trade.findMany({
        where: {
          botName: bot.name,
          botId: null
        }
      });
      
      if (tradesWithoutBotId.length > 0) {
        console.log(`   ⚠️ ATENÇÃO: ${tradesWithoutBotId.length} trades encontrados com botName="${bot.name}" mas sem botId!`);
      }
    }

    // Verificar trades órfãos
    const orphanTrades = await prisma.trade.findMany({
      where: {
        tradeType: 'bot',
        botId: null
      }
    });

    if (orphanTrades.length > 0) {
      console.log(`\n⚠️ ATENÇÃO: ${orphanTrades.length} trades órfãos encontrados (tradeType='bot' mas botId=null)`);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar estatísticas:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBotStats();

