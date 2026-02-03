import prisma from '../prismaClient';

async function simulateTrade() {
  try {
    console.log('🎯 Simulando trade...');

    // Buscar um desafio ativo
    const activeChallenge = await prisma.challenge.findFirst({
      where: { status: 'active' },
      include: {
        challenger: { select: { id: true, name: true } },
        challenged: { select: { id: true, name: true } }
      }
    });

    if (!activeChallenge) {
      console.log('❌ Nenhum desafio ativo encontrado');
      return;
    }

    console.log(`📊 Desafio encontrado: ${activeChallenge.title}`);
    console.log(`👤 Desafiante: ${activeChallenge.challenger.name}`);
    console.log(`👤 Desafiado: ${activeChallenge.challenged.name}`);

    // Simular um trade
    const mockTrade = {
      challengeId: activeChallenge.id,
      userId: activeChallenge.challengerId,
      symbol: 'BTCUSDT',
      side: 'buy',
      quantity: 0.001,
      price: 50000,
      timestamp: new Date(),
      profit: Math.random() * 100 - 50 // -50 a +50
    };

    // Salvar o trade
    const savedTrade = await prisma.challengeTrade.create({
      data: mockTrade,
      include: {
        user: { select: { name: true } },
        challenge: { select: { title: true } }
      }
    });

    console.log('✅ Trade simulado salvo:');
    console.log(`   ID: ${savedTrade.id}`);
    console.log(`   Symbol: ${savedTrade.symbol}`);
    console.log(`   Side: ${savedTrade.side}`);
    console.log(`   Quantity: ${savedTrade.quantity}`);
    console.log(`   Price: ${savedTrade.price}`);
    console.log(`   Profit: ${savedTrade.profit}`);
    console.log(`   User: ${savedTrade.user.name}`);
    console.log(`   Challenge: ${savedTrade.challenge.title}`);

    // Atualizar saldo do desafio
    const isChallenger = activeChallenge.challengerId === mockTrade.userId;
    const currentBalance = isChallenger ? activeChallenge.challengerCurrentBalance : activeChallenge.challengedCurrentBalance;
    const newBalance = (currentBalance || activeChallenge.initialBalance) + mockTrade.profit;
    const newReturn = ((newBalance - activeChallenge.initialBalance) / activeChallenge.initialBalance) * 100;

    if (isChallenger) {
      await prisma.challenge.update({
        where: { id: activeChallenge.id },
        data: {
          challengerCurrentBalance: newBalance,
          challengerCurrentReturn: newReturn
        }
      });
    } else {
      await prisma.challenge.update({
        where: { id: activeChallenge.id },
        data: {
          challengedCurrentBalance: newBalance,
          challengedCurrentReturn: newReturn
        }
      });
    }

    console.log(`💰 Saldo atualizado: ${newBalance.toFixed(2)} (${newReturn.toFixed(2)}%)`);

  } catch (error) {
    console.error('❌ Erro ao simular trade:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
simulateTrade(); 