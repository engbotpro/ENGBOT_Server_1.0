import prisma from '../prismaClient';

async function seedTrades() {
  try {
    // Buscar o primeiro usuário (admin)
    const user = await prisma.user.findFirst();
    
    if (!user) {
      console.log('Nenhum usuário encontrado. Execute o servidor primeiro para criar o usuário admin.');
      return;
    }

    console.log(`Inserindo trades para o usuário: ${user.name} (${user.email})`);

    // Dados de exemplo para trades
    const sampleTrades = [
      // Trades manuais em ambiente real
      {
        userId: user.id,
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'market',
        quantity: 0.001,
        price: 45000.00,
        total: 45.00,
        tradeType: 'manual',
        environment: 'real',
        pnl: 2.50,
        pnlPercent: 5.56,
        status: 'closed',
        entryTime: new Date('2024-01-15T10:30:00Z'),
        exitTime: new Date('2024-01-15T14:45:00Z'),
        fees: 0.10,
        notes: 'Trade manual baseado em análise técnica'
      },
      {
        userId: user.id,
        symbol: 'ETHUSDT',
        side: 'sell',
        type: 'limit',
        quantity: 0.01,
        price: 3200.00,
        total: 32.00,
        tradeType: 'manual',
        environment: 'real',
        pnl: -1.20,
        pnlPercent: -3.75,
        status: 'closed',
        entryTime: new Date('2024-01-16T09:15:00Z'),
        exitTime: new Date('2024-01-16T11:30:00Z'),
        fees: 0.08,
        notes: 'Stop loss atingido'
      },
      
      // Trades automatizados em ambiente simulado
      {
        userId: user.id,
        symbol: 'ADAUSDT',
        side: 'buy',
        type: 'market',
        quantity: 100,
        price: 0.45,
        total: 45.00,
        tradeType: 'automated',
        environment: 'simulated',
        botId: 'bot_001',
        botName: 'RSI Strategy Bot',
        pnl: 3.75,
        pnlPercent: 8.33,
        status: 'closed',
        entryTime: new Date('2024-01-17T08:00:00Z'),
        exitTime: new Date('2024-01-17T16:00:00Z'),
        fees: 0.05,
        notes: 'Trade executado pelo bot RSI'
      },
      {
        userId: user.id,
        symbol: 'DOTUSDT',
        side: 'sell',
        type: 'market',
        quantity: 5,
        price: 7.20,
        total: 36.00,
        tradeType: 'automated',
        environment: 'simulated',
        botId: 'bot_002',
        botName: 'MACD Crossover Bot',
        pnl: -0.90,
        pnlPercent: -2.50,
        status: 'closed',
        entryTime: new Date('2024-01-18T12:30:00Z'),
        exitTime: new Date('2024-01-18T15:45:00Z'),
        fees: 0.04,
        notes: 'Sinal de venda do MACD'
      },
      
      // Trades de bot em ambiente paper trading
      {
        userId: user.id,
        symbol: 'SOLUSDT',
        side: 'buy',
        type: 'limit',
        quantity: 0.5,
        price: 95.00,
        total: 47.50,
        tradeType: 'bot',
        environment: 'paper',
        botId: 'bot_003',
        botName: 'Bollinger Bands Bot',
        pnl: 4.25,
        pnlPercent: 8.95,
        status: 'closed',
        entryTime: new Date('2024-01-19T10:00:00Z'),
        exitTime: new Date('2024-01-19T18:00:00Z'),
        fees: 0.06,
        notes: 'Banda inferior atingida'
      },
      {
        userId: user.id,
        symbol: 'LINKUSDT',
        side: 'sell',
        type: 'market',
        quantity: 2,
        price: 15.50,
        total: 31.00,
        tradeType: 'bot',
        environment: 'paper',
        botId: 'bot_004',
        botName: 'Moving Average Bot',
        pnl: 1.80,
        pnlPercent: 5.81,
        status: 'closed',
        entryTime: new Date('2024-01-20T14:00:00Z'),
        exitTime: new Date('2024-01-20T20:00:00Z'),
        fees: 0.04,
        notes: 'Cruzamento de médias móveis'
      },
      
      // Trades abertos (em andamento)
      {
        userId: user.id,
        symbol: 'MATICUSDT',
        side: 'buy',
        type: 'market',
        quantity: 50,
        price: 0.85,
        total: 42.50,
        tradeType: 'manual',
        environment: 'real',
        status: 'open',
        entryTime: new Date('2024-01-21T09:00:00Z'),
        stopLoss: 0.80,
        takeProfit: 0.95,
        notes: 'Trade em andamento - aguardando saída'
      },
      {
        userId: user.id,
        symbol: 'AVAXUSDT',
        side: 'buy',
        type: 'limit',
        quantity: 0.2,
        price: 35.00,
        total: 7.00,
        tradeType: 'automated',
        environment: 'simulated',
        botId: 'bot_005',
        botName: 'Stochastic Bot',
        status: 'open',
        entryTime: new Date('2024-01-21T11:30:00Z'),
        stopLoss: 33.50,
        takeProfit: 37.00,
        notes: 'Bot ativo - monitorando'
      }
    ];

    // Inserir trades
    for (const tradeData of sampleTrades) {
      await prisma.trade.create({
        data: tradeData
      });
    }

    console.log(`✅ ${sampleTrades.length} trades inseridos com sucesso!`);
    
    // Mostrar estatísticas
    const totalTrades = await prisma.trade.count({
      where: { userId: user.id }
    });
    
    const closedTrades = await prisma.trade.count({
      where: { 
        userId: user.id,
        status: 'closed'
      }
    });
    
    const openTrades = await prisma.trade.count({
      where: { 
        userId: user.id,
        status: 'open'
      }
    });

    console.log(`📊 Estatísticas:`);
    console.log(`   Total de trades: ${totalTrades}`);
    console.log(`   Trades fechados: ${closedTrades}`);
    console.log(`   Trades abertos: ${openTrades}`);

  } catch (error) {
    console.error('❌ Erro ao inserir trades:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
seedTrades(); 