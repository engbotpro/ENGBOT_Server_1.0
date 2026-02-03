import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPlanHistory() {
  try {
    // Buscar um usuário para usar como exemplo
    const user = await prisma.user.findFirst();
    
    if (!user) {
      console.log('Nenhum usuário encontrado. Crie um usuário primeiro.');
      return;
    }

    // Dados de exemplo para o histórico de planos
    const planHistoryData = [
      {
        userId: user.id,
        planName: 'INICIANTE BLACK',
        changeType: 'new',
        price: 5.00,
        billingCycle: 'mensal',
        date: new Date('2024-01-15T10:30:00Z'),
      },
      {
        userId: user.id,
        planName: 'ENTUSIASTA BLACK',
        oldPlan: 'INICIANTE BLACK',
        changeType: 'upgrade',
        price: 59.00,
        billingCycle: 'anual',
        date: new Date('2024-02-20T14:15:00Z'),
      },
      {
        userId: user.id,
        planName: 'ESTRATEGISTA BLACK',
        oldPlan: 'ENTUSIASTA BLACK',
        changeType: 'upgrade',
        price: 99.00,
        billingCycle: 'anual',
        date: new Date('2024-03-10T09:45:00Z'),
      },
      {
        userId: user.id,
        planName: 'ENTUSIASTA BLACK',
        oldPlan: 'ESTRATEGISTA BLACK',
        changeType: 'downgrade',
        price: 59.00,
        billingCycle: 'anual',
        date: new Date('2024-04-05T16:20:00Z'),
      },
    ];

    // Inserir dados de exemplo
    for (const data of planHistoryData) {
      await prisma.planHistory.create({
        data
      });
    }

    console.log('✅ Dados de exemplo do histórico de planos inseridos com sucesso!');
    
    // Atualizar o usuário com o plano atual
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentPlan: 'ENTUSIASTA BLACK',
        billingCycle: 'anual',
        planActivatedAt: new Date('2024-04-05T16:20:00Z'),
        planExpiresAt: new Date('2025-04-05T16:20:00Z'),
      }
    });

    console.log('✅ Plano atual do usuário atualizado!');

  } catch (error) {
    console.error('❌ Erro ao inserir dados de exemplo:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedPlanHistory(); 