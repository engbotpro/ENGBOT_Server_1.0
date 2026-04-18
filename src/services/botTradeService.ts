import prisma from '../prismaClient';
import { fetchHistoricalKlines, fetchCurrentPrice, Candle } from './binanceService';

/**
 * Serviço para executar trades simulados automaticamente para robôs ativos
 */
export class BotTradeService {
  /**
   * Atualiza as estatísticas de todos os bots (útil para sincronizar dados)
   */
  static async updateAllBotsStatistics(): Promise<void> {
    try {
      console.log('📊 Atualizando estatísticas de todos os bots...');
      
      const allBots = await prisma.bot.findMany({
        select: { id: true, name: true }
      });

      console.log(`   Encontrados ${allBots.length} bot(s) para atualizar`);

      for (const bot of allBots) {
        try {
          await this.updateBotStatistics(bot.id);
        } catch (error) {
          console.error(`❌ Erro ao atualizar estatísticas do bot ${bot.name} (${bot.id}):`, error);
        }
      }

      console.log('✅ Atualização de estatísticas concluída');
    } catch (error) {
      console.error('❌ Erro ao atualizar estatísticas de todos os bots:', error);
    }
  }

  /**
   * Executa trades simulados para todos os robôs ativos
   */
  static async executeTradesForActiveBots(): Promise<void> {
    try {
      console.log('🤖 Verificando robôs ativos para executar trades...');

      // Buscar todos os robôs ativos
      const activeBots = await prisma.bot.findMany({
        where: {
          isActive: true,
        },
        include: {
          user: { select: { id: true, name: true } }
        }
      });

      if (activeBots.length === 0) {
        console.log('📭 Nenhum robô ativo encontrado');
        return;
      }

      console.log(`📊 Encontrados ${activeBots.length} robô(s) ativo(s)`);

      for (const bot of activeBots) {
        try {
          // Verificar saldo disponível antes de processar o robô
          // Buscar preço atual para verificar saldo
          let currentPrice = 0;
          try {
            const klines = await fetchHistoricalKlines(bot.symbol, bot.timeframe || '1h', 1);
            if (klines && klines.length > 0) {
              currentPrice = klines[klines.length - 1].close;
            }
          } catch (error) {
            console.error(`Erro ao buscar preço para verificação de saldo:`, error);
          }

          if (currentPrice > 0) {
            const balanceCheck = await this.hasSufficientBalance(bot, currentPrice);
            if (!balanceCheck.hasBalance) {
              console.log(`⚠️ Robô ${bot.name} não tem saldo suficiente para operar. Saldo: ${balanceCheck.balance.toFixed(2)} USDT, Necessário: ${balanceCheck.requiredAmount.toFixed(2)} USDT. Parando robô automaticamente...`);
              
              // Parar o robô automaticamente se não tiver saldo suficiente
              await prisma.bot.update({
                where: { id: bot.id },
                data: { isActive: false, deactivationReason: 'Saldo insuficiente para operar' }
              });
              
              console.log(`🛑 Robô ${bot.name} parado automaticamente por falta de saldo`);
              continue;
            }
          }

          // Verificar se o robô está em modo agendado e se está no horário permitido
          if (bot.operationMode === 'scheduled') {
            const canOperate = this.checkScheduledOperationTime(bot);
            if (!canOperate) {
              console.log(`⏰ Robô ${bot.name} está em modo agendado e não está no horário/dia permitido. Pulando...`);
              continue;
            }
          }

          // Verificar se há posições abertas para este robô
          const openTrades = await prisma.trade.findMany({
            where: {
              botId: bot.id,
              status: 'open'
            }
          });

          // Se já há posições abertas, verificar condições de saída primeiro
          // (mesmo fora do horário agendado, devemos verificar saídas para trades abertos)
          if (openTrades.length > 0) {
            await this.checkExitConditions(bot, openTrades);
          }

          // Se está em modo agendado e não está no horário, não abrir novas posições
          if (bot.operationMode === 'scheduled') {
            const canOperate = this.checkScheduledOperationTime(bot);
            if (!canOperate) {
              // Mesmo sem criar novos trades, atualizar estatísticas para refletir trades abertos
              await this.updateBotStatistics(bot.id);
              continue;
            }
          }

          // Verificar se pode abrir nova posição (respeitando maxOpenPositions)
          const maxOpenPositions = bot.maxOpenPositions || 1;
          if (openTrades.length >= maxOpenPositions) {
            console.log(`⏭️ Robô ${bot.name} já tem ${openTrades.length} posição(ões) aberta(s), máximo: ${maxOpenPositions}`);
            // Mesmo sem criar novos trades, atualizar estatísticas para refletir trades abertos
            await this.updateBotStatistics(bot.id);
            continue;
          }

          // Verificar se já houve trades muito recentes (evitar spam)
          // Para timeframe de 1 minuto, verificar últimos 30 segundos
          // Para outros timeframes, verificar últimos 5 minutos
          const timeframeMinutes = this.getTimeframeMinutes(bot.timeframe || '1h');
          const recentWindow = timeframeMinutes <= 1 ? 30 * 1000 : 5 * 60 * 1000;
          
          const recentTrades = await prisma.trade.findMany({
            where: {
              botId: bot.id,
              entryTime: {
                gte: new Date(Date.now() - recentWindow)
              }
            }
          });

          if (recentTrades.length > 0) {
            console.log(`⏭️ Robô ${bot.name} já teve trades recentes, pulando...`);
            continue;
          }

          // Verificar condições de entrada
          await this.checkEntryConditions(bot);

        } catch (error) {
          console.error(`❌ Erro ao processar robô ${bot.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao executar trades para robôs:', error);
    }
  }

  /**
   * Verifica condições de entrada e executa trade se necessário
   */
  private static async checkEntryConditions(bot: any): Promise<void> {
    try {
      const timeframe = bot.timeframe || '1h';
      const symbol = bot.symbol || 'BTCUSDT';
      
      // Buscar dados históricos suficientes para calcular indicadores
      const lookbackPeriod = this.getLookbackPeriod(bot.primaryIndicator);
      const klines = await fetchHistoricalKlines(symbol, timeframe, lookbackPeriod);
      
      if (!klines || klines.length < 2) {
        console.warn(`⚠️ Dados insuficientes para ${symbol} no timeframe ${timeframe}`);
        return;
      }

      const latestCandle = klines[klines.length - 1];
      const previousCandle = klines[klines.length - 2];
      
      // Determinar preço de execução baseado no modo de execução
      const entryExecutionMode = bot.entryExecutionMode || 'candle_close';
      let currentPrice: number;
      
      if (entryExecutionMode === 'price_condition') {
        // Buscar preço atual em tempo real
        const realTimePrice = await fetchCurrentPrice(symbol);
        if (realTimePrice === null) {
          console.warn(`⚠️ Não foi possível obter preço em tempo real para ${symbol}, usando preço de fechamento do candle`);
          currentPrice = latestCandle.close;
        } else {
          currentPrice = realTimePrice;
        }
      } else {
        // Modo padrão: usar preço de fechamento do candle
        currentPrice = latestCandle.close;
      }

      // Calcular indicadores
      const indicators = this.calculateIndicators(klines, bot);

      // Verificar condição de entrada
      const entrySignal = this.checkEntrySignal(
        latestCandle,
        previousCandle,
        klines,
        indicators,
        bot
      );

      // Log detalhado para debug
      console.log(`🔍 [${bot.name}] Verificando condições de entrada:`);
      console.log(`   - Indicador Principal: ${bot.primaryIndicator}`);
      console.log(`   - Indicador Secundário: ${bot.secondaryIndicator || 'Nenhum'}`);
      console.log(`   - Condição de Entrada: ${bot.entryCondition || 'Padrão'}`);
      console.log(`   - Preço Atual: ${currentPrice.toFixed(2)}`);
      console.log(`   - Preço Anterior: ${previousCandle.close.toFixed(2)}`);
      if (indicators.primary !== null && indicators.primary !== undefined) {
        console.log(`   - Valor do Indicador Primário (atual): ${indicators.primary.toFixed(4)}`);
      }
      if (indicators.secondary !== null && indicators.secondary !== undefined) {
        console.log(`   - Valor do Indicador Secundário: ${indicators.secondary.toFixed(4)}`);
      }
      if (indicators.bollinger) {
        const bb = indicators.bollinger;
        const idx = bb.upper.length - 1;
        console.log(`   - Bollinger Bands: Superior=${bb.upper[idx].toFixed(2)}, Média=${bb.middle[idx].toFixed(2)}, Inferior=${bb.lower[idx].toFixed(2)}`);
      }
      if (indicators.hilo) {
        const hilo = indicators.hilo;
        const idx = hilo.upper.length - 1;
        console.log(`   - HILO: Superior=${hilo.upper[idx].toFixed(2)}, Inferior=${hilo.lower[idx].toFixed(2)}`);
      }
      // Log específico para crossover
      if ((bot.entryCondition || '').toLowerCase().includes('crossover')) {
        const primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
        if (primaryIndicatorName === 'sma' || primaryIndicatorName === 'ema') {
          const previousPrices = klines.slice(0, -1).map(k => k.close);
          let previousIndicatorValue: number | null = null;
          if (primaryIndicatorName === 'sma') {
            previousIndicatorValue = this.calculateSMA(previousPrices, 20);
          } else if (primaryIndicatorName === 'ema') {
            previousIndicatorValue = this.calculateEMA(previousPrices, 20);
          }
          if (previousIndicatorValue !== null) {
            console.log(`   - Valor do Indicador Primário (anterior): ${previousIndicatorValue.toFixed(4)}`);
            console.log(`   - Análise Crossover:`);
            console.log(`     * Preço anterior (${previousCandle.close.toFixed(2)}) vs EMA anterior (${previousIndicatorValue.toFixed(2)}): ${previousCandle.close <= previousIndicatorValue ? 'abaixo' : 'acima'}`);
            console.log(`     * Preço atual (${currentPrice.toFixed(2)}) vs EMA atual (${indicators.primary.toFixed(2)}): ${currentPrice > indicators.primary ? 'acima' : 'abaixo'}`);
            if (previousCandle.close <= previousIndicatorValue && currentPrice > indicators.primary) {
              console.log(`     * ✅ CROSSOVER ACIMA DETECTADO! (Compra)`);
            } else if (previousCandle.close >= previousIndicatorValue && currentPrice < indicators.primary) {
              console.log(`     * ✅ CROSSOVER ABAIXO DETECTADO! (Venda)`);
            } else {
              console.log(`     * ❌ Nenhum crossover detectado`);
            }
          }
        }
      }
      console.log(`   - Sinal de Entrada: ${entrySignal.shouldTrade ? '✅ SIM' : '❌ NÃO'} (${entrySignal.side})`);

      if (!entrySignal.shouldTrade) {
        console.log(`⏭️ Condições de entrada não atendidas para o robô ${bot.name}`);
        return;
      }

      // Verificar saldo antes de criar trade
      const balanceCheck = await this.hasSufficientBalance(bot, currentPrice);
      if (!balanceCheck.hasBalance) {
        console.log(`⚠️ Saldo insuficiente para criar trade no robô ${bot.name}. Saldo: ${balanceCheck.balance.toFixed(2)} USDT, Necessário: ${balanceCheck.requiredAmount.toFixed(2)} USDT`);
        
        // Parar o robô automaticamente se não tiver saldo suficiente
        await prisma.bot.update({
          where: { id: bot.id },
          data: { isActive: false, deactivationReason: 'Saldo insuficiente para operar' }
        });
        
        console.log(`🛑 Robô ${bot.name} parado automaticamente por falta de saldo`);
        return;
      }

      // Calcular quantidade baseada no position sizing
      const quantity = await this.calculatePositionSize(bot, currentPrice);

      if (quantity <= 0) {
        console.warn(`⚠️ Quantidade inválida para o robô ${bot.name}`);
        return;
      }

      // Criar trade
      console.log(`🔄 Criando trade para o robô ${bot.name} (ID: ${bot.id})...`);
      const trade = await prisma.trade.create({
        data: {
          userId: bot.userId,
          symbol: symbol,
          side: entrySignal.side,
          type: bot.entryType || 'market',
          quantity: quantity,
          price: currentPrice,
          total: quantity * currentPrice,
          tradeType: 'bot',
          environment: bot.environment === 'real' ? 'real' : 'simulated',
          botId: bot.id,
          botName: bot.name,
          status: 'open',
          stopLoss: bot.stopLossEnabled && bot.stopLossValue 
            ? this.calculateStopLoss(currentPrice, entrySignal.side, bot.stopLossValue, bot.stopLossType)
            : null,
          takeProfit: bot.takeProfitEnabled && bot.takeProfitValue
            ? this.calculateTakeProfit(currentPrice, entrySignal.side, bot.takeProfitValue, bot.takeProfitType)
            : null,
        }
      });

      console.log(`✅ Trade criado com sucesso! ID: ${trade.id}, Bot ID: ${trade.botId}, Status: ${trade.status}`);
      console.log(`   Detalhes: ${entrySignal.side} ${quantity.toFixed(6)} ${symbol} @ ${currentPrice.toFixed(2)}`);
      if (trade.stopLoss) {
        console.log(`   🛑 Stop Loss: ${trade.stopLoss.toFixed(2)} (${((Math.abs(trade.stopLoss - currentPrice) / currentPrice) * 100).toFixed(2)}% de ${entrySignal.side === 'buy' ? 'perda' : 'ganho'})`);
      }
      if (trade.takeProfit) {
        console.log(`   🎯 Take Profit: ${trade.takeProfit.toFixed(2)} (${((Math.abs(trade.takeProfit - currentPrice) / currentPrice) * 100).toFixed(2)}% de ${entrySignal.side === 'buy' ? 'ganho' : 'perda'})`);
      }
      
      // Atualizar estatísticas do bot
      console.log(`📊 Iniciando atualização de estatísticas para o bot ${bot.id}...`);
      await this.updateBotStatistics(bot.id);
    } catch (error) {
      console.error(`❌ Erro ao verificar condições de entrada para o robô:`, error);
      throw error;
    }
  }

  /**
   * Verifica condições de saída para trades abertos
   */
  private static async checkExitConditions(bot: any, openTrades: any[]): Promise<void> {
    try {
      const timeframe = bot.timeframe || '1h';
      const symbol = bot.symbol || 'BTCUSDT';
      
      const klines = await fetchHistoricalKlines(symbol, timeframe, 100);
      if (!klines || klines.length < 2) return;

      const latestCandle = klines[klines.length - 1];
      const indicators = this.calculateIndicators(klines, bot);

      for (const trade of openTrades) {
        console.log(`\n🔍 [${bot.name}] Verificando condições de saída para trade ${trade.id}:`);
        console.log(`   - Trade: ${trade.side.toUpperCase()} ${trade.quantity.toFixed(6)} ${symbol} @ ${trade.price.toFixed(2)}`);
        console.log(`   - Preço Atual: High=${latestCandle.high.toFixed(2)}, Low=${latestCandle.low.toFixed(2)}, Close=${latestCandle.close.toFixed(2)}`);
        
        let shouldExit = false;
        let exitReason = '';

        // Verificar stop loss
        if (trade.stopLoss) {
          console.log(`   - Stop Loss configurado: ${trade.stopLoss.toFixed(2)}`);
          if (trade.side === 'buy') {
            console.log(`     * Comparando: Low (${latestCandle.low.toFixed(2)}) <= SL (${trade.stopLoss.toFixed(2)})`);
            if (latestCandle.low <= trade.stopLoss) {
              shouldExit = true;
              exitReason = 'Stop Loss';
              console.log(`     * ✅ STOP LOSS ATINGIDO! (Low ${latestCandle.low.toFixed(2)} <= SL ${trade.stopLoss.toFixed(2)})`);
            } else {
              console.log(`     * ❌ Stop Loss não atingido (Low ${latestCandle.low.toFixed(2)} > SL ${trade.stopLoss.toFixed(2)})`);
            }
          } else if (trade.side === 'sell') {
            console.log(`     * Comparando: High (${latestCandle.high.toFixed(2)}) >= SL (${trade.stopLoss.toFixed(2)})`);
            if (latestCandle.high >= trade.stopLoss) {
              shouldExit = true;
              exitReason = 'Stop Loss';
              console.log(`     * ✅ STOP LOSS ATINGIDO! (High ${latestCandle.high.toFixed(2)} >= SL ${trade.stopLoss.toFixed(2)})`);
            } else {
              console.log(`     * ❌ Stop Loss não atingido (High ${latestCandle.high.toFixed(2)} < SL ${trade.stopLoss.toFixed(2)})`);
            }
          }
        } else {
          console.log(`   - Stop Loss: Não configurado`);
        }

        // Verificar take profit
        if (!shouldExit && trade.takeProfit) {
          console.log(`   - Take Profit configurado: ${trade.takeProfit.toFixed(2)}`);
          if (trade.side === 'buy') {
            console.log(`     * Comparando: High (${latestCandle.high.toFixed(2)}) >= TP (${trade.takeProfit.toFixed(2)})`);
            if (latestCandle.high >= trade.takeProfit) {
              shouldExit = true;
              exitReason = 'Take Profit';
              console.log(`     * ✅ TAKE PROFIT ATINGIDO! (High ${latestCandle.high.toFixed(2)} >= TP ${trade.takeProfit.toFixed(2)})`);
            } else {
              console.log(`     * ❌ Take Profit não atingido (High ${latestCandle.high.toFixed(2)} < TP ${trade.takeProfit.toFixed(2)})`);
            }
          } else if (trade.side === 'sell') {
            console.log(`     * Comparando: Low (${latestCandle.low.toFixed(2)}) <= TP (${trade.takeProfit.toFixed(2)})`);
            if (latestCandle.low <= trade.takeProfit) {
              shouldExit = true;
              exitReason = 'Take Profit';
              console.log(`     * ✅ TAKE PROFIT ATINGIDO! (Low ${latestCandle.low.toFixed(2)} <= TP ${trade.takeProfit.toFixed(2)})`);
            } else {
              console.log(`     * ❌ Take Profit não atingido (Low ${latestCandle.low.toFixed(2)} > TP ${trade.takeProfit.toFixed(2)})`);
            }
          }
        } else if (!shouldExit) {
          console.log(`   - Take Profit: Não configurado`);
        }

        // Verificar condição de saída baseada no indicador
        if (!shouldExit && bot.exitCondition) {
          const exitSignal = this.checkExitSignal(
            latestCandle,
            klines,
            indicators,
            bot,
            trade
          );
          if (exitSignal) {
            shouldExit = true;
            exitReason = 'Condição de Saída';
          }
        }

        if (shouldExit) {
          // Determinar preço de saída baseado no modo de execução
          const exitExecutionMode = bot.exitExecutionMode || 'candle_close';
          let exitPrice: number;
          
          if (exitReason === 'Stop Loss') {
            exitPrice = trade.stopLoss!;
          } else if (exitReason === 'Take Profit') {
            exitPrice = trade.takeProfit!;
          } else {
            // Para condições de saída baseadas em indicadores
            if (exitExecutionMode === 'price_condition') {
              // Buscar preço atual em tempo real
              const realTimePrice = await fetchCurrentPrice(symbol);
              if (realTimePrice === null) {
                console.warn(`⚠️ Não foi possível obter preço em tempo real para ${symbol}, usando preço de fechamento do candle`);
                exitPrice = latestCandle.close;
              } else {
                exitPrice = realTimePrice;
              }
            } else {
              // Modo padrão: usar preço de fechamento do candle
              exitPrice = latestCandle.close;
            }
          }

          // Calcular P/L com arredondamento para evitar erros de precisão
          const pnlRaw = trade.side === 'buy' 
            ? (exitPrice - trade.price) * trade.quantity
            : (trade.price - exitPrice) * trade.quantity;
          const pnl = Math.round(pnlRaw * 100) / 100; // Arredondar para 2 casas decimais
          const pnlPercent = Math.round(((pnl / (trade.price * trade.quantity)) * 100) * 100) / 100; // Arredondar para 2 casas decimais

          console.log(`\n💰 FECHANDO TRADE:`);
          console.log(`   - Trade ID: ${trade.id}`);
          console.log(`   - Motivo: ${exitReason}`);
          console.log(`   - Preço de Entrada: ${trade.price.toFixed(2)}`);
          console.log(`   - Preço de Saída: ${exitPrice.toFixed(2)}`);
          console.log(`   - Quantidade: ${trade.quantity.toFixed(6)}`);
          console.log(`   - P/L: ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

          await prisma.trade.update({
            where: { id: trade.id },
            data: {
              status: 'closed',
              exitTime: new Date(),
              exitPrice: exitPrice,
              pnl: pnl,
              pnlPercent: pnlPercent
            }
          });

          console.log(`✅ Trade fechado para o robô ${bot.name}: ${exitReason} | P/L: ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
          
          // Atualizar saldo virtual do usuário com o P/L do trade
          await this.updateVirtualWalletWithPnL(bot.userId, pnl);

          // Atualizar estatísticas do bot
          await this.updateBotStatistics(bot.id);
        } else {
          console.log(`   - ⏳ Trade permanece aberto (nenhuma condição de saída atendida)`);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao verificar condições de saída:`, error);
    }
  }

  /**
   * Verifica se as condições de entrada são atendidas
   */
  private static checkEntrySignal(
    candle: Candle,
    previousCandle: Candle,
    klines: Candle[],
    indicators: any,
    bot: any
  ): { shouldTrade: boolean; side: 'buy' | 'sell' } {
    const condition = (bot.entryCondition || '').toLowerCase();
    const primaryValue = indicators.primary;
    const secondaryValue = indicators.secondary;
    const confirmationValue = indicators.confirmation;

    // Se não há condição configurada, usar lógica padrão baseada no indicador
    if (!condition || condition === '') {
      return this.getDefaultEntrySignal(indicators, bot, candle);
    }

    let entrySignal = false;
    let side: 'buy' | 'sell' = 'buy';

    // Verificar condições baseadas no tipo de indicador
    let primaryIndicatorName = '';
    if (bot.indicators && Array.isArray(bot.indicators) && bot.indicators.length > 0) {
      const primaryIndicator = bot.indicators.find((ind: any) => ind.type === 'primary');
      if (primaryIndicator) {
        primaryIndicatorName = (primaryIndicator.name || '').toLowerCase();
      }
    } else {
      primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
    }
    
    // ESTRATÉGIA DE CRUZAMENTO DE MÉDIAS MÓVEIS
    // Detectar cruzamento entre múltiplas médias móveis
    if (indicators.movingAverages && indicators.movingAverages.length >= 2 && 
        indicators.movingAveragesPrevious && indicators.movingAveragesPrevious.length >= 2) {
      
      // Verificar cruzamentos entre médias adjacentes (ordenadas por período)
      for (let i = 0; i < indicators.movingAverages.length - 1; i++) {
        const fastMA = indicators.movingAverages[i]; // Média rápida (menor período)
        const slowMA = indicators.movingAverages[i + 1]; // Média lenta (maior período)
        const fastMAPrev = indicators.movingAveragesPrevious[i];
        const slowMAPrev = indicators.movingAveragesPrevious[i + 1];
        
        // CROSSOVER: Média rápida cruza ACIMA da média lenta (compra)
        if (condition.includes('crossover') || condition === 'crossover') {
          // Verificar se a média rápida estava abaixo da lenta e agora está acima
          if (fastMAPrev.value <= slowMAPrev.value && fastMA.value > slowMA.value) {
            entrySignal = true;
            side = 'buy';
            console.log(`✅ CROSSOVER DETECTADO: ${fastMA.name.toUpperCase()}(${fastMA.period}) cruzou acima de ${slowMA.name.toUpperCase()}(${slowMA.period}) - COMPRA`);
            break; // Sair do loop ao encontrar um crossover
          }
        }
        
        // CROSSUNDER: Média rápida cruza ABAIXO da média lenta (venda)
        if (condition.includes('crossunder') || condition === 'crossunder') {
          // Verificar se a média rápida estava acima da lenta e agora está abaixo
          if (fastMAPrev.value >= slowMAPrev.value && fastMA.value < slowMA.value) {
            entrySignal = true;
            side = 'sell';
            console.log(`✅ CROSSUNDER DETECTADO: ${fastMA.name.toUpperCase()}(${fastMA.period}) cruzou abaixo de ${slowMA.name.toUpperCase()}(${slowMA.period}) - VENDA`);
            break; // Sair do loop ao encontrar um crossunder
          }
        }
      }
      
      // Se encontrou um sinal de cruzamento entre médias, retornar
      if (entrySignal) {
        return { shouldTrade: entrySignal, side };
      }
    }
    
    if (primaryIndicatorName === 'rsi') {
      if (condition.includes('oversold') || condition.includes('sobrevendido') || condition.includes('<')) {
        entrySignal = primaryValue < (bot.entryValue || 30);
        side = 'buy';
      } else if (condition.includes('overbought') || condition.includes('sobrecomprado') || condition.includes('>')) {
        entrySignal = primaryValue > (bot.entryValue || 70);
        side = 'sell';
      } else if (condition.includes('crossover') || condition.includes('cruzou')) {
        // Crossover: RSI cruzou acima de um valor (compra) ou abaixo (venda)
        const prevRSI = this.calculateRSI(klines.slice(0, -1).map(k => k.close), 14);
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = prevRSI < (bot.entryValue || 50) && primaryValue >= (bot.entryValue || 50);
          side = 'buy';
        } else {
          entrySignal = prevRSI > (bot.entryValue || 50) && primaryValue <= (bot.entryValue || 50);
          side = 'sell';
        }
      }
    } else if (primaryIndicatorName === 'macd') {
      const macd = indicators.macd;
      // CROSSOVER: MACD cruza acima da linha de sinal (compra)
      if (condition.includes('crossover') || condition.includes('cruzou')) {
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = macd.histogram > 0 && macd.macd > macd.signal;
          side = 'buy';
        } else {
          entrySignal = macd.histogram < 0 && macd.macd < macd.signal;
          side = 'sell';
        }
      }
      // CROSSUNDER: MACD cruza abaixo da linha de sinal (venda)
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        entrySignal = macd.histogram < 0 && macd.macd < macd.signal;
        side = 'sell';
      }
      // DIVERGENCE: divergência de MACD (simplificado)
      else if (condition.includes('divergence') || condition.includes('divergência')) {
        // Simplificado: verificar se histogram está mudando de direção
        const prevPrices = klines.slice(0, -1).map(k => k.close);
        const prevMACD = this.calculateMACD(prevPrices);
        if (prevMACD.histogram < 0 && macd.histogram > 0) {
          entrySignal = true; // Divergência de alta
          side = 'buy';
        } else if (prevMACD.histogram > 0 && macd.histogram < 0) {
          entrySignal = true; // Divergência de baixa
          side = 'sell';
        }
      }
      // HISTOGRAM_CHANGE: mudança no histograma
      else if (condition.includes('histogram_change') || condition.includes('mudança histograma')) {
        const prevPrices = klines.slice(0, -1).map(k => k.close);
        const prevMACD = this.calculateMACD(prevPrices);
        if (prevMACD.histogram <= 0 && macd.histogram > 0) {
          entrySignal = true; // Histograma virou positivo
          side = 'buy';
        } else if (prevMACD.histogram >= 0 && macd.histogram < 0) {
          entrySignal = true; // Histograma virou negativo
          side = 'sell';
        }
      }
    } else if (primaryIndicatorName === 'sma' || primaryIndicatorName === 'ema' || primaryIndicatorName === 'wma' || primaryIndicatorName === 'hma') {
      // Distância mínima % do preço em relação à média (entryValue = percentual, ex.: 1.5 = 1,5%)
      const stretchPct =
        bot.entryValue != null && !Number.isNaN(Number(bot.entryValue)) && Number(bot.entryValue) > 0
          ? Number(bot.entryValue) / 100
          : 0;
      const safePrimary = Math.abs(primaryValue) > 1e-12 ? primaryValue : 1e-12;

      const isStretchMa =
        condition === 'ma_stretch_below_buy' ||
        condition === 'ma_stretch_above_buy' ||
        condition === 'ma_stretch_above_sell' ||
        condition === 'ma_stretch_below_sell';

      if (isStretchMa) {
        if (condition === 'ma_stretch_below_buy') {
          const dist = (safePrimary - candle.close) / Math.abs(safePrimary);
          entrySignal = candle.close < primaryValue && dist >= stretchPct;
          side = 'buy';
        } else if (condition === 'ma_stretch_above_buy') {
          const dist = (candle.close - safePrimary) / Math.abs(safePrimary);
          entrySignal = candle.close > primaryValue && dist >= stretchPct;
          side = 'buy';
        } else if (condition === 'ma_stretch_above_sell') {
          const dist = (candle.close - safePrimary) / Math.abs(safePrimary);
          entrySignal = candle.close > primaryValue && dist >= stretchPct;
          side = 'sell';
        } else if (condition === 'ma_stretch_below_sell') {
          const dist = (safePrimary - candle.close) / Math.abs(safePrimary);
          entrySignal = candle.close < primaryValue && dist >= stretchPct;
          side = 'sell';
        }
        return { shouldTrade: entrySignal, side };
      }

      // Calcular média móvel anterior para comparação correta de crossover/crossunder
      const previousPrices = klines.slice(0, -1).map(k => k.close);
      let previousIndicatorValue: number | null = null;
      
      if (primaryIndicatorName === 'sma') {
        previousIndicatorValue = this.calculateSMA(previousPrices, 20);
      } else if (primaryIndicatorName === 'ema') {
        previousIndicatorValue = this.calculateEMA(previousPrices, 20);
      } else if (primaryIndicatorName === 'wma') {
        previousIndicatorValue = this.calculateWMA(previousPrices, 20);
      } else if (primaryIndicatorName === 'hma') {
        previousIndicatorValue = this.calculateHMA(previousPrices, 20);
      }
      
      // CROSSOVER: preço cruza ACIMA da média (compra)
      if (condition.includes('crossover') || condition.includes('cruzou')) {
        if (condition.includes('acima') || condition.includes('above')) {
          // Crossover acima: preço estava abaixo da média e agora está acima
          if (previousIndicatorValue !== null) {
            entrySignal = previousCandle.close <= previousIndicatorValue && candle.close > primaryValue;
          } else {
            entrySignal = previousCandle.close <= primaryValue && candle.close > primaryValue;
          }
          side = 'buy';
        } else if (condition.includes('abaixo') || condition.includes('below')) {
          // Crossover abaixo: preço estava acima da média e agora está abaixo
          if (previousIndicatorValue !== null) {
            entrySignal = previousCandle.close >= previousIndicatorValue && candle.close < primaryValue;
          } else {
            entrySignal = previousCandle.close >= primaryValue && candle.close < primaryValue;
          }
          side = 'sell';
        } else {
          // Se apenas "crossover" sem especificar direção, detectar automaticamente
          if (previousIndicatorValue !== null) {
            // Crossover acima (compra)
            if (previousCandle.close <= previousIndicatorValue && candle.close > primaryValue) {
              entrySignal = true;
              side = 'buy';
            }
            // Crossover abaixo (venda)
            else if (previousCandle.close >= previousIndicatorValue && candle.close < primaryValue) {
              entrySignal = true;
              side = 'sell';
            }
          } else {
            // Fallback: detectar qualquer crossover
            if (previousCandle.close <= primaryValue && candle.close > primaryValue) {
              entrySignal = true;
              side = 'buy';
            } else if (previousCandle.close >= primaryValue && candle.close < primaryValue) {
              entrySignal = true;
              side = 'sell';
            }
          }
        }
      }
      // CROSSUNDER: preço cruza ABAIXO da média (venda) - implementação específica
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        if (previousIndicatorValue !== null) {
          // Crossunder: preço estava acima da média e agora está abaixo
          entrySignal = previousCandle.close >= previousIndicatorValue && candle.close < primaryValue;
        } else {
          entrySignal = previousCandle.close >= primaryValue && candle.close < primaryValue;
        }
        side = 'sell';
      }
      // ABOVE: preço está acima da média (compra)
      else if (condition.includes('acima') || condition.includes('above')) {
        entrySignal = candle.close > primaryValue;
        side = 'buy';
      }
      // BELOW: preço está abaixo da média (venda)
      else if (condition.includes('abaixo') || condition.includes('below')) {
        entrySignal = candle.close < primaryValue;
        side = 'sell';
      }
      // BREAKOUT: preço rompe acima da média com força (compra)
      else if (condition.includes('breakout')) {
        // Breakout: preço fecha acima da média e o candle tem alta significativa
        const candleRange = candle.high - candle.low;
        const priceMove = candle.close - candle.open;
        entrySignal = candle.close > primaryValue && priceMove > (candleRange * 0.6); // Pelo menos 60% do range do candle
        side = 'buy';
      }
      // BREAKDOWN: preço rompe abaixo da média com força (venda)
      else if (condition.includes('breakdown')) {
        // Breakdown: preço fecha abaixo da média e o candle tem queda significativa
        const candleRange = candle.high - candle.low;
        const priceMove = candle.open - candle.close;
        entrySignal = candle.close < primaryValue && priceMove > (candleRange * 0.6); // Pelo menos 60% do range do candle
        side = 'sell';
      }
    } else if (primaryIndicatorName.includes('bollinger')) {
      const bb = indicators.bollinger;
      if (bb) {
        const upper = bb.upper[bb.upper.length - 1];
        const lower = bb.lower[bb.lower.length - 1];
        const middle = bb.middle[bb.middle.length - 1];
        
        // Lógica de entrada baseada em Bollinger Bands
        if (condition.includes('tocou') || condition.includes('touched') || condition.includes('toca')) {
          if (condition.includes('inferior') || condition.includes('lower') || condition.includes('abaixo')) {
            // Preço tocou a banda inferior = compra (oversold)
            entrySignal = candle.low <= lower || (candle.close <= lower * 1.001); // Margem de 0.1%
            side = 'buy';
          } else if (condition.includes('superior') || condition.includes('upper') || condition.includes('acima')) {
            // Preço tocou a banda superior = venda (overbought)
            entrySignal = candle.high >= upper || (candle.close >= upper * 0.999); // Margem de 0.1%
            side = 'sell';
          }
        } else if (condition.includes('crossover') || condition.includes('cruzou')) {
          if (condition.includes('acima') || condition.includes('above')) {
            // Preço cruzou acima da média móvel central
            entrySignal = previousCandle.close <= middle && candle.close > middle;
            side = 'buy';
          } else {
            // Preço cruzou abaixo da média móvel central
            entrySignal = previousCandle.close >= middle && candle.close < middle;
            side = 'sell';
          }
        } else {
          // Lógica padrão: toque na banda inferior = compra, toque na superior = venda
          if (candle.low <= lower || candle.close <= lower * 1.001) {
            entrySignal = true;
            side = 'buy';
          } else if (candle.high >= upper || candle.close >= upper * 0.999) {
            entrySignal = true;
            side = 'sell';
          }
        }
      }
    } else if (primaryIndicatorName === 'hilo') {
      const hilo = indicators.hilo;
      if (hilo) {
        const upper = hilo.upper[hilo.upper.length - 1];
        const lower = hilo.lower[hilo.lower.length - 1];
        
        // Lógica de entrada baseada em HILO (similar ao Bollinger Bands)
        if (condition.includes('tocou') || condition.includes('touched') || condition.includes('toca')) {
          if (condition.includes('inferior') || condition.includes('lower') || condition.includes('abaixo')) {
            // Preço tocou a banda inferior = compra (oversold)
            entrySignal = candle.low <= lower || (candle.close <= lower * 1.001); // Margem de 0.1%
            side = 'buy';
          } else if (condition.includes('superior') || condition.includes('upper') || condition.includes('acima')) {
            // Preço tocou a banda superior = venda (overbought)
            entrySignal = candle.high >= upper || (candle.close >= upper * 0.999); // Margem de 0.1%
            side = 'sell';
          }
        }
        // CROSSOVER: preço cruzou acima da banda superior
        else if (condition.includes('crossover') || condition.includes('cruzou')) {
          if (condition.includes('acima') || condition.includes('above')) {
            entrySignal = previousCandle.close <= upper && candle.close > upper;
            side = 'buy';
          } else {
            entrySignal = previousCandle.close >= lower && candle.close < lower;
            side = 'sell';
          }
        }
        // CROSSUNDER: preço cruzou abaixo da banda inferior
        else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
          entrySignal = previousCandle.close >= lower && candle.close < lower;
          side = 'sell';
        }
        // ABOVE: preço está acima da banda superior
        else if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = candle.close > upper;
          side = 'buy';
        }
        // BELOW: preço está abaixo da banda inferior
        else if (condition.includes('abaixo') || condition.includes('below')) {
          entrySignal = candle.close < lower;
          side = 'sell';
        }
        // BREAKOUT: preço rompe acima da banda superior
        else if (condition.includes('breakout')) {
          entrySignal = candle.close > upper && previousCandle.close <= upper;
          side = 'buy';
        }
        // BREAKDOWN: preço rompe abaixo da banda inferior
        else if (condition.includes('breakdown')) {
          entrySignal = candle.close < lower && previousCandle.close >= lower;
          side = 'sell';
        }
        // Lógica padrão: toque na banda inferior = compra, toque na superior = venda
        else {
          if (candle.low <= lower || candle.close <= lower * 1.001) {
            entrySignal = true;
            side = 'buy';
          } else if (candle.high >= upper || candle.close >= upper * 0.999) {
            entrySignal = true;
            side = 'sell';
          }
        }
      }
    } else if (primaryIndicatorName === 'stochastic') {
      const stoch = indicators.stochastic;
      if (stoch) {
        // OVERSOLD: K < 20 (compra)
        if (condition.includes('oversold') || condition.includes('sobrevendido')) {
          entrySignal = stoch.k < (bot.entryValue || 20);
          side = 'buy';
        }
        // OVERBOUGHT: K > 80 (venda)
        else if (condition.includes('overbought') || condition.includes('sobrecomprado')) {
          entrySignal = stoch.k > (bot.entryValue || 80);
          side = 'sell';
        }
        // CROSSOVER: K cruza acima de D (compra)
        else if (condition.includes('crossover') || condition.includes('cruzou')) {
          if (condition.includes('acima') || condition.includes('above')) {
            const prevStoch = this.calculateStochastic(klines.slice(0, -1), 14, 3);
            entrySignal = prevStoch.k <= prevStoch.d && stoch.k > stoch.d;
            side = 'buy';
          } else {
            const prevStoch = this.calculateStochastic(klines.slice(0, -1), 14, 3);
            entrySignal = prevStoch.k >= prevStoch.d && stoch.k < stoch.d;
            side = 'sell';
          }
        }
        // CROSSUNDER: K cruza abaixo de D (venda)
        else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
          const prevStoch = this.calculateStochastic(klines.slice(0, -1), 14, 3);
          entrySignal = prevStoch.k >= prevStoch.d && stoch.k < stoch.d;
          side = 'sell';
        }
      }
    } else if (primaryIndicatorName === 'williamsr' || primaryIndicatorName === 'williams') {
      // OVERSOLD: %R < -80 (compra)
      if (condition.includes('oversold') || condition.includes('sobrevendido')) {
        entrySignal = primaryValue < (bot.entryValue || -80);
        side = 'buy';
      }
      // OVERBOUGHT: %R > -20 (venda)
      else if (condition.includes('overbought') || condition.includes('sobrecomprado')) {
        entrySignal = primaryValue > (bot.entryValue || -20);
        side = 'sell';
      }
      // CROSSOVER: %R cruza acima de -50 (compra)
      else if (condition.includes('crossover') || condition.includes('cruzou')) {
        const prevWR = this.calculateWilliamsR(klines.slice(0, -1), 14);
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = prevWR < -50 && primaryValue >= -50;
          side = 'buy';
        } else {
          entrySignal = prevWR > -50 && primaryValue <= -50;
          side = 'sell';
        }
      }
      // CROSSUNDER: %R cruza abaixo de -50 (venda)
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        const prevWR = this.calculateWilliamsR(klines.slice(0, -1), 14);
        entrySignal = prevWR > -50 && primaryValue <= -50;
        side = 'sell';
      }
    } else if (primaryIndicatorName === 'cci') {
      // OVERSOLD: CCI < -100 (compra)
      if (condition.includes('oversold') || condition.includes('sobrevendido')) {
        entrySignal = primaryValue < (bot.entryValue || -100);
        side = 'buy';
      }
      // OVERBOUGHT: CCI > 100 (venda)
      else if (condition.includes('overbought') || condition.includes('sobrecomprado')) {
        entrySignal = primaryValue > (bot.entryValue || 100);
        side = 'sell';
      }
      // CROSSOVER: CCI cruza acima de 0 (compra)
      else if (condition.includes('crossover') || condition.includes('cruzou')) {
        const prevCCI = this.calculateCCI(klines.slice(0, -1), 20);
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = prevCCI < 0 && primaryValue >= 0;
          side = 'buy';
        } else {
          entrySignal = prevCCI > 0 && primaryValue <= 0;
          side = 'sell';
        }
      }
      // CROSSUNDER: CCI cruza abaixo de 0 (venda)
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        const prevCCI = this.calculateCCI(klines.slice(0, -1), 20);
        entrySignal = prevCCI > 0 && primaryValue <= 0;
        side = 'sell';
      }
    } else if (primaryIndicatorName === 'adx') {
      const adx = indicators.adx;
      if (adx) {
        // ABOVE_THRESHOLD: ADX > 25 (tendência forte)
        if (condition.includes('above_threshold') || condition.includes('acima do limiar')) {
          entrySignal = adx.adx > (bot.entryValue || 25);
          side = adx.plusDI > adx.minusDI ? 'buy' : 'sell';
        }
        // BELOW_THRESHOLD: ADX < 25 (tendência fraca)
        else if (condition.includes('below_threshold') || condition.includes('abaixo do limiar')) {
          entrySignal = adx.adx < (bot.entryValue || 25);
          side = 'sell';
        }
        // RISING: ADX subindo (tendência se fortalecendo)
        else if (condition.includes('rising') || condition.includes('subindo')) {
          const prevADX = this.calculateADX(klines.slice(0, -1), 14);
          entrySignal = adx.adx > prevADX.adx;
          side = adx.plusDI > adx.minusDI ? 'buy' : 'sell';
        }
        // FALLING: ADX caindo (tendência se enfraquecendo)
        else if (condition.includes('falling') || condition.includes('caindo')) {
          const prevADX = this.calculateADX(klines.slice(0, -1), 14);
          entrySignal = adx.adx < prevADX.adx;
          side = 'sell';
        }
      }
    } else if (primaryIndicatorName === 'atr') {
      // HIGH_VOLATILITY: ATR alto (volatilidade alta)
      if (condition.includes('high_volatility') || condition.includes('alta volatilidade')) {
        const avgATR = this.calculateATR(klines.slice(0, -20), 14);
        entrySignal = primaryValue > avgATR * 1.5;
        side = 'buy';
      }
      // LOW_VOLATILITY: ATR baixo (volatilidade baixa)
      else if (condition.includes('low_volatility') || condition.includes('baixa volatilidade')) {
        const avgATR = this.calculateATR(klines.slice(0, -20), 14);
        entrySignal = primaryValue < avgATR * 0.5;
        side = 'sell';
      }
      // BREAKOUT: ATR aumentando (breakout)
      else if (condition.includes('breakout')) {
        const prevATR = this.calculateATR(klines.slice(0, -1), 14);
        entrySignal = primaryValue > prevATR * 1.2;
        side = 'buy';
      }
      // BREAKDOWN: ATR diminuindo (breakdown)
      else if (condition.includes('breakdown')) {
        const prevATR = this.calculateATR(klines.slice(0, -1), 14);
        entrySignal = primaryValue < prevATR * 0.8;
        side = 'sell';
      }
    } else if (primaryIndicatorName === 'parabolicsar' || primaryIndicatorName === 'parabolic') {
      // CROSSOVER: Preço cruza acima do SAR (compra)
      if (condition.includes('crossover') || condition.includes('cruzou')) {
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = previousCandle.close <= primaryValue && candle.close > primaryValue;
          side = 'buy';
        } else {
          entrySignal = previousCandle.close >= primaryValue && candle.close < primaryValue;
          side = 'sell';
        }
      }
      // CROSSUNDER: Preço cruza abaixo do SAR (venda)
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        entrySignal = previousCandle.close >= primaryValue && candle.close < primaryValue;
        side = 'sell';
      }
      // TREND_CHANGE: Mudança de tendência
      else if (condition.includes('trend_change') || condition.includes('mudança de tendência')) {
        const prevSAR = this.calculateParabolicSAR(klines.slice(0, -1));
        entrySignal = (prevSAR < previousCandle.close && primaryValue > candle.close) || 
                     (prevSAR > previousCandle.close && primaryValue < candle.close);
        side = primaryValue < candle.close ? 'buy' : 'sell';
      }
    } else if (primaryIndicatorName === 'obv') {
      // CROSSOVER: OBV cruza acima de uma média (compra)
      if (condition.includes('crossover') || condition.includes('cruzou')) {
        const prevOBV = this.calculateOBV(klines.slice(0, -1));
        const obvSMA = this.calculateSMA([prevOBV, primaryValue], 2);
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = prevOBV <= obvSMA && primaryValue > obvSMA;
          side = 'buy';
        } else {
          entrySignal = prevOBV >= obvSMA && primaryValue < obvSMA;
          side = 'sell';
        }
      }
      // CROSSUNDER: OBV cruza abaixo de uma média (venda)
      else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
        const prevOBV = this.calculateOBV(klines.slice(0, -1));
        const obvSMA = this.calculateSMA([prevOBV, primaryValue], 2);
        entrySignal = prevOBV >= obvSMA && primaryValue < obvSMA;
        side = 'sell';
      }
      // DIVERGENCE: Divergência de OBV
      else if (condition.includes('divergence') || condition.includes('divergência')) {
        // Simplificado: verificar se OBV está subindo enquanto preço cai (ou vice-versa)
        const prevOBV = this.calculateOBV(klines.slice(0, -1));
        const priceChange = candle.close - previousCandle.close;
        const obvChange = primaryValue - prevOBV;
        if (priceChange < 0 && obvChange > 0) {
          entrySignal = true; // Divergência de alta
          side = 'buy';
        } else if (priceChange > 0 && obvChange < 0) {
          entrySignal = true; // Divergência de baixa
          side = 'sell';
        }
      }
      // BREAKOUT: OBV rompe acima
      else if (condition.includes('breakout')) {
        const prevOBV = this.calculateOBV(klines.slice(0, -1));
        entrySignal = primaryValue > prevOBV * 1.1;
        side = 'buy';
      }
    } else if (primaryIndicatorName === 'volume') {
      // HIGH_VOLUME: Volume alto
      if (condition.includes('high_volume') || condition.includes('alto volume')) {
        const avgVolume = this.calculateVolume(klines.slice(0, -1), 20);
        entrySignal = primaryValue > avgVolume * 1.5;
        side = 'buy';
      }
      // LOW_VOLUME: Volume baixo
      else if (condition.includes('low_volume') || condition.includes('baixo volume')) {
        const avgVolume = this.calculateVolume(klines.slice(0, -1), 20);
        entrySignal = primaryValue < avgVolume * 0.5;
        side = 'sell';
      }
      // VOLUME_SPIKE: Pico de volume
      else if (condition.includes('volume_spike') || condition.includes('pico de volume')) {
        const avgVolume = this.calculateVolume(klines.slice(0, -1), 20);
        entrySignal = primaryValue > avgVolume * 2;
        side = 'buy';
      }
      // DIVERGENCE: Divergência de volume
      else if (condition.includes('divergence') || condition.includes('divergência')) {
        const prevVolume = this.calculateVolume(klines.slice(0, -1), 20);
        const priceChange = candle.close - previousCandle.close;
        const volumeChange = primaryValue - prevVolume;
        if (priceChange < 0 && volumeChange > 0) {
          entrySignal = true;
          side = 'buy';
        } else if (priceChange > 0 && volumeChange < 0) {
          entrySignal = true;
          side = 'sell';
        }
      }
    } else if (primaryIndicatorName === 'ichimoku' || primaryIndicatorName === 'ichimokucloud') {
      const ichimoku = indicators.ichimoku;
      if (ichimoku) {
        // CLOUD_BREAKOUT: Preço rompe acima da nuvem (compra)
        if (condition.includes('cloud_breakout') || condition.includes('rompe nuvem acima')) {
          entrySignal = candle.close > ichimoku.cloudTop && previousCandle.close <= ichimoku.cloudTop;
          side = 'buy';
        }
        // CLOUD_BREAKDOWN: Preço rompe abaixo da nuvem (venda)
        else if (condition.includes('cloud_breakdown') || condition.includes('rompe nuvem abaixo')) {
          entrySignal = candle.close < ichimoku.cloudBottom && previousCandle.close >= ichimoku.cloudBottom;
          side = 'sell';
        }
        // LINE_CROSSOVER: Tenkan-sen cruza acima de Kijun-sen (compra)
        else if (condition.includes('line_crossover') || condition.includes('cruzamento de linhas')) {
          if (condition.includes('acima') || condition.includes('above')) {
            entrySignal = ichimoku.tenkanSen > ichimoku.kijunSen;
            side = 'buy';
          } else {
            entrySignal = ichimoku.tenkanSen < ichimoku.kijunSen;
            side = 'sell';
          }
        }
        // PRICE_CLOUD_POSITION: Preço acima/abaixo da nuvem
        else if (condition.includes('price_cloud_position') || condition.includes('posição preço nuvem')) {
          if (condition.includes('acima') || condition.includes('above')) {
            entrySignal = candle.close > ichimoku.cloudTop;
            side = 'buy';
          } else {
            entrySignal = candle.close < ichimoku.cloudBottom;
            side = 'sell';
          }
        }
      }
    }

    // Se há indicador secundário, verificar cruzamento entre médias
    if (!entrySignal && secondaryValue !== null && bot.secondaryIndicator) {
      if (condition.includes('crossover') || condition.includes('cruzou')) {
        if (condition.includes('acima') || condition.includes('above')) {
          entrySignal = primaryValue <= secondaryValue && 
                       this.getPreviousIndicator(klines, indicators, 'primary') < this.getPreviousIndicator(klines, indicators, 'secondary') &&
                       primaryValue > secondaryValue;
          side = 'buy';
        } else {
          entrySignal = primaryValue >= secondaryValue &&
                       this.getPreviousIndicator(klines, indicators, 'primary') > this.getPreviousIndicator(klines, indicators, 'secondary') &&
                       primaryValue < secondaryValue;
          side = 'sell';
        }
      }
    }

    // Se o indicador primário é Bollinger Bands e há média móvel como secundário, verificar cruzamento
    const secondaryIndicatorName = (bot.secondaryIndicator || '').toLowerCase();
    if (!entrySignal && primaryIndicatorName.includes('bollinger') && (secondaryIndicatorName === 'sma' || secondaryIndicatorName === 'ema')) {
      const bb = indicators.bollinger;
      if (bb && secondaryValue !== null) {
        const bbMiddle = bb.middle[bb.middle.length - 1];
        if (condition.includes('crossover') || condition.includes('cruzou')) {
          if (condition.includes('acima') || condition.includes('above')) {
            // Média móvel cruzou acima da banda média
            entrySignal = previousCandle.close <= bbMiddle && candle.close > bbMiddle && bbMiddle > secondaryValue;
            side = 'buy';
          } else {
            // Média móvel cruzou abaixo da banda média
            entrySignal = previousCandle.close >= bbMiddle && candle.close < bbMiddle && bbMiddle < secondaryValue;
            side = 'sell';
          }
        }
      }
    }

    return { shouldTrade: entrySignal, side };
  }

  /**
   * Retorna sinal de entrada padrão baseado no indicador
   */
  private static getDefaultEntrySignal(indicators: any, bot: any, candle: Candle): { shouldTrade: boolean; side: 'buy' | 'sell' } {
    let primaryIndicatorName = '';
    if (bot.indicators && Array.isArray(bot.indicators) && bot.indicators.length > 0) {
      const primaryIndicator = bot.indicators.find((ind: any) => ind.type === 'primary');
      if (primaryIndicator) {
        primaryIndicatorName = (primaryIndicator.name || '').toLowerCase();
      }
    } else {
      primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
    }
    
    if (primaryIndicatorName === 'rsi') {
      if (indicators.primary < 30) {
        return { shouldTrade: true, side: 'buy' };
      } else if (indicators.primary > 70) {
        return { shouldTrade: true, side: 'sell' };
      }
    } else if (primaryIndicatorName === 'macd') {
      if (indicators.macd && indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
        return { shouldTrade: true, side: 'buy' };
      } else if (indicators.macd && indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
        return { shouldTrade: true, side: 'sell' };
      }
    } else if (primaryIndicatorName.includes('bollinger')) {
      const bb = indicators.bollinger;
      if (bb) {
        const idx = bb.upper.length - 1;
        const upper = bb.upper[idx];
        const lower = bb.lower[idx];
        
        if (candle.low <= lower || candle.close <= lower * 1.001) {
          return { shouldTrade: true, side: 'buy' };
        } else if (candle.high >= upper || candle.close >= upper * 0.999) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    } else if (primaryIndicatorName === 'hilo') {
      const hilo = indicators.hilo;
      if (hilo) {
        const idx = hilo.upper.length - 1;
        const upper = hilo.upper[idx];
        const lower = hilo.lower[idx];
        
        if (candle.low <= lower || candle.close <= lower * 1.001) {
          return { shouldTrade: true, side: 'buy' };
        } else if (candle.high >= upper || candle.close >= upper * 0.999) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    } else if (primaryIndicatorName === 'sma' || primaryIndicatorName === 'ema' || primaryIndicatorName === 'wma' || primaryIndicatorName === 'hma') {
      if (indicators.primary !== null && indicators.primary !== undefined) {
        if (candle.close > indicators.primary) {
          return { shouldTrade: true, side: 'buy' };
        } else if (candle.close < indicators.primary) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    } else if (primaryIndicatorName === 'stochastic') {
      const stoch = indicators.stochastic;
      if (stoch) {
        if (stoch.k < 20) {
          return { shouldTrade: true, side: 'buy' };
        } else if (stoch.k > 80) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    } else if (primaryIndicatorName === 'williamsr' || primaryIndicatorName === 'williams') {
      if (indicators.primary < -80) {
        return { shouldTrade: true, side: 'buy' };
      } else if (indicators.primary > -20) {
        return { shouldTrade: true, side: 'sell' };
      }
    } else if (primaryIndicatorName === 'cci') {
      if (indicators.primary < -100) {
        return { shouldTrade: true, side: 'buy' };
      } else if (indicators.primary > 100) {
        return { shouldTrade: true, side: 'sell' };
      }
    } else if (primaryIndicatorName === 'adx') {
      const adx = indicators.adx;
      if (adx && adx.adx > 25) {
        return { shouldTrade: true, side: adx.plusDI > adx.minusDI ? 'buy' : 'sell' };
      }
    } else if (primaryIndicatorName === 'parabolicsar' || primaryIndicatorName === 'parabolic') {
      if (indicators.primary !== null && indicators.primary !== undefined) {
        if (candle.close > indicators.primary) {
          return { shouldTrade: true, side: 'buy' };
        } else if (candle.close < indicators.primary) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    } else if (primaryIndicatorName === 'ichimoku' || primaryIndicatorName === 'ichimokucloud') {
      const ichimoku = indicators.ichimoku;
      if (ichimoku) {
        if (candle.close > ichimoku.cloudTop) {
          return { shouldTrade: true, side: 'buy' };
        } else if (candle.close < ichimoku.cloudBottom) {
          return { shouldTrade: true, side: 'sell' };
        }
      }
    }
    return { shouldTrade: false, side: 'buy' };
  }

  /**
   * Verifica se as condições de saída são atendidas
   */
  private static checkExitSignal(
    candle: Candle,
    klines: Candle[],
    indicators: any,
    bot: any,
    trade: any
  ): boolean {
    const condition = (bot.exitCondition || '').toLowerCase();
    if (!condition) return false;

    // ESTRATÉGIA DE CRUZAMENTO DE MÉDIAS MÓVEIS - SAÍDA
    // Detectar cruzamento entre múltiplas médias móveis para saída
    if (indicators.movingAverages && indicators.movingAverages.length >= 2 && 
        indicators.movingAveragesPrevious && indicators.movingAveragesPrevious.length >= 2) {
      
      // Verificar cruzamentos entre médias adjacentes (ordenadas por período)
      for (let i = 0; i < indicators.movingAverages.length - 1; i++) {
        const fastMA = indicators.movingAverages[i]; // Média rápida (menor período)
        const slowMA = indicators.movingAverages[i + 1]; // Média lenta (maior período)
        const fastMAPrev = indicators.movingAveragesPrevious[i];
        const slowMAPrev = indicators.movingAveragesPrevious[i + 1];
        
        // CROSSUNDER: Média rápida cruza ABAIXO da média lenta (venda/saída de compra)
        if (condition.includes('crossunder') || condition === 'crossunder') {
          // Se estava em compra e a média rápida cruza abaixo da lenta, sair
          if (trade.side === 'buy') {
            if (fastMAPrev.value >= slowMAPrev.value && fastMA.value < slowMA.value) {
              console.log(`✅ CROSSUNDER DE SAÍDA DETECTADO: ${fastMA.name.toUpperCase()}(${fastMA.period}) cruzou abaixo de ${slowMA.name.toUpperCase()}(${slowMA.period}) - SAIR DA COMPRA`);
              return true;
            }
          }
          // Se estava em venda e a média rápida cruza abaixo da lenta, manter venda (não sair ainda)
        }
        
        // CROSSOVER: Média rápida cruza ACIMA da média lenta (compra/saída de venda)
        if (condition.includes('crossover') || condition === 'crossover') {
          // Se estava em venda e a média rápida cruza acima da lenta, sair
          if (trade.side === 'sell') {
            if (fastMAPrev.value <= slowMAPrev.value && fastMA.value > slowMA.value) {
              console.log(`✅ CROSSOVER DE SAÍDA DETECTADO: ${fastMA.name.toUpperCase()}(${fastMA.period}) cruzou acima de ${slowMA.name.toUpperCase()}(${slowMA.period}) - SAIR DA VENDA`);
              return true;
            }
          }
        }
      }
    }

    // Lógica similar à entrada, mas invertida (formato antigo)
    const primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
    
    if (primaryIndicatorName === 'rsi') {
      if (trade.side === 'buy') {
        return indicators.primary > (bot.exitValue || 70);
      } else {
        return indicators.primary < (bot.exitValue || 30);
      }
    }

    return false;
  }

  /**
   * Calcula indicadores técnicos
   */
  private static calculateIndicators(klines: Candle[], bot: any): any {
    const prices = klines.map(k => k.close);
    const indicators: any = {};

    // Obter parâmetros do bot (pode vir de bot.indicators array ou bot.primaryIndicator)
    let primaryIndicatorName = '';
    let primaryPeriod = 20;
    
    if (bot.indicators && Array.isArray(bot.indicators) && bot.indicators.length > 0) {
      // Novo formato: array de indicadores
      const primaryIndicator = bot.indicators.find((ind: any) => ind.type === 'primary');
      if (primaryIndicator) {
        primaryIndicatorName = (primaryIndicator.name || '').toLowerCase();
        primaryPeriod = primaryIndicator.parameters?.period || 20;
      }
    } else {
      // Formato antigo: campos diretos
      primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
      primaryPeriod = bot.primaryPeriod || 20;
    }
    
    // Calcular indicador primário
    if (primaryIndicatorName === 'rsi') {
      indicators.primary = this.calculateRSI(prices, primaryPeriod || 14);
      indicators.rsi = indicators.primary;
    } else if (primaryIndicatorName === 'macd') {
      indicators.macd = this.calculateMACD(prices);
      indicators.primary = indicators.macd.macd;
    } else if (primaryIndicatorName === 'sma') {
      indicators.primary = this.calculateSMA(prices, primaryPeriod);
      indicators.sma = indicators.primary;
    } else if (primaryIndicatorName === 'ema') {
      indicators.primary = this.calculateEMA(prices, primaryPeriod);
      indicators.ema = indicators.primary;
    } else if (primaryIndicatorName === 'wma') {
      indicators.primary = this.calculateWMA(prices, primaryPeriod);
      indicators.wma = indicators.primary;
    } else if (primaryIndicatorName === 'hma') {
      indicators.primary = this.calculateHMA(prices, primaryPeriod);
      indicators.hma = indicators.primary;
    } else if (primaryIndicatorName.includes('bollinger')) {
      const period = primaryPeriod || 20;
      const stdDev = bot.indicators?.find((ind: any) => ind.name?.toLowerCase().includes('bollinger'))?.parameters?.stdDev || 2;
      const bbResult = this.calculateBollingerBands(klines, period, stdDev);
      indicators.bollinger = bbResult;
      indicators.primary = bbResult.middle[bbResult.middle.length - 1];
    } else if (primaryIndicatorName === 'hilo') {
      const period = primaryPeriod || 20;
      const multiplier = bot.indicators?.find((ind: any) => ind.name?.toLowerCase() === 'hilo')?.parameters?.multiplier || 2;
      const hiloResult = this.calculateHILO(klines, period, multiplier);
      indicators.hilo = hiloResult;
      indicators.primary = (hiloResult.upper[hiloResult.upper.length - 1] + hiloResult.lower[hiloResult.lower.length - 1]) / 2;
    } else if (primaryIndicatorName === 'stochastic') {
      const kPeriod = primaryPeriod || 14;
      const dPeriod = bot.indicators?.find((ind: any) => ind.name?.toLowerCase() === 'stochastic')?.parameters?.dPeriod || 3;
      const stoch = this.calculateStochastic(klines, kPeriod, dPeriod);
      indicators.stochastic = stoch;
      indicators.primary = stoch.k;
    } else if (primaryIndicatorName === 'williamsr' || primaryIndicatorName === 'williams') {
      indicators.primary = this.calculateWilliamsR(klines, primaryPeriod || 14);
      indicators.williamsR = indicators.primary;
    } else if (primaryIndicatorName === 'cci') {
      indicators.primary = this.calculateCCI(klines, primaryPeriod || 20);
      indicators.cci = indicators.primary;
    } else if (primaryIndicatorName === 'adx') {
      const adxResult = this.calculateADX(klines, primaryPeriod || 14);
      indicators.adx = adxResult;
      indicators.primary = adxResult.adx;
    } else if (primaryIndicatorName === 'atr') {
      indicators.primary = this.calculateATR(klines, primaryPeriod || 14);
      indicators.atr = indicators.primary;
    } else if (primaryIndicatorName === 'parabolicsar' || primaryIndicatorName === 'parabolic') {
      const acceleration = bot.indicators?.find((ind: any) => ind.name?.toLowerCase().includes('parabolic'))?.parameters?.acceleration || 0.02;
      const maximum = bot.indicators?.find((ind: any) => ind.name?.toLowerCase().includes('parabolic'))?.parameters?.maximum || 0.2;
      indicators.primary = this.calculateParabolicSAR(klines, acceleration, maximum);
      indicators.parabolicSAR = indicators.primary;
    } else if (primaryIndicatorName === 'obv') {
      indicators.primary = this.calculateOBV(klines);
      indicators.obv = indicators.primary;
    } else if (primaryIndicatorName === 'volume') {
      indicators.primary = this.calculateVolume(klines, primaryPeriod || 20);
      indicators.volume = indicators.primary;
    } else if (primaryIndicatorName === 'ichimoku' || primaryIndicatorName === 'ichimokucloud') {
      const ichimoku = this.calculateIchimokuCloud(klines);
      indicators.ichimoku = ichimoku;
      indicators.primary = ichimoku.tenkanSen;
    } else {
      indicators.primary = null;
    }

    // Indicador secundário (formato antigo - manter compatibilidade)
    const secondaryIndicatorName = (bot.secondaryIndicator || '').toLowerCase();
    
    if (secondaryIndicatorName === 'sma') {
      indicators.secondary = this.calculateSMA(prices, 50);
    } else if (secondaryIndicatorName === 'ema') {
      indicators.secondary = this.calculateEMA(prices, 50);
    } else if (secondaryIndicatorName.includes('bollinger')) {
      if (!indicators.bollinger) {
        const bbResult = this.calculateBollingerBands(klines, 20, 2);
        indicators.bollinger = bbResult;
      }
      indicators.secondary = indicators.bollinger.middle[indicators.bollinger.middle.length - 1];
    } else {
      indicators.secondary = null;
    }

    // Calcular múltiplas médias móveis para estratégia de cruzamento de médias
    if (bot.indicators && Array.isArray(bot.indicators)) {
      const primaryIndicators = bot.indicators.filter((ind: any) => ind.type === 'primary');
      const movingAverages = primaryIndicators.filter((ind: any) => {
        const name = (ind.name || '').toLowerCase();
        return name === 'sma' || name === 'ema' || name === 'wma' || name === 'hma';
      });

      // Se há múltiplas médias móveis, calcular todas
      if (movingAverages.length >= 2) {
        indicators.movingAverages = [];
        indicators.movingAveragesPrevious = [];
        
        for (const ma of movingAverages) {
          const maName = (ma.name || '').toLowerCase();
          const maPeriod = ma.parameters?.period || 20;
          let currentValue: number;
          let previousValue: number;
          
          // Calcular valor atual
          if (maName === 'sma') {
            currentValue = this.calculateSMA(prices, maPeriod);
          } else if (maName === 'ema') {
            currentValue = this.calculateEMA(prices, maPeriod);
          } else if (maName === 'wma') {
            currentValue = this.calculateWMA(prices, maPeriod);
          } else if (maName === 'hma') {
            currentValue = this.calculateHMA(prices, maPeriod);
          } else {
            continue;
          }
          
          // Calcular valor anterior
          const previousPrices = klines.slice(0, -1).map(k => k.close);
          if (maName === 'sma') {
            previousValue = this.calculateSMA(previousPrices, maPeriod);
          } else if (maName === 'ema') {
            previousValue = this.calculateEMA(previousPrices, maPeriod);
          } else if (maName === 'wma') {
            previousValue = this.calculateWMA(previousPrices, maPeriod);
          } else if (maName === 'hma') {
            previousValue = this.calculateHMA(previousPrices, maPeriod);
          } else {
            previousValue = currentValue;
          }
          
          indicators.movingAverages.push({
            name: maName,
            period: maPeriod,
            value: currentValue
          });
          
          indicators.movingAveragesPrevious.push({
            name: maName,
            period: maPeriod,
            value: previousValue
          });
        }
        
        // Ordenar por período para facilitar comparação
        indicators.movingAverages.sort((a: any, b: any) => a.period - b.period);
        indicators.movingAveragesPrevious.sort((a: any, b: any) => a.period - b.period);
      }
      
      // Calcular indicadores de confirmação (novo formato)
      const confirmationIndicators = bot.indicators.filter((ind: any) => ind.type === 'confirmation');
      for (const confIndicator of confirmationIndicators) {
        const confName = (confIndicator.name || '').toLowerCase();
        const confPeriod = confIndicator.parameters?.period || 20;
        
        if (confName === 'rsi') {
          indicators.confirmationRSI = this.calculateRSI(prices, confPeriod || 14);
        } else if (confName === 'sma') {
          indicators.confirmationSMA = this.calculateSMA(prices, confPeriod);
        } else if (confName === 'ema') {
          indicators.confirmationEMA = this.calculateEMA(prices, confPeriod);
        } else if (confName === 'macd') {
          indicators.confirmationMACD = this.calculateMACD(prices);
        }
        // Adicionar outros conforme necessário
      }
    }

    return indicators;
  }

  /**
   * Calcula o período de lookback necessário baseado no indicador
   */
  private static getLookbackPeriod(indicator: string): number {
    const indicatorName = (indicator || '').toLowerCase();
    const periods: Record<string, number> = {
      'rsi': 50,
      'macd': 100,
      'sma': 100,
      'ema': 100,
      'wma': 100,
      'hma': 100,
      'bollinger': 100,
      'ichimoku': 100,
      'hilo': 100,
      'stochastic': 50,
      'williamsr': 50,
      'williams': 50,
      'cci': 100,
      'adx': 100,
      'atr': 50,
      'parabolicsar': 50,
      'parabolic': 50,
      'obv': 100,
      'volume': 100
    };
    
    // Verificar se o indicador contém alguma das chaves
    for (const [key, value] of Object.entries(periods)) {
      if (indicatorName.includes(key)) {
        return value;
      }
    }
    
    return 100; // Padrão
  }

  /**
   * Obtém minutos do timeframe
   */
  private static getTimeframeMinutes(timeframe: string): number {
    const mapping: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440
    };
    return mapping[timeframe] || 60;
  }

  /**
   * Verifica se o robô pode operar no horário agendado
   */
  private static checkScheduledOperationTime(bot: any): boolean {
    try {
      if (!bot.operationTime) {
        // Se não há configuração de horário, permitir operação
        return true;
      }

      // Parse do JSON do operationTime
      let operationTime: any;
      if (typeof bot.operationTime === 'string') {
        operationTime = JSON.parse(bot.operationTime);
      } else {
        operationTime = bot.operationTime;
      }

      if (!operationTime || !operationTime.startTime || !operationTime.endTime) {
        // Se não há horários configurados, permitir operação
        return true;
      }

      const now = new Date();
      const currentDayOfWeek = now.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Verificar dia da semana
      if (operationTime.daysOfWeek && Array.isArray(operationTime.daysOfWeek)) {
        if (!operationTime.daysOfWeek.includes(currentDayOfWeek)) {
          console.log(`📅 Robô ${bot.name}: Hoje é ${this.getDayName(currentDayOfWeek)}, mas o robô só opera nos dias: ${operationTime.daysOfWeek.map((d: number) => this.getDayName(d)).join(', ')}`);
          return false;
        }
      }

      // Verificar horário
      const startTime = operationTime.startTime; // Formato: "HH:MM"
      const endTime = operationTime.endTime; // Formato: "HH:MM"

      if (currentTime < startTime || currentTime > endTime) {
        console.log(`⏰ Robô ${bot.name}: Horário atual (${currentTime}) está fora do horário permitido (${startTime} - ${endTime})`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Erro ao verificar horário agendado do robô ${bot.name}:`, error);
      // Em caso de erro, permitir operação para não bloquear o robô
      return true;
    }
  }

  /**
   * Retorna o nome do dia da semana
   */
  private static getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[dayOfWeek] || 'Desconhecido';
  }

  /**
   * Verifica se há saldo suficiente disponível para operar
   */
  private static async hasSufficientBalance(bot: any, currentPrice: number): Promise<{ hasBalance: boolean; balance: number; requiredAmount: number }> {
    try {
      // Buscar carteira virtual do usuário
      const wallet = await prisma.wallet.findFirst({
        where: {
          userId: bot.userId,
          type: 'virtual',
          symbol: 'USDT'
        }
      });

      // Se não tem carteira ou saldo muito baixo, não tem saldo suficiente
      const balance = wallet?.balance || 0;
      const MINIMUM_BALANCE = 1; // Saldo mínimo necessário (1 USDT)
      
      if (balance < MINIMUM_BALANCE) {
        return { hasBalance: false, balance, requiredAmount: MINIMUM_BALANCE };
      }

      // Calcular valor necessário para uma posição mínima
      let requiredAmount = 0;
      if (bot.positionSizingType === 'fixed') {
        requiredAmount = bot.positionSizingValue || 100;
      } else if (bot.positionSizingType === 'percentage') {
        const percentage = (bot.positionSizingValue || 10) / 100;
        requiredAmount = balance * percentage;
      } else {
        // Para outros tipos, usar mínimo de 10 USDT
        requiredAmount = 10;
      }

      // Verificar se tem saldo suficiente para uma posição mínima
      if (balance < requiredAmount) {
        return { hasBalance: false, balance, requiredAmount };
      }

      return { hasBalance: true, balance, requiredAmount };
    } catch (error) {
      console.error('Erro ao verificar saldo:', error);
      return { hasBalance: false, balance: 0, requiredAmount: 0 };
    }
  }

  /**
   * Calcula tamanho da posição
   */
  private static async calculatePositionSize(bot: any, currentPrice: number): Promise<number> {
    let quantity = 0.001;

    if (bot.positionSizingType === 'fixed') {
      quantity = (bot.positionSizingValue || 100) / currentPrice;
    } else if (bot.positionSizingType === 'percentage') {
      const wallet = await prisma.wallet.findFirst({
        where: {
          userId: bot.userId,
          type: 'virtual',
          symbol: 'USDT'
        }
      });
      const balance = wallet?.balance || 0;
      const percentage = (bot.positionSizingValue || 10) / 100;
      quantity = (balance * percentage) / currentPrice;
    }

    if (bot.maxPosition && quantity > bot.maxPosition) {
      quantity = bot.maxPosition;
    }

    return Math.max(0.000001, quantity); // Mínimo de 0.000001
  }

  /**
   * Atualiza o saldo virtual do usuário com o P/L de um trade fechado
   */
  static async updateVirtualWalletWithPnL(userId: string, pnl: number): Promise<void> {
    try {
      if (Math.abs(pnl) < 0.01) {
        // P/L muito pequeno, ignorar para evitar atualizações desnecessárias
        return;
      }

      // Buscar carteira virtual USDT do usuário
      const usdtWallet = await prisma.wallet.findUnique({
        where: {
          userId_type_symbol: {
            userId,
            type: 'virtual',
            symbol: 'USDT'
          }
        }
      });

      if (!usdtWallet) {
        // Se não existe carteira USDT, criar uma com saldo inicial + P/L
        const initialBalance = 10000;
        await prisma.wallet.create({
          data: {
            userId,
            type: 'virtual',
            symbol: 'USDT',
            name: 'Tether',
            balance: initialBalance + pnl,
            value: initialBalance + pnl,
            isActive: true
          }
        });
        console.log(`💰 Carteira USDT criada para usuário ${userId} com saldo: ${(initialBalance + pnl).toFixed(2)}`);
      } else {
        // Atualizar saldo existente
        const newBalance = usdtWallet.balance + pnl;
        const newValue = usdtWallet.value + pnl;

        // Se o saldo ficar negativo ou muito pequeno, definir como mínimo
        const minBalance = 0.01;
        const finalBalance = Math.max(minBalance, newBalance);
        const finalValue = Math.max(minBalance, newValue);

        await prisma.wallet.update({
          where: {
            userId_type_symbol: {
              userId,
              type: 'virtual',
              symbol: 'USDT'
            }
          },
          data: {
            balance: finalBalance,
            value: finalValue,
            isActive: true
          }
        });

        console.log(`💰 Saldo virtual atualizado: ${usdtWallet.balance.toFixed(2)} → ${finalBalance.toFixed(2)} (P/L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)})`);
      }
    } catch (error) {
      console.error(`❌ Erro ao atualizar saldo virtual com P/L:`, error);
      // Não lançar erro para não interromper o processo de fechamento do trade
    }
  }

  /**
   * Calcula stop loss.
   * - fixed: value é percentual (ex: 2 = 2%)
   * - price: value é o preço em USDT (ex: 95000)
   */
  private static calculateStopLoss(price: number, side: 'buy' | 'sell', value: number, type: string): number | null {
    if (type === 'price') {
      return value;
    }
    if (type === 'fixed') {
      return side === 'buy'
        ? price * (1 - value / 100)
        : price * (1 + value / 100);
    }
    return null;
  }

  /**
   * Calcula take profit.
   * - fixed: value é percentual (ex: 4 = 4%)
   * - price: value é o preço em USDT (ex: 105000)
   */
  private static calculateTakeProfit(price: number, side: 'buy' | 'sell', value: number, type: string): number | null {
    if (type === 'price') {
      return value;
    }
    if (type === 'fixed') {
      return side === 'buy'
        ? price * (1 + value / 100)
        : price * (1 - value / 100);
    }
    return null;
  }

  /**
   * Obtém valor anterior do indicador
   */
  private static getPreviousIndicator(klines: Candle[], indicators: any, type: 'primary' | 'secondary'): number {
    // Simplificado - retorna o valor atual
    return type === 'primary' ? indicators.primary : indicators.secondary;
  }

  /**
   * Calcula o RSI (Relative Strength Index)
   */
  private static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

    if (gains.length === 0 || losses.length === 0) return 50;

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, gains.length);
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, losses.length);

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calcula o MACD
   */
  private static calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
    if (prices.length < 26) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;

    // Signal line (simplificado)
    const signal = macd * 0.9; // Aproximação

    return {
      macd,
      signal,
      histogram: macd - signal
    };
  }

  /**
   * Calcula a SMA (Simple Moving Average)
   */
  private static calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }
    return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Calcula a EMA (Exponential Moving Average)
   */
  private static calculateEMA(values: number[], period: number): number {
    if (values.length === 0) return 0;
    if (values.length < period) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calcula HILO (High-Low)
   */
  private static calculateHILO(klines: Candle[], period: number = 20, multiplier: number = 2): { upper: number[]; lower: number[] } {
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < klines.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        lower.push(NaN);
        continue;
      }

      const slice = klines.slice(i - period + 1, i + 1);
      const highs = slice.map(k => k.high);
      const lows = slice.map(k => k.low);
      
      const highest = Math.max(...highs);
      const lowest = Math.min(...lows);
      const range = highest - lowest;
      
      upper.push(highest + (range * multiplier));
      lower.push(lowest - (range * multiplier));
    }

    return { upper, lower };
  }

  /**
   * Calcula Bollinger Bands
   */
  private static calculateBollingerBands(klines: Candle[], period: number = 20, stdDev: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
    const prices = klines.map(k => k.close);
    const upper: number[] = [];
    const middle: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        middle.push(NaN);
        lower.push(NaN);
        continue;
      }

      const slice = prices.slice(i - period + 1, i + 1);
      const sma = slice.reduce((acc, price) => acc + price, 0) / period;
      
      const variance = slice.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      middle.push(sma);
      upper.push(sma + (stdDev * standardDeviation));
      lower.push(sma - (stdDev * standardDeviation));
    }

    return { upper, middle, lower };
  }

  /**
   * Calcula WMA (Weighted Moving Average)
   */
  private static calculateWMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    const slice = prices.slice(-period);
    let weightedSum = 0;
    let weightSum = 0;

    for (let i = 0; i < slice.length; i++) {
      const weight = period - i;
      weightedSum += slice[i] * weight;
      weightSum += weight;
    }

    return weightedSum / weightSum;
  }

  /**
   * Calcula HMA (Hull Moving Average)
   */
  private static calculateHMA(prices: number[], period: number): number {
    if (prices.length < period * 2) {
      return this.calculateWMA(prices, Math.floor(period / 2));
    }

    const sqrtPeriod = Math.floor(Math.sqrt(period));
    const wmaHalf = this.calculateWMA(prices.slice(-Math.floor(period / 2)), Math.floor(period / 2));
    const wmaFull = this.calculateWMA(prices.slice(-period), period);
    
    // Calcular HMA usando WMA de (2*WMA(n/2) - WMA(n))
    const hmaInput = [2 * wmaHalf - wmaFull];
    return this.calculateWMA(hmaInput.concat(prices.slice(-sqrtPeriod + 1)), sqrtPeriod);
  }

  /**
   * Calcula Stochastic Oscillator
   */
  private static calculateStochastic(klines: Candle[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number } {
    if (klines.length < kPeriod) {
      return { k: 50, d: 50 };
    }

    const slice = klines.slice(-kPeriod);
    const highest = Math.max(...slice.map(k => k.high));
    const lowest = Math.min(...slice.map(k => k.low));
    const currentClose = klines[klines.length - 1].close;

    if (highest === lowest) {
      return { k: 50, d: 50 };
    }

    const k = ((currentClose - lowest) / (highest - lowest)) * 100;

    // Calcular D (média móvel de K)
    let d = k;
    if (klines.length >= kPeriod + dPeriod - 1) {
      const kValues: number[] = [];
      for (let i = klines.length - dPeriod; i < klines.length; i++) {
        const periodSlice = klines.slice(i - kPeriod + 1, i + 1);
        const periodHighest = Math.max(...periodSlice.map(c => c.high));
        const periodLowest = Math.min(...periodSlice.map(c => c.low));
        const periodClose = klines[i].close;
        if (periodHighest !== periodLowest) {
          kValues.push(((periodClose - periodLowest) / (periodHighest - periodLowest)) * 100);
        } else {
          kValues.push(50);
        }
      }
      d = kValues.reduce((a, b) => a + b, 0) / kValues.length;
    }

    return { k, d };
  }

  /**
   * Calcula Williams %R
   */
  private static calculateWilliamsR(klines: Candle[], period: number = 14): number {
    if (klines.length < period) {
      return -50;
    }

    const slice = klines.slice(-period);
    const highest = Math.max(...slice.map(k => k.high));
    const lowest = Math.min(...slice.map(k => k.low));
    const currentClose = klines[klines.length - 1].close;

    if (highest === lowest) {
      return -50;
    }

    return ((highest - currentClose) / (highest - lowest)) * -100;
  }

  /**
   * Calcula CCI (Commodity Channel Index)
   */
  private static calculateCCI(klines: Candle[], period: number = 20): number {
    if (klines.length < period) {
      return 0;
    }

    const slice = klines.slice(-period);
    const typicalPrices = slice.map(k => (k.high + k.low + k.close) / 3);
    const sma = typicalPrices.reduce((a, b) => a + b, 0) / period;
    
    const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
    
    if (meanDeviation === 0) {
      return 0;
    }

    const currentTP = (klines[klines.length - 1].high + klines[klines.length - 1].low + klines[klines.length - 1].close) / 3;
    return (currentTP - sma) / (0.015 * meanDeviation);
  }

  /**
   * Calcula ADX (Average Directional Index)
   */
  private static calculateADX(klines: Candle[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
    if (klines.length < period + 1) {
      return { adx: 25, plusDI: 25, minusDI: 25 };
    }

    const trueRanges: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines[i - 1];

      // True Range
      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);
      trueRanges.push(Math.max(tr1, tr2, tr3));

      // Directional Movement
      const plusDM = current.high - previous.high > previous.low - current.low 
        ? Math.max(current.high - previous.high, 0) 
        : 0;
      const minusDM = previous.low - current.low > current.high - previous.high 
        ? Math.max(previous.low - current.low, 0) 
        : 0;

      plusDMs.push(plusDM);
      minusDMs.push(minusDM);
    }

    // Calcular médias suavizadas
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let plusDI = plusDMs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let minusDI = minusDMs.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Suavização exponencial
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      plusDI = (plusDI * (period - 1) + plusDMs[i]) / period;
      minusDI = (minusDI * (period - 1) + minusDMs[i]) / period;
    }

    // Calcular DI+ e DI-
    const plusDIValue = atr !== 0 ? (plusDI / atr) * 100 : 0;
    const minusDIValue = atr !== 0 ? (minusDI / atr) * 100 : 0;

    // Calcular DX
    const dx = (plusDIValue + minusDIValue) !== 0 
      ? (Math.abs(plusDIValue - minusDIValue) / (plusDIValue + minusDIValue)) * 100 
      : 0;

    // ADX é a média móvel do DX (simplificado)
    return { adx: dx, plusDI: plusDIValue, minusDI: minusDIValue };
  }

  /**
   * Calcula ATR (Average True Range)
   */
  private static calculateATR(klines: Candle[], period: number = 14): number {
    if (klines.length < period + 1) {
      return 0;
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines[i - 1];

      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    if (trueRanges.length < period) {
      return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    }

    // Calcular ATR usando média móvel exponencial
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return atr;
  }

  /**
   * Calcula Parabolic SAR
   */
  private static calculateParabolicSAR(klines: Candle[], acceleration: number = 0.02, maximum: number = 0.2): number {
    if (klines.length < 2) {
      return klines[0]?.close || 0;
    }

    let sar = klines[0].low;
    let ep = klines[0].high;
    let af = acceleration;
    let trend = 1; // 1 = uptrend, -1 = downtrend

    for (let i = 1; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines[i - 1];

      if (trend === 1) {
        // Uptrend
        if (current.low < sar) {
          trend = -1;
          sar = ep;
          ep = current.low;
          af = acceleration;
        } else {
          if (current.high > ep) {
            ep = current.high;
            af = Math.min(af + acceleration, maximum);
          }
          sar = sar + af * (ep - sar);
          if (sar > previous.low) {
            sar = previous.low;
          }
          if (sar > current.low) {
            sar = current.low;
          }
        }
      } else {
        // Downtrend
        if (current.high > sar) {
          trend = 1;
          sar = ep;
          ep = current.high;
          af = acceleration;
        } else {
          if (current.low < ep) {
            ep = current.low;
            af = Math.min(af + acceleration, maximum);
          }
          sar = sar + af * (ep - sar);
          if (sar < previous.high) {
            sar = previous.high;
          }
          if (sar < current.high) {
            sar = current.high;
          }
        }
      }
    }

    return sar;
  }

  /**
   * Calcula OBV (On-Balance Volume)
   */
  private static calculateOBV(klines: Candle[]): number {
    if (klines.length < 2) {
      return 0;
    }

    let obv = 0;

    for (let i = 1; i < klines.length; i++) {
      const current = klines[i];
      const previous = klines[i - 1];

      if (current.close > previous.close) {
        obv += current.volume || 0;
      } else if (current.close < previous.close) {
        obv -= current.volume || 0;
      }
      // Se close é igual, OBV não muda
    }

    return obv;
  }

  /**
   * Calcula Volume (média de volume)
   */
  private static calculateVolume(klines: Candle[], period: number = 20): number {
    if (klines.length < period) {
      const volumes = klines.map(k => k.volume || 0).filter(v => v > 0);
      return volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
    }

    const slice = klines.slice(-period);
    const volumes = slice.map(k => k.volume || 0).filter(v => v > 0);
    return volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  }

  /**
   * Calcula Ichimoku Cloud
   */
  private static calculateIchimokuCloud(klines: Candle[]): { 
    tenkanSen: number; 
    kijunSen: number; 
    senkouSpanA: number; 
    senkouSpanB: number; 
    chikouSpan: number;
    cloudTop: number;
    cloudBottom: number;
  } {
    const tenkanPeriod = 9;
    const kijunPeriod = 26;
    const senkouBPeriod = 52;

    if (klines.length < senkouBPeriod) {
      const current = klines[klines.length - 1];
      return {
        tenkanSen: current.close,
        kijunSen: current.close,
        senkouSpanA: current.close,
        senkouSpanB: current.close,
        chikouSpan: current.close,
        cloudTop: current.close,
        cloudBottom: current.close
      };
    }

    // Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
    const tenkanSlice = klines.slice(-tenkanPeriod);
    const tenkanHigh = Math.max(...tenkanSlice.map(k => k.high));
    const tenkanLow = Math.min(...tenkanSlice.map(k => k.low));
    const tenkanSen = (tenkanHigh + tenkanLow) / 2;

    // Kijun-sen (Base Line): (26-period high + 26-period low) / 2
    const kijunSlice = klines.slice(-kijunPeriod);
    const kijunHigh = Math.max(...kijunSlice.map(k => k.high));
    const kijunLow = Math.min(...kijunSlice.map(k => k.low));
    const kijunSen = (kijunHigh + kijunLow) / 2;

    // Senkou Span A: (Tenkan-sen + Kijun-sen) / 2
    const senkouSpanA = (tenkanSen + kijunSen) / 2;

    // Senkou Span B: (52-period high + 52-period low) / 2
    const senkouBSlice = klines.slice(-senkouBPeriod);
    const senkouBHigh = Math.max(...senkouBSlice.map(k => k.high));
    const senkouBLow = Math.min(...senkouBSlice.map(k => k.low));
    const senkouSpanB = (senkouBHigh + senkouBLow) / 2;

    // Chikou Span: Close price 26 periods ago
    const chikouSpan = klines.length >= 26 ? klines[klines.length - 26].close : klines[0].close;

    // Cloud boundaries
    const cloudTop = Math.max(senkouSpanA, senkouSpanB);
    const cloudBottom = Math.min(senkouSpanA, senkouSpanB);

    return {
      tenkanSen,
      kijunSen,
      senkouSpanA,
      senkouSpanB,
      chikouSpan,
      cloudTop,
      cloudBottom
    };
  }

  /**
   * Atualiza as estatísticas do bot baseado nos trades
   */
  static async updateBotStatistics(botId: string): Promise<void> {
    try {
      console.log(`📊 Atualizando estatísticas do bot ${botId}...`);
      
      // Buscar todos os trades do bot
      const allTrades = await prisma.trade.findMany({
        where: { botId },
        orderBy: { entryTime: 'asc' }
      });

      console.log(`   📈 Total de trades encontrados: ${allTrades.length}`);

      // Separar trades fechados e abertos
      const closedTrades = allTrades.filter(t => t.status === 'closed' && t.pnl !== null);
      const openTrades = allTrades.filter(t => t.status === 'open');

      console.log(`   ✅ Trades fechados: ${closedTrades.length}`);
      console.log(`   🔓 Trades abertos: ${openTrades.length}`);

      // Calcular estatísticas básicas
      // totalTrades deve incluir todos os trades (fechados e abertos) para mostrar o total de operações
      const totalTrades = allTrades.length;
      
      // Se não há trades, não precisa atualizar
      if (totalTrades === 0) {
        console.log(`   ℹ️ Nenhum trade encontrado para o bot ${botId}, mantendo estatísticas padrão.`);
        return;
      }
      const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
      const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).length;
      
      // Calcular lucros e perdas com arredondamento para evitar erros de precisão
      const totalProfitRaw = closedTrades
        .filter(t => (t.pnl || 0) > 0)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);
      const totalProfit = Math.round(totalProfitRaw * 100) / 100;
      
      const totalLossRaw = Math.abs(closedTrades
        .filter(t => (t.pnl || 0) < 0)
        .reduce((sum, t) => sum + (t.pnl || 0), 0));
      const totalLoss = Math.round(totalLossRaw * 100) / 100;
      
      // Calcular P/L realizado (trades fechados)
      const realizedPnLRaw = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const realizedPnL = Math.abs(realizedPnLRaw) < 0.01 ? 0 : Math.round(realizedPnLRaw * 100) / 100;

      // Calcular P/L não realizado (trades abertos) usando preço atual
      let unrealizedPnL = 0;
      if (openTrades.length > 0) {
        // Buscar o bot para obter o símbolo
        const bot = await prisma.bot.findUnique({
          where: { id: botId },
          select: { symbol: true }
        });

        if (bot && bot.symbol) {
          try {
            // Buscar preço atual do mercado
            const currentPrice = await fetchCurrentPrice(bot.symbol);
            
            if (currentPrice !== null) {
              // Calcular P/L não realizado para cada trade aberto
              for (const trade of openTrades) {
                let tradeUnrealizedPnL: number;
                if (trade.side === 'buy') {
                  tradeUnrealizedPnL = (currentPrice - trade.price) * trade.quantity;
                } else {
                  tradeUnrealizedPnL = (trade.price - currentPrice) * trade.quantity;
                }
                unrealizedPnL += tradeUnrealizedPnL;
              }
              
              unrealizedPnL = Math.round(unrealizedPnL * 100) / 100;
              console.log(`   💰 P/L Não Realizado: ${unrealizedPnL.toFixed(2)} (${openTrades.length} posição(ões) aberta(s) @ ${currentPrice.toFixed(2)})`);
            } else {
              console.warn(`   ⚠️ Não foi possível obter preço atual para ${bot.symbol}, P/L não realizado será 0`);
            }
          } catch (error) {
            console.error(`   ❌ Erro ao calcular P/L não realizado:`, error);
          }
        }
      }

      // Calcular netProfit total (realizado + não realizado)
      const netProfitRaw = realizedPnL + unrealizedPnL;
      // Arredondar para 2 casas decimais e tratar valores muito pequenos como zero
      const netProfit = Math.abs(netProfitRaw) < 0.01 ? 0 : Math.round(netProfitRaw * 100) / 100;

      // Log detalhado dos trades fechados para debug
      if (closedTrades.length > 0) {
        console.log(`   📊 Detalhes dos trades fechados:`);
        closedTrades.forEach((trade, index) => {
          console.log(`      Trade ${index + 1}: ID=${trade.id}, P/L=${trade.pnl?.toFixed(2) || 'null'}, Status=${trade.status}`);
        });
        console.log(`   💰 Soma dos P/Ls: ${netProfit.toFixed(2)}`);
      } else {
        console.log(`   ⚠️ Nenhum trade fechado encontrado para calcular netProfit`);
      }

      // Calcular win rate (baseado apenas em trades fechados, não em todos os trades)
      const winRate = closedTrades.length > 0 ? winningTrades / closedTrades.length : 0;

      // Calcular profit factor
      // Calcular profit factor (totalProfit / totalLoss)
      // Se totalLoss é 0, usar um valor padrão alto (100) se há lucro, ou 0 se não há lucro
      const profitFactor = totalLoss > 0 
        ? Math.round((totalProfit / totalLoss) * 100) / 100 
        : (totalProfit > 0 ? 100 : 0);

      // Calcular médias com arredondamento
      const averageWin = winningTrades > 0 ? Math.round((totalProfit / winningTrades) * 100) / 100 : 0;
      const averageLoss = losingTrades > 0 ? Math.round((totalLoss / losingTrades) * 100) / 100 : 0;

      // Calcular maior ganho e maior perda com arredondamento
      const largestWinRaw = closedTrades.length > 0 
        ? Math.max(...closedTrades.map(t => t.pnl || 0).filter(pnl => pnl > 0), 0)
        : 0;
      const largestWin = Math.round(largestWinRaw * 100) / 100;
      
      const largestLossRaw = closedTrades.length > 0
        ? Math.min(...closedTrades.map(t => t.pnl || 0).filter(pnl => pnl < 0), 0)
        : 0;
      const largestLoss = Math.round(largestLossRaw * 100) / 100;

      // Calcular sequências
      let consecutiveWins = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;
      
      if (closedTrades.length > 0) {
        let lastPnL = closedTrades[closedTrades.length - 1].pnl || 0;
        currentStreak = lastPnL > 0 ? 1 : lastPnL < 0 ? -1 : 0;
        
        for (let i = closedTrades.length - 2; i >= 0; i--) {
          const pnl = closedTrades[i].pnl || 0;
          if (pnl > 0 && lastPnL > 0) {
            currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
          } else if (pnl < 0 && lastPnL < 0) {
            currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
          } else {
            break;
          }
          lastPnL = pnl;
        }
        
        // Contar sequências máximas
        let tempWins = 0;
        let tempLosses = 0;
        for (const trade of closedTrades) {
          const pnl = trade.pnl || 0;
          if (pnl > 0) {
            tempWins++;
            tempLosses = 0;
            consecutiveWins = Math.max(consecutiveWins, tempWins);
          } else if (pnl < 0) {
            tempLosses++;
            tempWins = 0;
            consecutiveLosses = Math.max(consecutiveLosses, tempLosses);
          }
        }
      }

      // Calcular Sharpe Ratio (simplificado)
      const returns = closedTrades.map(t => t.pnlPercent || 0);
      const avgReturn = returns.length > 0 
        ? returns.reduce((sum, r) => sum + r, 0) / returns.length 
        : 0;
      const variance = returns.length > 0
        ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Calcular max drawdown corretamente
      // Drawdown é a maior queda percentual do pico ao vale na curva de equity
      let maxDrawdown = 0;
      const INITIAL_BALANCE = 10000; // Saldo inicial padrão
      
      if (closedTrades.length > 0) {
        let peak = INITIAL_BALANCE; // Começar com o saldo inicial
        let currentValue = INITIAL_BALANCE; // Valor atual começa com saldo inicial
        let cumulativePnL = 0;
        
        for (const trade of closedTrades) {
          cumulativePnL += trade.pnl || 0;
          currentValue = INITIAL_BALANCE + cumulativePnL; // Saldo total = inicial + lucro acumulado
          
          // Atualizar pico se o valor atual for maior
          if (currentValue > peak) {
            peak = currentValue;
          }
          
          // Calcular drawdown apenas se houver um pico positivo significativo
          // Evitar divisão por valores muito pequenos que causam números absurdos
          if (peak > 0.01) {
            const drawdown = ((peak - currentValue) / peak) * 100;
            // Limitar drawdown a um máximo de 100% (não pode ser maior que isso)
            // E garantir que não seja negativo
            maxDrawdown = Math.max(maxDrawdown, Math.min(Math.max(drawdown, 0), 100));
          }
        }
        
        // Se o valor atual for menor que o saldo inicial, calcular drawdown em relação ao saldo inicial
        if (currentValue < INITIAL_BALANCE && peak <= INITIAL_BALANCE) {
          const drawdown = ((INITIAL_BALANCE - currentValue) / INITIAL_BALANCE) * 100;
          maxDrawdown = Math.max(maxDrawdown, Math.min(drawdown, 100));
        }
        
        // Arredondar drawdown para 2 casas decimais
        maxDrawdown = Math.round(maxDrawdown * 100) / 100;
        
        // Log para debug
        console.log(`   📉 Drawdown calculado: ${maxDrawdown.toFixed(2)}% (Peak: ${peak.toFixed(2)}, Current: ${currentValue.toFixed(2)}, Cumulative PnL: ${cumulativePnL.toFixed(2)})`);
      }

      // Atualizar bot no banco de dados
      const updatedBot = await prisma.bot.update({
        where: { id: botId },
        data: {
          totalTrades,
          winningTrades,
          losingTrades,
          winRate,
          totalProfit,
          totalLoss,
          netProfit,
          sharpeRatio,
          profitFactor,
          averageWin,
          averageLoss,
          largestWin,
          largestLoss,
          consecutiveWins,
          consecutiveLosses,
          currentStreak,
          maxDrawdown
        }
      });

      console.log(`✅ Estatísticas do robô "${updatedBot.name}" atualizadas:`);
      console.log(`   - Total de trades: ${totalTrades} (${closedTrades.length} fechados, ${openTrades.length} abertos)`);
      console.log(`   - Trades vencedores: ${winningTrades}`);
      console.log(`   - Trades perdedores: ${losingTrades}`);
      console.log(`   - Win Rate: ${(winRate * 100).toFixed(2)}%`);
      console.log(`   - Lucro Líquido: ${netProfit.toFixed(2)}`);
      console.log(`   - Profit Factor: ${profitFactor.toFixed(2)}`);
    } catch (error) {
      console.error(`❌ Erro ao atualizar estatísticas do bot ${botId}:`, error);
      if (error instanceof Error) {
        console.error(`   Mensagem: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
      }
    }
  }
}
