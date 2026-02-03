import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedChallengeStats() {
  try {
    console.log('🌱 Iniciando seed das estatísticas de desafios...');

    // Buscar todos os usuários
    const users = await prisma.user.findMany();
    console.log(`📊 Encontrados ${users.length} usuários`);

    for (const user of users) {
      // Verificar se já existe estatísticas para este usuário
      const existingStats = await prisma.userChallengeStats.findUnique({
        where: { userId: user.id }
      });

      if (existingStats) {
        console.log(`⏭️  Estatísticas já existem para ${user.name}`);
        continue;
      }

      // Gerar dados fictícios aleatórios
      const totalWins = Math.floor(Math.random() * 20) + 1; // 1-20 vitórias
      const totalLosses = Math.floor(Math.random() * 15) + 1; // 1-15 derrotas
      const totalChallenges = totalWins + totalLosses;
      const winRate = totalChallenges > 0 ? (totalWins / totalChallenges) * 100 : 0;
      
      // Tokens baseados no desempenho
      const baseTokens = 1000;
      const profitTokens = (totalWins - totalLosses) * 50; // 50 tokens por vitória/derrota
      const tokens = Math.max(100, baseTokens + profitTokens); // Mínimo 100 tokens
      
      // Outros dados fictícios
      const totalProfit = profitTokens;
      const bestWinStreak = Math.floor(Math.random() * 8) + 1; // 1-8 vitórias seguidas
      const currentStreak = Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : -(Math.floor(Math.random() * 3) + 1);
      const averageReturn = (Math.random() * 20 - 10); // -10% a +10%
      const bestReturn = Math.random() * 30 + 5; // 5% a 35%
      const worstReturn = -(Math.random() * 25 + 5); // -5% a -30%
      
      // Ranking baseado no win rate
      const rank = Math.floor(Math.random() * 100) + 1;

      // Criar estatísticas
      await prisma.userChallengeStats.create({
        data: {
          userId: user.id,
          tokens,
          totalWins,
          totalLosses,
          winRate,
          totalProfit,
          totalChallenges,
          activeChallenges: Math.floor(Math.random() * 3), // 0-2 desafios ativos
          rank,
          bestWinStreak,
          currentStreak,
          averageReturn,
          bestReturn,
          worstReturn,
          autoAccept: Math.random() > 0.8, // 20% chance de aceitar automaticamente
          minBetAmount: 10,
          maxBetAmount: Math.min(500, tokens * 0.5) // Máximo 50% dos tokens
        }
      });

      console.log(`✅ Estatísticas criadas para ${user.name}: ${totalWins}W/${totalLosses}L (${winRate.toFixed(1)}%)`);
    }

    console.log('🎉 Seed das estatísticas de desafios concluído!');
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o seed
seedChallengeStats(); 