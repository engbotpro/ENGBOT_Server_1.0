/**
 * Serviço que monitora trades simulados abertos com SL/TP e os fecha
 * automaticamente quando o preço atinge o stop loss ou take profit.
 * Funciona para compra (long) e venda (short).
 */
import prisma from '../prismaClient';
import { fetchHistoricalKlines, fetchCurrentPrice } from './binanceService';

const CHECK_INTERVAL_MS = 5000; // 5 segundos - resposta mais rápida ao SL/TP
let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Verifica e fecha trades que atingiram SL ou TP
 */
export async function checkAndCloseSlTpTrades(): Promise<void> {
  try {
    const openTrades = await prisma.trade.findMany({
      where: {
        status: 'open',
        environment: 'simulated',
        OR: [
          { stopLoss: { not: null } },
          { takeProfit: { not: null } },
        ],
      },
    });

    if (openTrades.length === 0) return;

    const manualCount = openTrades.filter((t) => (t.tradeType || '').toLowerCase() === 'manual').length;
    console.log(`[SL/TP Monitor] Verificando ${openTrades.length} trades abertos com SL/TP (${manualCount} manuais, ${openTrades.length - manualCount} bot)`);

    const symbols = [...new Set(openTrades.map((t) => t.symbol))];

    for (const symbol of symbols) {
      let currentPrice: number;
      let candle: { high: number; low: number };
      try {
        // Preço atual (ticker) - mais preciso para SL/TP em tempo real
        const tickerPrice = await fetchCurrentPrice(symbol);
        if (tickerPrice === null) continue;
        currentPrice = tickerPrice;

        // Candle 1m para capturar toques que possam ter ocorrido entre verificações
        const klines = await fetchHistoricalKlines(symbol, '1m', 2);
        if (klines && klines.length >= 1) {
          const last = klines[klines.length - 1];
          candle = { high: last.high, low: last.low };
        } else {
          candle = { high: currentPrice, low: currentPrice };
        }
      } catch (e) {
        console.warn(`[SL/TP Monitor] Erro ao buscar preço para ${symbol}:`, e);
        continue;
      }

      const symbolTrades = openTrades.filter((t) => t.symbol === symbol);

      for (const trade of symbolTrades) {
        const sl = trade.stopLoss ?? 0;
        const tp = trade.takeProfit ?? 0;
        const side = (trade.side || 'buy').toLowerCase();
        const isManual = (trade.tradeType || '').toLowerCase() === 'manual';

        let shouldClose = false;
        let exitPrice = 0;
        let reason = '';

        // Log detalhado para trades manuais (e resumido para outros)
        const logPrefix = isManual ? '[SL/TP Monitor] [MANUAL]' : '[SL/TP Monitor]';
        if (isManual) {
          console.log(`${logPrefix} Verificando trade ${trade.id}:`);
          console.log(`   - Trade: ${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ ${trade.price}`);
          console.log(`   - Preço atual: High=${candle.high.toFixed(2)}, Low=${candle.low.toFixed(2)}, Ticker=${currentPrice.toFixed(2)}`);
          console.log(`   - Stop Loss: ${sl > 0 ? sl.toFixed(2) : 'não configurado'}`);
          console.log(`   - Take Profit: ${tp > 0 ? tp.toFixed(2) : 'não configurado'}`);
        }

        if (side === 'buy') {
          // Long: SL abaixo do preço de entrada - fecha quando preço cai até ou abaixo do SL
          // TP acima do preço de entrada - fecha quando preço sobe até ou acima do TP
          if (sl > 0 && (currentPrice <= sl || candle.low <= sl)) {
            shouldClose = true;
            exitPrice = sl;
            reason = 'stop_loss';
            if (isManual) console.log(`   * ✅ STOP LOSS ATINGIDO! (Low ${candle.low.toFixed(2)} <= SL ${sl.toFixed(2)} ou Ticker ${currentPrice.toFixed(2)} <= SL)`);
          } else if (sl > 0 && isManual) {
            console.log(`   * Comparando SL: Low (${candle.low.toFixed(2)}) <= SL (${sl.toFixed(2)}) | Ticker (${currentPrice.toFixed(2)}) <= SL → não atingido`);
          }
          if (tp > 0 && (currentPrice >= tp || candle.high >= tp)) {
            shouldClose = true;
            exitPrice = tp;
            reason = 'take_profit';
            if (isManual) console.log(`   * ✅ TAKE PROFIT ATINGIDO! (High ${candle.high.toFixed(2)} >= TP ${tp.toFixed(2)} ou Ticker ${currentPrice.toFixed(2)} >= TP)`);
          } else if (tp > 0 && isManual) {
            console.log(`   * Comparando TP: High (${candle.high.toFixed(2)}) >= TP (${tp.toFixed(2)}) | Ticker (${currentPrice.toFixed(2)}) >= TP → não atingido`);
          }
        } else {
          // Short: SL acima do preço de entrada - fecha quando preço sobe até ou acima do SL
          // TP abaixo do preço de entrada - fecha quando preço cai até ou abaixo do TP
          if (sl > 0 && (currentPrice >= sl || candle.high >= sl)) {
            shouldClose = true;
            exitPrice = sl;
            reason = 'stop_loss';
            if (isManual) console.log(`   * ✅ STOP LOSS ATINGIDO! (High ${candle.high.toFixed(2)} >= SL ${sl.toFixed(2)} ou Ticker ${currentPrice.toFixed(2)} >= SL)`);
          } else if (sl > 0 && isManual) {
            console.log(`   * Comparando SL: High (${candle.high.toFixed(2)}) >= SL (${sl.toFixed(2)}) | Ticker (${currentPrice.toFixed(2)}) >= SL → não atingido`);
          }
          if (tp > 0 && (currentPrice <= tp || candle.low <= tp)) {
            shouldClose = true;
            exitPrice = tp;
            reason = 'take_profit';
            if (isManual) console.log(`   * ✅ TAKE PROFIT ATINGIDO! (Low ${candle.low.toFixed(2)} <= TP ${tp.toFixed(2)} ou Ticker ${currentPrice.toFixed(2)} <= TP)`);
          } else if (tp > 0 && isManual) {
            console.log(`   * Comparando TP: Low (${candle.low.toFixed(2)}) <= TP (${tp.toFixed(2)}) | Ticker (${currentPrice.toFixed(2)}) <= TP → não atingido`);
          }
        }

        if (isManual && !shouldClose) {
          console.log(`   - ⏳ Trade permanece aberto (nenhuma condição atendida)`);
        }

        if (shouldClose && exitPrice > 0) {
          await closeSimulatedTrade(trade, exitPrice, reason);
        }
      }
    }
  } catch (error) {
    console.error('[SL/TP Monitor] Erro ao verificar trades:', error);
  }
}

/**
 * Fecha um trade simulado: atualiza wallet e marca o trade como closed
 */
async function closeSimulatedTrade(
  trade: {
    id: string;
    userId: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    total: number;
  },
  exitPrice: number,
  reason: 'stop_loss' | 'take_profit'
): Promise<void> {
  const side = trade.side.toLowerCase();
  const baseSymbol = trade.symbol.replace(/USDT$/i, '');
  const quoteSymbol = 'USDT';
  const quantity = trade.quantity;
  const totalUsdt = quantity * exitPrice;

  const pnl =
    side === 'buy'
      ? (exitPrice - trade.price) * quantity
      : (trade.price - exitPrice) * quantity;
  const pnlPercent = ((pnl / trade.total) * 100);

  try {
    await prisma.$transaction(async (tx) => {
      if (side === 'buy') {
        // Fechar long: vender (remover base, adicionar USDT)
        const baseWallet = await tx.wallet.findUnique({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: baseSymbol,
            },
          },
        });

        if (!baseWallet || baseWallet.balance < quantity) {
          console.warn(
            `[SL/TP Monitor] Saldo insuficiente de ${baseSymbol} para fechar trade ${trade.id}`
          );
          return;
        }

        await tx.wallet.update({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: baseSymbol,
            },
          },
          data: {
            balance: baseWallet.balance - quantity,
            value: baseWallet.value - totalUsdt,
          },
        });

        const usdtWallet = await tx.wallet.findUnique({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: quoteSymbol,
            },
          },
        });

        if (usdtWallet) {
          await tx.wallet.update({
            where: {
              userId_type_symbol: {
                userId: trade.userId,
                type: 'virtual',
                symbol: quoteSymbol,
              },
            },
            data: {
              balance: usdtWallet.balance + totalUsdt,
              value: usdtWallet.value + totalUsdt,
            },
          });
        } else {
          await tx.wallet.create({
            data: {
              userId: trade.userId,
              type: 'virtual',
              symbol: quoteSymbol,
              name: 'Tether USD',
              balance: totalUsdt,
              value: totalUsdt,
              isActive: true,
            },
          });
        }
      } else {
        // Fechar short: comprar (remover USDT, adicionar base)
        const usdtWallet = await tx.wallet.findUnique({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: quoteSymbol,
            },
          },
        });

        if (!usdtWallet || usdtWallet.balance < totalUsdt) {
          console.warn(
            `[SL/TP Monitor] Saldo USDT insuficiente para fechar trade ${trade.id}`
          );
          return;
        }

        await tx.wallet.update({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: quoteSymbol,
            },
          },
          data: {
            balance: usdtWallet.balance - totalUsdt,
            value: usdtWallet.value - totalUsdt,
          },
        });

        const baseWallet = await tx.wallet.findUnique({
          where: {
            userId_type_symbol: {
              userId: trade.userId,
              type: 'virtual',
              symbol: baseSymbol,
            },
          },
        });

        if (baseWallet) {
          await tx.wallet.update({
            where: {
              userId_type_symbol: {
                userId: trade.userId,
                type: 'virtual',
                symbol: baseSymbol,
              },
            },
            data: {
              balance: baseWallet.balance + quantity,
              value: baseWallet.value + totalUsdt,
            },
          });
        } else {
          await tx.wallet.create({
            data: {
              userId: trade.userId,
              type: 'virtual',
              symbol: baseSymbol,
              name: baseSymbol,
              balance: quantity,
              value: totalUsdt,
              isActive: true,
            },
          });
        }
      }

      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: 'closed',
          exitTime: new Date(),
          exitPrice,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          notes: `Fechado automaticamente por ${reason === 'stop_loss' ? 'Stop Loss' : 'Take Profit'}`,
        },
      });
    });

    console.log(
      `[SL/TP Monitor] Trade ${trade.id} fechado por ${reason}: ${trade.side} ${trade.symbol} @ ${exitPrice.toFixed(2)}, P/L: ${pnl.toFixed(2)}`
    );
  } catch (error) {
    console.error(`[SL/TP Monitor] Erro ao fechar trade ${trade.id}:`, error);
  }
}

/**
 * Inicia o monitor de SL/TP
 */
export function startSlTpMonitor(): void {
  if (monitorInterval) return;
  console.log('[SL/TP Monitor] Iniciando monitor de Stop Loss e Take Profit');
  checkAndCloseSlTpTrades();
  monitorInterval = setInterval(checkAndCloseSlTpTrades, CHECK_INTERVAL_MS);
}

/**
 * Para o monitor
 */
export function stopSlTpMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[SL/TP Monitor] Monitor parado');
  }
}
