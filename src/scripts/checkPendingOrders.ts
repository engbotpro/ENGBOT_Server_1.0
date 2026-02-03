import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPendingOrders() {
  try {
    console.log('🔍 Verificando ordens pendentes no banco de dados...');
    
    // Buscar todas as ordens pendentes
    const pendingOrders = await prisma.pendingOrder.findMany({
      where: {
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 Total de ordens pendentes encontradas: ${pendingOrders.length}`);
    
    if (pendingOrders.length > 0) {
      console.log('\n📋 Detalhes das ordens pendentes:');
      pendingOrders.forEach((order, index) => {
        console.log(`\n${index + 1}. Ordem ID: ${order.id}`);
        console.log(`   Usuário: ${order.user.name} (${order.user.email})`);
        console.log(`   Símbolo: ${order.symbol}`);
        console.log(`   Lado: ${order.side}`);
        console.log(`   Tipo: ${order.type}`);
        console.log(`   Quantidade: ${order.quantity}`);
        console.log(`   Preço: ${order.price}`);
        console.log(`   Total: ${order.total}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Take Profit: ${order.takeProfit || 'N/A'}`);
        console.log(`   Stop Loss: ${order.stopLoss || 'N/A'}`);
        console.log(`   Criada em: ${order.createdAt}`);
        console.log(`   Atualizada em: ${order.updatedAt}`);
      });
    } else {
      console.log('❌ Nenhuma ordem pendente encontrada no banco de dados.');
    }

    // Verificar também todas as ordens (incluindo filled e cancelled)
    const allOrders = await prisma.pendingOrder.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`\n📊 Total de todas as ordens no banco: ${allOrders.length}`);
    
    const statusCount = allOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Distribuição por status:', statusCount);

  } catch (error) {
    console.error('❌ Erro ao verificar ordens pendentes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPendingOrders(); 