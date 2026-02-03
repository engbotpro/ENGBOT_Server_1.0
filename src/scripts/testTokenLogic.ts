import prisma from '../prismaClient';

// Script para testar a lógica de tokens nos desafios
const testTokenLogic = async () => {
  try {
    console.log('🧪 Testando lógica de tokens nos desafios...\n');

    // 1. Verificar usuários existentes
    const users = await prisma.user.findMany({
      take: 2,
      select: { id: true, name: true, email: true }
    });

    if (users.length < 2) {
      console.log('❌ É necessário pelo menos 2 usuários para testar');
      return;
    }

    const [user1, user2] = users;
    console.log(`👤 Usuário 1: ${user1.name} (${user1.email})`);
    console.log(`👤 Usuário 2: ${user2.name} (${user2.email})\n`);

    // 2. Verificar/criar estatísticas dos usuários
    const [user1Stats, user2Stats] = await Promise.all([
      prisma.userChallengeStats.upsert({
        where: { userId: user1.id },
        update: {},
        create: {
          userId: user1.id,
          tokens: 1000,
          totalWins: 0,
          totalLosses: 0,
          totalChallenges: 0,
          winRate: 0,
          totalProfit: 0
        }
      }),
      prisma.userChallengeStats.upsert({
        where: { userId: user2.id },
        update: {},
        create: {
          userId: user2.id,
          tokens: 1000,
          totalWins: 0,
          totalLosses: 0,
          totalChallenges: 0,
          winRate: 0,
          totalProfit: 0
        }
      })
    ]);

    console.log(`💰 Saldo inicial - ${user1.name}: ${user1Stats.tokens} tokens`);
    console.log(`💰 Saldo inicial - ${user2.name}: ${user2Stats.tokens} tokens\n`);

    // 3. Simular criação de desafio
    const betAmount = 100;
    console.log(`🎯 Criando desafio com aposta de ${betAmount} tokens...`);

    // Deduzir tokens do desafiante
    await prisma.userChallengeStats.update({
      where: { userId: user1.id },
      data: { tokens: { decrement: betAmount } }
    });

    console.log(`✅ Tokens deduzidos do desafiante ${user1.name}`);
    console.log(`💰 Novo saldo - ${user1.name}: ${user1Stats.tokens - betAmount} tokens\n`);

    // 4. Simular aceitação do desafio
    console.log(`🤝 Desafiado ${user2.name} aceitando desafio...`);

    // Deduzir tokens do desafiado
    await prisma.userChallengeStats.update({
      where: { userId: user2.id },
      data: { tokens: { decrement: betAmount } }
    });

    console.log(`✅ Tokens deduzidos do desafiado ${user2.name}`);
    console.log(`💰 Novo saldo - ${user2.name}: ${user2Stats.tokens - betAmount} tokens\n`);

    // 5. Simular finalização com vitória do desafiante
    console.log(`🏁 Finalizando desafio - ${user1.name} vence...`);

    // Transferir tokens do perdedor para o vencedor
    await Promise.all([
      prisma.userChallengeStats.update({
        where: { userId: user1.id },
        data: { tokens: { increment: betAmount } }
      }),
      prisma.userChallengeStats.update({
        where: { userId: user2.id },
        data: { tokens: { decrement: betAmount } }
      })
    ]);

    console.log(`✅ ${betAmount} tokens transferidos do perdedor para o vencedor`);

    // 6. Verificar saldos finais
    const [finalUser1Stats, finalUser2Stats] = await Promise.all([
      prisma.userChallengeStats.findUnique({ where: { userId: user1.id } }),
      prisma.userChallengeStats.findUnique({ where: { userId: user2.id } })
    ]);

    console.log('\n📊 Resultados finais:');
    console.log(`💰 ${user1.name}: ${finalUser1Stats?.tokens} tokens (${finalUser1Stats?.tokens === 1000 ? '✅ Correto' : '❌ Incorreto'})`);
    console.log(`💰 ${user2.name}: ${finalUser2Stats?.tokens} tokens (${finalUser2Stats?.tokens === 800 ? '✅ Correto' : '❌ Incorreto'})`);

    // 7. Verificar se a matemática está correta
    const totalTokens = (finalUser1Stats?.tokens || 0) + (finalUser2Stats?.tokens || 0);
    const expectedTotal = 2000; // 1000 + 1000 inicial

    console.log(`\n🧮 Total de tokens no sistema: ${totalTokens}`);
    console.log(`🎯 Total esperado: ${expectedTotal}`);
    console.log(`✅ Sistema ${totalTokens === expectedTotal ? 'funcionando' : 'com vazamento de tokens'}!`);

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Executar teste
if (require.main === module) {
  testTokenLogic();
}

export { testTokenLogic };
