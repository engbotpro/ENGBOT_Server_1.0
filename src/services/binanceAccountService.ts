/**
 * Serviço para buscar informações da conta Binance usando API Key e Secret do usuário.
 * Usa endpoint /api/v3/account (USER_DATA) com assinatura HMAC SHA256.
 */

import crypto from 'crypto';

const BINANCE_BASE_URL = 'https://api.binance.com';

export class BinanceRequestError extends Error {
  statusCode: number;
  binanceCode?: number | string;

  constructor(message: string, statusCode: number, binanceCode?: number | string) {
    super(message);
    this.name = 'BinanceRequestError';
    this.statusCode = statusCode;
    this.binanceCode = binanceCode;
  }
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  balances: BinanceBalance[];
}

/**
 * Assina a query string com HMAC SHA256
 */
function signQuery(queryString: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

/**
 * Busca informações da conta Binance (saldo e permissões)
 * Lança erro com mensagem detalhada em caso de falha.
 */
export async function fetchBinanceAccount(
  apiKey: string,
  apiSecret: string
): Promise<BinanceAccountInfo> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = signQuery(queryString, apiSecret);

    const url = `${BINANCE_BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Binance] Erro ao buscar conta:', response.status, errText);

      let parsedError: { code?: number | string; msg?: string } | null = null;
      try {
        parsedError = JSON.parse(errText) as { code?: number | string; msg?: string };
      } catch {
        parsedError = null;
      }

      const binanceMessage = parsedError?.msg?.trim();
      const binanceCode = parsedError?.code;

      if (response.status === 451) {
        throw new BinanceRequestError(
          'A Binance bloqueou o acesso a partir da localização/IP atual do servidor (HTTP 451). Para carregar saldo e ativos, será necessário usar um servidor/região permitidos pela Binance.',
          451,
          binanceCode,
        );
      }

      throw new BinanceRequestError(
        binanceMessage || `Erro ao consultar conta Binance (HTTP ${response.status}).`,
        response.status,
        binanceCode,
      );
    }

    const data = await response.json();
    return data as BinanceAccountInfo;
  } catch (error) {
    console.error('[Binance] Erro ao buscar conta:', error);
    if (error instanceof BinanceRequestError) {
      throw error;
    }
    throw new BinanceRequestError(
      'Não foi possível consultar a conta Binance no momento.',
      500,
    );
  }
}

/** Preço em USDT para conversão */
async function getPriceUsdt(symbol: string): Promise<number> {
  if (symbol === 'USDT' || symbol === 'BUSD') return 1;
  try {
    const url = `${BINANCE_BASE_URL}/api/v3/ticker/price?symbol=${symbol}USDT`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = await res.json();
    return parseFloat(data.price || 0);
  } catch {
    return 0;
  }
}

export interface WalletAssetFromBinance {
  symbol: string;
  name: string;
  balance: number;
  value: number;
}

/**
 * Busca conta Binance e retorna ativos com valor em USD.
 */
export async function fetchBinanceAccountWithValues(
  apiKey: string,
  apiSecret: string
): Promise<{ assets: WalletAssetFromBinance[]; totalValue: number }> {
  const account = await fetchBinanceAccount(apiKey, apiSecret);

  const assets: WalletAssetFromBinance[] = [];
  for (const b of account.balances) {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const total = free + locked;
    if (total <= 0) continue;

    const priceUsdt = await getPriceUsdt(b.asset);
    const value = total * priceUsdt;

    assets.push({
      symbol: b.asset,
      name: b.asset,
      balance: total,
      value,
    });
  }

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);
  return { assets, totalValue };
}
