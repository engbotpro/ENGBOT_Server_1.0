/**
 * Controller para gerenciar chaves da API Binance do usuário.
 * As chaves são armazenadas criptografadas no banco.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../services/encryptionService';
import { fetchBinanceAccountWithValues } from '../services/binanceAccountService';

const prisma = new PrismaClient();

/**
 * Salva ou atualiza as chaves da API Binance (criptografadas)
 * Body: { apiKey, apiSecret }
 */
export const saveBinanceKeys = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret || typeof apiKey !== 'string' || typeof apiSecret !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'API Key e API Secret são obrigatórios',
      });
    }

    const apiKeyEncrypted = encrypt(apiKey.trim());
    const apiSecretEncrypted = encrypt(apiSecret.trim());

    await prisma.binanceApiKey.upsert({
      where: { userId },
      update: { apiKeyEncrypted, apiSecretEncrypted },
      create: {
        userId,
        apiKeyEncrypted,
        apiSecretEncrypted,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Chaves Binance salvas com sucesso (criptografadas)',
    });
  } catch (error) {
    console.error('Erro ao salvar chaves Binance:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao salvar chaves',
    });
  }
};

/**
 * Retorna se o usuário tem chaves configuradas (nunca retorna as chaves)
 */
export const getBinanceKeysStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const record = await prisma.binanceApiKey.findUnique({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      data: { hasKeys: !!record },
    });
  } catch (error) {
    console.error('Erro ao verificar status das chaves Binance:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao verificar status',
    });
  }
};

/**
 * Remove as chaves da API Binance do usuário
 */
export const deleteBinanceKeys = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    await prisma.binanceApiKey.deleteMany({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      message: 'Chaves Binance removidas com sucesso',
    });
  } catch (error) {
    console.error('Erro ao remover chaves Binance:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao remover chaves',
    });
  }
};

/**
 * Busca saldo e informações da carteira Binance real usando as chaves armazenadas
 */
export const getBinanceAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const record = await prisma.binanceApiKey.findUnique({
      where: { userId },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Chaves da Binance não configuradas. Configure em Minha Conta.',
      });
    }

    const apiKey = decrypt(record.apiKeyEncrypted);
    const apiSecret = decrypt(record.apiSecretEncrypted);

    const result = await fetchBinanceAccountWithValues(apiKey, apiSecret);

    if (!result) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao conectar com a Binance. Verifique se as chaves estão corretas e têm permissão de leitura.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        assets: result.assets,
        totalValue: result.totalValue,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar conta Binance:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao buscar conta Binance',
    });
  }
};
