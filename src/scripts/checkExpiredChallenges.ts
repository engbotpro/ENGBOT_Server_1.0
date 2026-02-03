import prisma from '../prismaClient';

// Função para verificar se um desafio expirou
const isChallengeExpired = (endDate: Date, endTime: string): boolean => {
  const now = new Date();
  const [hours, minutes] = endTime.split(':').map(Number);
  const endDateTime = new Date(endDate);
  endDateTime.setHours(hours, minutes, 0, 0);
  
  return now > endDateTime;
};

// Função para atualizar status de desafios expirados
const updateExpiredChallenges = async (): Promise<void> => {
  try {
    console.log('🕐 Verificando desafios expirados...');
    
    const expiredChallenges = await prisma.challenge.findMany({
      where: {
        status: 'active',
        endDate: {
          lt: new Date()
        }
      }
    });

    let updatedCount = 0;
    
    for (const challenge of expiredChallenges) {
      if (isChallengeExpired(challenge.endDate, challenge.endTime)) {
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { 
            status: 'completed',
            updatedAt: new Date()
          }
        });

        console.log(`✅ Desafio ${challenge.id} (${challenge.title}) marcado como expirado`);
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`🎯 Total de ${updatedCount} desafios expirados atualizados`);
    } else {
      console.log('✅ Nenhum desafio expirado encontrado');
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar desafios expirados:', error);
  }
};

// Executar verificação
const main = async () => {
  try {
    await updateExpiredChallenges();
    console.log('✅ Verificação de desafios expirados concluída');
  } catch (error) {
    console.error('❌ Erro na execução:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

export { updateExpiredChallenges, isChallengeExpired };
