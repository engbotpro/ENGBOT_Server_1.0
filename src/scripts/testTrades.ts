import prisma from '../prismaClient';

async function testTrades() {
  try {
    console.log('🔍 Verificando trades no banco de dados...');

    // Buscar todos os trades
    const trades = await prisma.challengeTrade.findMany({
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log(`📊 Total de trades encontrados: ${trades.length}`);

    if (trades.length > 0) {
      console.log('\n📋 Detalhes dos trades:');
      trades.forEach((trade, index) => {
        console.log(`${index + 1}. Trade ID: ${trade.id}`);
        console.log(`   Desafio: ${trade.challenge.title} (${trade.challenge.status})`);
        console.log(`   Usuário: ${trade.user.name}`);
        console.log(`   Symbol: ${trade.symbol}`);
        console.log(`   Side: ${trade.side}`);
        console.log(`   Quantity: ${trade.quantity}`);
        console.log(`   Price: ${trade.price}`);
        console.log(`   Profit: ${trade.profit}`);
        console.log(`   Timestamp: ${trade.timestamp}`);
        console.log('---');
      });
    } else {
      console.log('❌ Nenhum trade encontrado no banco de dados');
    }

    // Verificar desafios ativos
    const activeChallenges = await prisma.challenge.findMany({
      where: { status: 'active' },
      include: {
        challenger: { select: { name: true } },
        challenged: { select: { name: true } }
      }
    });

    console.log(`\n🏆 Desafios ativos: ${activeChallenges.length}`);
    activeChallenges.forEach((challenge, index) => {
      console.log(`${index + 1}. ${challenge.title}`);
      console.log(`   Desafiante: ${challenge.challenger.name}`);
      console.log(`   Desafiado: ${challenge.challenged.name}`);
      console.log(`   Saldo Desafiante: ${challenge.challengerCurrentBalance}`);
      console.log(`   Saldo Desafiado: ${challenge.challengedCurrentBalance}`);
      console.log('---');
    });

  } catch (error) {
    console.error('❌ Erro ao verificar trades:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
testTrades(); 