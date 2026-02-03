import prisma from '../prismaClient';

async function updateUserTokens() {
  try {
    console.log('🔄 Atualizando tokens dos usuários...');

    // Buscar todos os usuários
    const users = await prisma.user.findMany({
      where: {
        active: true
      }
    });

    console.log(`📊 Encontrados ${users.length} usuários ativos`);

    // Para cada usuário, criar ou atualizar as estatísticas de desafio
    for (const user of users) {
      await prisma.userChallengeStats.upsert({
        where: {
          userId: user.id
        },
        update: {
          tokens: 1000
        },
        create: {
          userId: user.id,
          tokens: 1000,
          totalWins: 0,
          totalLosses: 0,
          winRate: 0,
          totalProfit: 0,
          totalChallenges: 0,
          activeChallenges: 0,
          bestWinStreak: 0,
          currentStreak: 0,
          averageReturn: 0,
          bestReturn: 0,
          worstReturn: 0,
          autoAccept: false,
          minBetAmount: 10,
          maxBetAmount: 500
        }
      });

      console.log(`✅ Usuário ${user.name} atualizado com 1000 tokens`);
    }

    console.log('🎉 Todos os usuários foram atualizados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao atualizar tokens:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
updateUserTokens(); 