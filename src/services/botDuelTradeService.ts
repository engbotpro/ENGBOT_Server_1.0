import prisma from '../prismaClient';

/**
 * Serviço para executar trades simulados automaticamente em duelos de robôs ativos
 */
export class BotDuelTradeService {
  /**
   * Executa trades simulados para todos os duelos de robôs ativos
   */
  static async executeTradesForActiveDuels(): Promise<void> {
    try {
      console.log('🤖 Verificando duelos de robôs ativos para executar trades...');

      // Buscar todos os desafios ativos do tipo bot_duel
      const activeDuels = await prisma.challenge.findMany({
        where: {
          status: 'active',
          type: 'bot_duel',
          challengerBotId: { not: null },
          challengedBotId: { not: null }
        },
        include: {
          challenger: { select: { id: true, name: true } },
          challenged: { select: { id: true, name: true } }
        }
      });

      if (activeDuels.length === 0) {
        console.log('📭 Nenhum duelo de robôs ativo encontrado');
        return;
      }

      console.log(`📊 Encontrados ${activeDuels.length} duelo(s) ativo(s)`);

      for (const duel of activeDuels) {
        try {
          // Buscar os robôs do duelo
          const challengerBot = await prisma.bot.findUnique({
            where: { id: duel.challengerBotId! }
          });

          const challengedBot = await prisma.bot.findUnique({
            where: { id: duel.challengedBotId! }
          });

          if (!challengerBot || !challengedBot) {
            console.warn(`⚠️ Robôs não encontrados para o duelo ${duel.id}`);
            continue;
          }

          // Verificar se já houve trades recentes (evitar spam)
          const recentTrades = await prisma.challengeTrade.findMany({
            where: {
              challengeId: duel.id,
              timestamp: {
                gte: new Date(Date.now() - 5 * 60 * 1000) // Últimos 5 minutos
              }
            }
          });

          // Se já houve trades recentes, pular este duelo
          if (recentTrades.length > 0) {
            console.log(`⏭️ Duelo ${duel.id} já teve trades recentes, pulando...`);
            continue;
          }

          // Simular trade para o robô desafiante
          await this.simulateBotTrade(duel, challengerBot, true);

          // Simular trade para o robô desafiado
          await this.simulateBotTrade(duel, challengedBot, false);

          console.log(`✅ Trades simulados para o duelo ${duel.id}`);
        } catch (error) {
          console.error(`❌ Erro ao processar duelo ${duel.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao executar trades para duelos:', error);
    }
  }

  /**
   * Simula um trade para um robô específico em um duelo
   */
  private static async simulateBotTrade(
    duel: any,
    bot: any,
    isChallenger: boolean
  ): Promise<void> {
    try {
      // Gerar dados do trade baseado na configuração do robô
      const basePrice = 50000; // Preço base (pode ser obtido de uma API real)
      const priceVariation = (Math.random() - 0.5) * 0.02; // Variação de ±1%
      const tradePrice = basePrice * (1 + priceVariation);

      // Quantidade baseada no position sizing do robô
      let quantity = 0.001; // Valor padrão
      if (bot.positionSizingType === 'fixed') {
        quantity = bot.positionSizingValue / tradePrice;
      } else if (bot.positionSizingType === 'percentage') {
        const currentBalance = isChallenger 
          ? duel.challengerCurrentBalance || duel.initialBalance
          : duel.challengedCurrentBalance || duel.initialBalance;
        quantity = (currentBalance * bot.positionSizingValue / 100) / tradePrice;
      }

      // Limitar quantidade ao máximo permitido
      quantity = Math.min(quantity, bot.maxPosition / tradePrice);

      // Decidir lado do trade baseado em lógica simples (pode ser melhorado)
      const side = Math.random() > 0.5 ? 'buy' : 'sell';

      // Calcular resultado do trade (simulado)
      const tradeValue = quantity * tradePrice;
      const tradeResult = (Math.random() * 0.1 - 0.05); // -5% a +5%
      const profitLoss = tradeValue * tradeResult;

      // Criar o trade
      await prisma.challengeTrade.create({
        data: {
          challengeId: duel.id,
          userId: isChallenger ? duel.challengerId : duel.challengedId,
          symbol: bot.symbol,
          side,
          quantity,
          price: tradePrice,
          timestamp: new Date(),
          profit: profitLoss
        }
      });

      // Atualizar saldo do desafio
      const currentBalance = isChallenger 
        ? duel.challengerCurrentBalance || duel.initialBalance
        : duel.challengedCurrentBalance || duel.initialBalance;
      const newBalance = currentBalance + profitLoss;
      const newReturn = ((newBalance - duel.initialBalance) / duel.initialBalance) * 100;

      if (isChallenger) {
        await prisma.challenge.update({
          where: { id: duel.id },
          data: {
            challengerCurrentBalance: newBalance,
            challengerCurrentReturn: newReturn
          }
        });
      } else {
        await prisma.challenge.update({
          where: { id: duel.id },
          data: {
            challengedCurrentBalance: newBalance,
            challengedCurrentReturn: newReturn
          }
        });
      }

      console.log(`  💰 Trade simulado para ${isChallenger ? 'desafiante' : 'desafiado'}: ${side} ${quantity} ${bot.symbol} @ ${tradePrice.toFixed(2)} | P/L: ${profitLoss.toFixed(2)}`);
    } catch (error) {
      console.error(`❌ Erro ao simular trade para robô:`, error);
      throw error;
    }
  }
}

