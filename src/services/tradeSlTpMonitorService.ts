/**
 * Serviço que monitora trades simulados abertos com SL/TP e os fecha
 * automaticamente quando o preço atinge o stop loss ou take profit.
 * Funciona para compra (long) e venda (short).
 */
import prisma from '../prismaClient';
import { fetchHistoricalKlines, fetchCurrentPrice } from './binanceService';

const CHECK_INTERVAL_MS = 15000; // 15 segundos
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

    const symbols = [...new Set(openTrades.map((t) => t.symbol))];

    for (const symbol of symbols) {
      let candle: { high: number; low: number; close: number };
      try {
        const klines = await fetchHistoricalKlines(symbol, '1m', 2);
        if (klines && klines.length >= 1) {
          const last = klines[klines.length - 1];
          candle = { high: last.high, low: last.low, close: last.close };
        } else {
          const price = await fetchCurrentPrice(symbol);
          if (price === null) continue;
          candle = { high: price, low: price, close: price };
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

        let shouldClose = false;
        let exitPrice = 0;
        let reason = '';

        if (side === 'buy') {
          // Long: SL abaixo do preço de entrada, TP acima
          if (sl > 0 && candle.low <= sl) {
            shouldClose = true;
            exitPrice = sl;
            reason = 'stop_loss';
          } else if (tp > 0 && candle.high >= tp) {
            shouldClose = true;
            exitPrice = tp;
            reason = 'take_profit';
          }
        } else {
          // Short: SL acima do preço de entrada, TP abaixo
          if (sl > 0 && candle.high >= sl) {
            shouldClose = true;
            exitPrice = sl;
            reason = 'stop_loss';
          } else if (tp > 0 && candle.low <= tp) {
            shouldClose = true;
            exitPrice = tp;
            reason = 'take_profit';
          }
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
