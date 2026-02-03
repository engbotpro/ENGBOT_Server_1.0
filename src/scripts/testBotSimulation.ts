/**
 * Script interativo para testar robôs de trading com dados históricos reais
 * 
 * Uso: npx ts-node src/scripts/testBotSimulation.ts
 */

import * as readline from 'readline';
import prisma from '../prismaClient';
import { fetchHistoricalKlines, Candle } from '../services/binanceService';
import { BotTradeService } from '../services/botTradeService';

interface SimulatedTrade {
  id: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  entryTime: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  status: 'open' | 'closed';
}

interface SimulationResult {
  bot: any;
  trades: SimulatedTrade[];
  openTrades: SimulatedTrade[];
  closedTrades: SimulatedTrade[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  winRate: number;
}

// Criar interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Função para fazer pergunta ao usuário
function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

// Função para listar robôs
async function listBots(): Promise<any[]> {
  const bots = await prisma.bot.findMany({
    orderBy: { name: 'asc' }
  });
  return bots;
}

// Função para selecionar robô
async function selectBot(): Promise<any | null> {
  console.log('\n📋 Carregando robôs...\n');
  const bots = await listBots();
  
  if (bots.length === 0) {
    console.log('❌ Nenhum robô encontrado!');
    return null;
  }
  
  console.log('Robôs disponíveis:\n');
  bots.forEach((bot, index) => {
    const status = bot.isActive ? '🟢 Ativo' : '🔴 Inativo';
    console.log(`${index + 1}. ${bot.name} (${bot.symbol}) - ${status}`);
    console.log(`   Indicador: ${bot.primaryIndicator} | Timeframe: ${bot.timeframe || '1h'}`);
  });
  
  const answer = await question('\n🔢 Digite o número do robô que deseja testar (ou 0 para cancelar): ');
  const index = parseInt(answer) - 1;
  
  if (isNaN(index) || index < 0 || index >= bots.length) {
    if (index === -1) {
      console.log('❌ Operação cancelada.');
      return null;
    }
    console.log('❌ Número inválido!');
    return null;
  }
  
  return bots[index];
}

// Função para obter período de teste
async function getTestPeriod(): Promise<{ days: number; limit: number }> {
  console.log('\n📅 Período de teste:');
  console.log('1. Últimas 24 horas (100 candles)');
  console.log('2. Últimos 3 dias (200 candles)');
  console.log('3. Últimos 7 dias (500 candles)');
  console.log('4. Últimos 30 dias (1000 candles)');
  console.log('5. Personalizado');
  
  const answer = await question('\n🔢 Escolha uma opção (1-5): ');
  
  switch (answer) {
    case '1':
      return { days: 1, limit: 100 };
    case '2':
      return { days: 3, limit: 200 };
    case '3':
      return { days: 7, limit: 500 };
    case '4':
      return { days: 30, limit: 1000 };
    case '5':
      const days = parseInt(await question('📅 Quantos dias? '));
      const limit = parseInt(await question('📊 Quantos candles? '));
      return { days: days || 7, limit: limit || 1000 };
    default:
      return { days: 30, limit: 1000 };
  }
}

// Função para calcular indicadores (simplificada do BotTradeService)
function calculateIndicators(klines: Candle[], bot: any): any {
  const prices = klines.map(k => k.close);
  const indicators: any = {};

  const primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
  
  if (primaryIndicatorName === 'rsi') {
    indicators.primary = calculateRSI(prices, 14);
  } else if (primaryIndicatorName === 'macd') {
    indicators.macd = calculateMACD(prices);
    indicators.primary = indicators.macd.macd;
  } else if (primaryIndicatorName === 'sma') {
    indicators.primary = calculateSMA(prices, 20);
  } else if (primaryIndicatorName === 'ema') {
    indicators.primary = calculateEMA(prices, 20);
  } else if (primaryIndicatorName.includes('bollinger')) {
    const bb = calculateBollingerBands(klines, 20, 2);
    indicators.bollinger = bb;
    indicators.primary = bb.middle[bb.middle.length - 1];
  } else if (primaryIndicatorName === 'hilo') {
    const hilo = calculateHILO(klines, 20, 2);
    indicators.hilo = hilo;
    indicators.primary = (hilo.upper[hilo.upper.length - 1] + hilo.lower[hilo.lower.length - 1]) / 2;
  } else {
    indicators.primary = null;
  }

  return indicators;
}

// Funções auxiliares de cálculo (simplificadas)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 26) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signal = macd * 0.9;
  
  return { macd, signal, histogram: macd - signal };
}

function calculateBollingerBands(klines: Candle[], period: number = 20, stdDev: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
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

function calculateHILO(klines: Candle[], period: number = 20, multiplier: number = 2): { upper: number[]; lower: number[] } {
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

// Função para verificar condição de entrada
function checkEntryCondition(
  candle: Candle,
  previousCandle: Candle,
  indicators: any,
  bot: any,
  openTrades: SimulatedTrade[],
  klines: Candle[]
): { shouldTrade: boolean; side: 'buy' | 'sell'; reason: string } {
  const condition = (bot.entryCondition || '').toLowerCase();
  const primaryIndicatorName = (bot.primaryIndicator || '').toLowerCase();
  const primaryValue = indicators.primary;
  
  // Verificar se já atingiu máximo de posições abertas
  if (openTrades.length >= (bot.maxOpenPositions || 5)) {
    return { shouldTrade: false, side: 'buy', reason: 'Máximo de posições abertas atingido' };
  }
  
  if (primaryIndicatorName === 'rsi') {
    if (condition.includes('oversold') || condition.includes('sobrevendido') || condition.includes('<')) {
      const threshold = bot.entryValue || 30;
      if (primaryValue < threshold) {
        return { 
          shouldTrade: true, 
          side: 'buy', 
          reason: `RSI (${primaryValue.toFixed(2)}) está abaixo de ${threshold} (oversold)` 
        };
      }
    } else if (condition.includes('overbought') || condition.includes('sobrecomprado') || condition.includes('>')) {
      const threshold = bot.entryValue || 70;
      if (primaryValue > threshold) {
        return { 
          shouldTrade: true, 
          side: 'sell', 
          reason: `RSI (${primaryValue.toFixed(2)}) está acima de ${threshold} (overbought)` 
        };
      }
    }
  } else if (primaryIndicatorName === 'sma' || primaryIndicatorName === 'ema' || primaryIndicatorName === 'wma' || primaryIndicatorName === 'hma') {
    // Verificar se o valor do indicador é válido
    if (primaryValue === null || primaryValue === undefined || isNaN(primaryValue)) {
      return { shouldTrade: false, side: 'buy', reason: 'Valor do indicador inválido' };
    }
    
    // Calcular valor anterior do indicador para crossover/crossunder
    const candleIndex = klines.findIndex((k: Candle) => k.time === candle.time);
    const previousPrices = candleIndex > 0 ? klines.slice(0, candleIndex).map((k: Candle) => k.close) : [];
    let previousIndicatorValue: number | null = null;
    
    if (previousPrices.length >= 20) {
      if (primaryIndicatorName === 'sma') {
        previousIndicatorValue = calculateSMA(previousPrices, 20);
      } else if (primaryIndicatorName === 'ema') {
        previousIndicatorValue = calculateEMA(previousPrices, 20);
      } else {
        previousIndicatorValue = calculateSMA(previousPrices, 20); // Fallback para WMA/HMA
      }
    }
    
    // CROSSOVER: preço cruza ACIMA da média (compra)
    if (condition.includes('crossover') || condition.includes('cruzou')) {
      if (condition.includes('acima') || condition.includes('above')) {
        if (previousIndicatorValue !== null) {
          if (previousCandle.close <= previousIndicatorValue && candle.close > primaryValue) {
            return { 
              shouldTrade: true, 
              side: 'buy', 
              reason: `Preço cruzou acima da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
            };
          }
        } else {
          if (previousCandle.close <= primaryValue && candle.close > primaryValue) {
            return { 
              shouldTrade: true, 
              side: 'buy', 
              reason: `Preço cruzou acima da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
            };
          }
        }
      } else {
        if (previousIndicatorValue !== null) {
          if (previousCandle.close >= previousIndicatorValue && candle.close < primaryValue) {
            return { 
              shouldTrade: true, 
              side: 'sell', 
              reason: `Preço cruzou abaixo da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
            };
          }
        } else {
          if (previousCandle.close >= primaryValue && candle.close < primaryValue) {
            return { 
              shouldTrade: true, 
              side: 'sell', 
              reason: `Preço cruzou abaixo da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
            };
          }
        }
      }
    }
    // CROSSUNDER: preço cruza ABAIXO da média (venda)
    else if (condition.includes('crossunder') || condition.includes('cruzou abaixo')) {
      if (previousIndicatorValue !== null) {
        if (previousCandle.close >= previousIndicatorValue && candle.close < primaryValue) {
          return { 
            shouldTrade: true, 
            side: 'sell', 
            reason: `Preço cruzou abaixo da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
          };
        }
      } else {
        if (previousCandle.close >= primaryValue && candle.close < primaryValue) {
          return { 
            shouldTrade: true, 
            side: 'sell', 
            reason: `Preço cruzou abaixo da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
          };
        }
      }
    }
    // ABOVE: preço está acima da média (compra)
    else if (condition.includes('acima') || condition.includes('above')) {
      if (candle.close > primaryValue) {
        return { 
          shouldTrade: true, 
          side: 'buy', 
          reason: `Preço (${candle.close.toFixed(2)}) está acima da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
        };
      }
    }
    // BELOW: preço está abaixo da média (venda)
    else if (condition.includes('abaixo') || condition.includes('below')) {
      if (candle.close < primaryValue) {
        return { 
          shouldTrade: true, 
          side: 'sell', 
          reason: `Preço (${candle.close.toFixed(2)}) está abaixo da ${primaryIndicatorName.toUpperCase()} (${primaryValue.toFixed(2)})` 
        };
      }
    }
    // BREAKOUT: preço rompe acima da média com força (compra)
    else if (condition.includes('breakout')) {
      const candleRange = candle.high - candle.low;
      const priceMove = candle.close - candle.open;
      if (candle.close > primaryValue && priceMove > (candleRange * 0.6)) {
        return { 
          shouldTrade: true, 
          side: 'buy', 
          reason: `Preço rompeu acima da ${primaryIndicatorName.toUpperCase()} com força (${primaryValue.toFixed(2)})` 
        };
      }
    }
    // BREAKDOWN: preço rompe abaixo da média com força (venda)
    else if (condition.includes('breakdown')) {
      const candleRange = candle.high - candle.low;
      const priceMove = candle.open - candle.close;
      if (candle.close < primaryValue && priceMove > (candleRange * 0.6)) {
        return { 
          shouldTrade: true, 
          side: 'sell', 
          reason: `Preço rompeu abaixo da ${primaryIndicatorName.toUpperCase()} com força (${primaryValue.toFixed(2)})` 
        };
      }
    }
  } else if (primaryIndicatorName.includes('bollinger')) {
    const bb = indicators.bollinger;
    if (bb) {
      const upper = bb.upper[bb.upper.length - 1];
      const lower = bb.lower[bb.lower.length - 1];
      
      if (candle.low <= lower || candle.close <= lower * 1.001) {
        return { 
          shouldTrade: true, 
          side: 'buy', 
          reason: `Preço tocou a banda inferior de Bollinger (${lower.toFixed(2)})` 
        };
      } else if (candle.high >= upper || candle.close >= upper * 0.999) {
        return { 
          shouldTrade: true, 
          side: 'sell', 
          reason: `Preço tocou a banda superior de Bollinger (${upper.toFixed(2)})` 
        };
      }
    }
  } else if (primaryIndicatorName === 'hilo') {
    const hilo = indicators.hilo;
    if (hilo) {
      const upper = hilo.upper[hilo.upper.length - 1];
      const lower = hilo.lower[hilo.lower.length - 1];
      
      if (candle.low <= lower || candle.close <= lower * 1.001) {
        return { 
          shouldTrade: true, 
          side: 'buy', 
          reason: `Preço tocou a banda inferior do HILO (${lower.toFixed(2)})` 
        };
      } else if (candle.high >= upper || candle.close >= upper * 0.999) {
        return { 
          shouldTrade: true, 
          side: 'sell', 
          reason: `Preço tocou a banda superior do HILO (${upper.toFixed(2)})` 
        };
      }
    }
  }
  
  return { shouldTrade: false, side: 'buy', reason: 'Nenhuma condição de entrada atendida' };
}

// Função para verificar condições de saída
function checkExitConditions(
  trade: SimulatedTrade,
  candle: Candle,
  indicators: any,
  bot: any
): { shouldExit: boolean; reason: string; exitPrice: number } {
  // Verificar Stop Loss
  if (trade.stopLoss) {
    if (trade.side === 'buy' && (candle.low <= trade.stopLoss || candle.close <= trade.stopLoss)) {
      return { 
        shouldExit: true, 
        reason: `Stop Loss atingido (${trade.stopLoss.toFixed(2)})`, 
        exitPrice: trade.stopLoss 
      };
    }
    if (trade.side === 'sell' && (candle.high >= trade.stopLoss || candle.close >= trade.stopLoss)) {
      return { 
        shouldExit: true, 
        reason: `Stop Loss atingido (${trade.stopLoss.toFixed(2)})`, 
        exitPrice: trade.stopLoss 
      };
    }
  }
  
  // Verificar Take Profit
  if (trade.takeProfit) {
    if (trade.side === 'buy' && (candle.high >= trade.takeProfit || candle.close >= trade.takeProfit)) {
      return { 
        shouldExit: true, 
        reason: `Take Profit atingido (${trade.takeProfit.toFixed(2)})`, 
        exitPrice: trade.takeProfit 
      };
    }
    if (trade.side === 'sell' && (candle.low <= trade.takeProfit || candle.close <= trade.takeProfit)) {
      return { 
        shouldExit: true, 
        reason: `Take Profit atingido (${trade.takeProfit.toFixed(2)})`, 
        exitPrice: trade.takeProfit 
      };
    }
  }
  
  return { shouldExit: false, reason: '', exitPrice: 0 };
}

// Função principal de simulação
async function simulateBot(bot: any, klines: Candle[]): Promise<SimulationResult> {
  console.log(`\n🚀 Iniciando simulação do robô "${bot.name}"...\n`);
  console.log(`📊 Configurações:`);
  console.log(`   - Símbolo: ${bot.symbol}`);
  console.log(`   - Timeframe: ${bot.timeframe || '1h'}`);
  console.log(`   - Indicador Principal: ${bot.primaryIndicator}`);
  console.log(`   - Condição de Entrada: ${bot.entryCondition}`);
  console.log(`   - Stop Loss: ${bot.stopLossEnabled ? `${bot.stopLossValue}%` : 'Desabilitado'}`);
  console.log(`   - Take Profit: ${bot.takeProfitEnabled ? `${bot.takeProfitValue}%` : 'Desabilitado'}`);
  console.log(`   - Máx. Posições Abertas: ${bot.maxOpenPositions || 5}\n`);
  
  const trades: SimulatedTrade[] = [];
  const openTrades: SimulatedTrade[] = [];
  let tradeCounter = 0;
  
  // Processar cada candle
  for (let i = 1; i < klines.length; i++) {
    const candle = klines[i];
    const previousCandle = klines[i - 1];
    const candleHistory = klines.slice(0, i + 1);
    
    // Calcular indicadores
    const indicators = calculateIndicators(candleHistory, bot);
    
    // Verificar condições de saída para trades abertos
    for (let j = openTrades.length - 1; j >= 0; j--) {
      const trade = openTrades[j];
      const exitCheck = checkExitConditions(trade, candle, indicators, bot);
      
      if (exitCheck.shouldExit) {
        // Calcular P/L
        let pnl: number;
        if (trade.side === 'buy') {
          pnl = (exitCheck.exitPrice - trade.entryPrice) * trade.quantity;
        } else {
          pnl = (trade.entryPrice - exitCheck.exitPrice) * trade.quantity;
        }
        
        const pnlPercent = ((exitCheck.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'buy' ? 1 : -1);
        
        const closedTrade: SimulatedTrade = {
          ...trade,
          exitPrice: exitCheck.exitPrice,
          exitTime: candle.time,
          pnl,
          pnlPercent,
          exitReason: exitCheck.reason,
          status: 'closed'
        };
        
        trades.push(closedTrade);
        openTrades.splice(j, 1);
        
        const pnlSign = pnl >= 0 ? '+' : '';
        console.log(`\n✅ Trade FECHADO #${tradeCounter}:`);
        console.log(`   ${trade.side.toUpperCase()} ${trade.quantity.toFixed(6)} @ ${trade.entryPrice.toFixed(2)}`);
        console.log(`   Saída: ${exitCheck.exitPrice.toFixed(2)}`);
        console.log(`   P/L: ${pnlSign}${pnl.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(2)}%)`);
        console.log(`   Razão: ${exitCheck.reason}`);
        console.log(`   Tempo: ${new Date(candle.time).toLocaleString('pt-BR')}`);
      }
    }
    
    // Verificar condições de entrada
    const entryCheck = checkEntryCondition(candle, previousCandle, indicators, bot, openTrades, candleHistory);
    
    // Log de debug para as primeiras iterações
    if (i < 5 || (i % 100 === 0)) {
      const primaryValue = indicators.primary;
      if (primaryValue !== null && primaryValue !== undefined) {
        console.log(`[Debug Candle ${i}] Preço: ${candle.close.toFixed(2)}, EMA: ${primaryValue.toFixed(2)}, Condição: ${bot.entryCondition}, Acima: ${candle.close > primaryValue}`);
      }
    }
    
    if (entryCheck.shouldTrade) {
      tradeCounter++;
      const entryPrice = candle.close;
      const positionSize = (bot.positionSizingValue || 100) / entryPrice;
      
      // Calcular Stop Loss e Take Profit
      let stopLoss: number | undefined;
      let takeProfit: number | undefined;
      
      if (bot.stopLossEnabled && bot.stopLossValue) {
        if (entryCheck.side === 'buy') {
          stopLoss = entryPrice * (1 - bot.stopLossValue / 100);
        } else {
          stopLoss = entryPrice * (1 + bot.stopLossValue / 100);
        }
      }
      
      if (bot.takeProfitEnabled && bot.takeProfitValue) {
        if (entryCheck.side === 'buy') {
          takeProfit = entryPrice * (1 + bot.takeProfitValue / 100);
        } else {
          takeProfit = entryPrice * (1 - bot.takeProfitValue / 100);
        }
      }
      
      const newTrade: SimulatedTrade = {
        id: `trade-${tradeCounter}`,
        side: entryCheck.side,
        entryPrice,
        entryTime: candle.time,
        quantity: positionSize,
        stopLoss,
        takeProfit,
        status: 'open'
      };
      
      trades.push(newTrade);
      openTrades.push(newTrade);
      
      console.log(`\n🟢 Trade ABERTO #${tradeCounter}:`);
      console.log(`   ${entryCheck.side.toUpperCase()} ${positionSize.toFixed(6)} @ ${entryPrice.toFixed(2)}`);
      console.log(`   Razão: ${entryCheck.reason}`);
      if (stopLoss) console.log(`   Stop Loss: ${stopLoss.toFixed(2)}`);
      if (takeProfit) console.log(`   Take Profit: ${takeProfit.toFixed(2)}`);
      console.log(`   Tempo: ${new Date(candle.time).toLocaleString('pt-BR')}`);
    }
  }
  
  // Fechar trades abertos no final
  const finalPrice = klines[klines.length - 1].close;
  for (const trade of openTrades) {
    let pnl: number;
    if (trade.side === 'buy') {
      pnl = (finalPrice - trade.entryPrice) * trade.quantity;
    } else {
      pnl = (trade.entryPrice - finalPrice) * trade.quantity;
    }
    
    const pnlPercent = ((finalPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'buy' ? 1 : -1);
    
    trade.exitPrice = finalPrice;
    trade.exitTime = klines[klines.length - 1].time;
    trade.pnl = pnl;
    trade.pnlPercent = pnlPercent;
    trade.exitReason = 'Simulação finalizada';
    trade.status = 'closed';
  }
  
  const closedTrades = trades.filter(t => t.status === 'closed');
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = closedTrades.filter(t => (t.pnl || 0) <= 0);
  const totalProfit = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLoss = Math.abs(closedTrades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + (t.pnl || 0), 0));
  const netProfit = totalProfit;
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
  
  return {
    bot,
    trades,
    openTrades: [],
    closedTrades,
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    totalProfit,
    totalLoss,
    netProfit,
    winRate
  };
}

// Função principal
async function main() {
  try {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║     🤖 SIMULADOR DE ROBÔS DE TRADING - TESTE RÁPIDO     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    // Selecionar robô
    const bot = await selectBot();
    if (!bot) {
      rl.close();
      return;
    }
    
    // Obter período de teste
    const period = await getTestPeriod();
    
    console.log(`\n📥 Buscando dados históricos da Binance...`);
    console.log(`   Símbolo: ${bot.symbol}`);
    console.log(`   Timeframe: ${bot.timeframe || '1h'}`);
    console.log(`   Limite: ${period.limit} candles\n`);
    
    // Buscar dados históricos
    const klines = await fetchHistoricalKlines(
      bot.symbol,
      bot.timeframe || '1h',
      period.limit
    );
    
    if (klines.length === 0) {
      console.log('❌ Erro ao buscar dados históricos!');
      rl.close();
      return;
    }
    
    console.log(`✅ ${klines.length} candles carregados`);
    console.log(`   Período: ${new Date(klines[0].time).toLocaleString('pt-BR')} até ${new Date(klines[klines.length - 1].time).toLocaleString('pt-BR')}\n`);
    
    // Executar simulação
    const result = await simulateBot(bot, klines);
    
    // Mostrar resultados
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESULTADOS FINAIS                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📈 Estatísticas:`);
    console.log(`   Total de Trades: ${result.totalTrades}`);
    console.log(`   Trades Vencedores: ${result.winningTrades}`);
    console.log(`   Trades Perdedores: ${result.losingTrades}`);
    console.log(`   Win Rate: ${(result.winRate * 100).toFixed(2)}%`);
    console.log(`   Lucro Total: ${result.totalProfit.toFixed(2)} USDT`);
    console.log(`   Prejuízo Total: ${result.totalLoss.toFixed(2)} USDT`);
    console.log(`   Lucro Líquido: ${result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)} USDT`);
    
    if (result.closedTrades.length > 0) {
      const avgWin = result.winningTrades > 0 
        ? result.closedTrades.filter(t => (t.pnl || 0) > 0).reduce((sum, t) => sum + (t.pnl || 0), 0) / result.winningTrades 
        : 0;
      const avgLoss = result.losingTrades > 0
        ? Math.abs(result.closedTrades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + (t.pnl || 0), 0) / result.losingTrades)
        : 0;
      
      console.log(`   Ganho Médio: ${avgWin.toFixed(2)} USDT`);
      console.log(`   Perda Média: ${avgLoss.toFixed(2)} USDT`);
      console.log(`   Profit Factor: ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'}`);
    }
    
    console.log('\n✅ Simulação concluída!\n');
    
  } catch (error) {
    console.error('❌ Erro durante a simulação:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Executar
main();

