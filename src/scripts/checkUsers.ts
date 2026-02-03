import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Verificando usuários no sistema...');

    // Buscar todos os usuários
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        perfil: true
      }
    });

    console.log(`📊 Total de usuários: ${users.length}`);
    
    if (users.length > 0) {
      console.log('\n👥 Usuários encontrados:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} (${user.email}) - Ativo: ${user.active} - Perfil: ${user.perfil}`);
      });
    } else {
      console.log('❌ Nenhum usuário encontrado no sistema');
    }

    // Verificar estatísticas de desafio
    console.log('\n🏆 Verificando estatísticas de desafio...');
    const challengeStats = await prisma.userChallengeStats.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    console.log(`📈 Usuários com estatísticas de desafio: ${challengeStats.length}`);
    
    if (challengeStats.length > 0) {
      console.log('\n📊 Estatísticas encontradas:');
      challengeStats.forEach((stat, index) => {
        console.log(`${index + 1}. ${stat.user.name}: ${stat.tokens} tokens, ${stat.totalWins}W/${stat.totalLosses}L (${stat.winRate.toFixed(1)}%)`);
      });
    } else {
      console.log('❌ Nenhuma estatística de desafio encontrada');
      console.log('💡 Execute o script de seed: npx ts-node src/scripts/seedChallengeStats.ts');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar usuários:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a verificação
checkUsers(); 