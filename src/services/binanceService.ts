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

const BINANCE_PUBLIC_API_BASES = Array.from(
  new Set(
    [
      process.env.BINANCE_PUBLIC_API_BASE_URL?.trim(),
      'https://api.binance.com',
      'https://data-api.binance.vision',
    ].filter((value): value is string => Boolean(value && value.trim())),
  ),
);

/**
 * Mapeia timeframe do bot para intervalo da Binance
 */
export function mapTimeframeToBinanceInterval(timeframe: string): string {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '6h': '6h',
    '12h': '12h',
    '1d': '1d',
    '1w': '1w',
  };
  return mapping[timeframe] || '1h';
}

async function fetchBinancePublicData<T>(path: string): Promise<T> {
  const failures: string[] = [];

  for (const baseUrl of BINANCE_PUBLIC_API_BASES) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${normalizedBaseUrl}${path}`;

    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json() as T;
      }

      const failure = `${normalizedBaseUrl} -> HTTP ${response.status}`;
      failures.push(failure);

      if (response.status === 451) {
        console.warn(`Binance bloqueou ${normalizedBaseUrl} com HTTP 451; tentando próximo endpoint público...`);
      }
    } catch (error) {
      failures.push(`${normalizedBaseUrl} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Falha ao acessar market data pública da Binance. Tentativas: ${failures.join(' | ')}`);
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
    const data = await fetchBinancePublicData<any[][]>(
      `/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`,
    );
    
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
    const data = await fetchBinancePublicData<{ price: string }>(
      `/api/v3/ticker/price?symbol=${symbol}`,
    );
    return parseFloat(data.price);
  } catch (error) {
    console.error('Erro ao buscar preço atual da Binance:', error);
    return null;
  }
}


