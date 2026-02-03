/**
 * Serviço para buscar dados históricos da Binance
 */

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Mapeia timeframe do bot para intervalo da Binance
 */
export function mapTimeframeToBinanceInterval(timeframe: string): string {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return mapping[timeframe] || '1h';
}

/**
 * Busca dados históricos de klines da Binance
 */
export async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  limit: number = 100
): Promise<Candle[]> {
  try {
    const binanceInterval = mapTimeframeToBinanceInterval(interval);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro na API da Binance: ${response.status}`);
    }
    
    const data: any[][] = await response.json();
    
    return data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]) || 0,
    }));
  } catch (error) {
    console.error('Erro ao buscar klines da Binance:', error);
    return [];
  }
}

/**
 * Busca o preço atual de um símbolo da Binance
 */
export async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro na API da Binance: ${response.status}`);
    }
    
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('Erro ao buscar preço atual da Binance:', error);
    return null;
  }
}


