import prisma from '../prismaClient';

const BLOCKSTREAM_API_BASE = 'https://blockstream.info/api';

interface BlockstreamTransaction {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  vout: Array<{
    value: number;
    scriptpubkey_address?: string;
  }>;
}

interface BlockstreamAddressTransaction {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  vin: Array<{
    prevout?: {
      value: number;
    };
  }>;
  vout: Array<{
    value: number;
    scriptpubkey_address?: string;
  }>;
}

/**
 * Converte BTC para satoshis (1 BTC = 100,000,000 satoshis)
 */
function btcToSatoshis(btc: number): number {
  return Math.floor(btc * 100000000);
}

/**
 * Converte satoshis para BTC
 */
function satoshisToBtc(satoshis: number): number {
  return satoshis / 100000000;
}

/**
 * Busca todas as transações recebidas por um endereço Bitcoin
 */
async function getAddressTransactions(address: string): Promise<BlockstreamAddressTransaction[]> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}/txs`);
    if (!response.ok) {
      throw new Error(`Blockstream API error: ${response.status}`);
    }
    const transactions = await response.json();
    return transactions;
  } catch (error) {
    console.error(`[getAddressTransactions] Erro ao buscar transações do endereço ${address}:`, error);
    throw error;
  }
}

/**
 * Busca detalhes de uma transação específica
 */
async function getTransactionDetails(txHash: string): Promise<BlockstreamTransaction | null> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API_BASE}/tx/${txHash}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Transação não encontrada
      }
      throw new Error(`Blockstream API error: ${response.status}`);
    }
    const transaction = await response.json();
    return transaction;
  } catch (error) {
    console.error(`[getTransactionDetails] Erro ao buscar detalhes da transação ${txHash}:`, error);
    return null;
  }
}

/**
 * Verifica se uma transação foi enviada para o endereço com o valor esperado
 */
function isTransactionToAddress(
  transaction: BlockstreamAddressTransaction | BlockstreamTransaction,
  targetAddress: string,
  expectedAmountBtc: number,
  tolerancePercent: number = 5 // 5% de tolerância para taxas
): boolean {
  // Buscar saídas (vout) que foram para o endereço alvo
  const outputsToAddress = transaction.vout.filter(
    (output: any) => output.scriptpubkey_address === targetAddress
  );

  if (outputsToAddress.length === 0) {
    return false;
  }

  // Somar todos os valores enviados para o endereço
  // O valor vem em satoshis já no objeto vout
  const totalReceived = outputsToAddress.reduce((sum: number, output: any) => sum + (output.value || 0), 0);
  
  // Verificar se o valor recebido está dentro da tolerância
  const expectedSatoshis = btcToSatoshis(expectedAmountBtc);
  const tolerance = (expectedSatoshis * tolerancePercent) / 100;
  const minExpected = expectedSatoshis - tolerance;
  const maxExpected = expectedSatoshis + tolerance;

  return totalReceived >= minExpected && totalReceived <= maxExpected;
}

/**
 * Verifica transações Bitcoin pendentes e aprova automaticamente se confirmadas
 */
export async function verifyPendingBitcoinTransactions(): Promise<void> {
  try {
    console.log('[bitcoinVerificationService] Iniciando verificação de transações Bitcoin pendentes...');

    // Buscar todas as transações pendentes
    const pendingTransactions = await prisma.bitcoinTransaction.findMany({
      where: {
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (pendingTransactions.length === 0) {
      console.log('[bitcoinVerificationService] Nenhuma transação pendente para verificar.');
      return;
    }

    console.log(`[bitcoinVerificationService] Verificando ${pendingTransactions.length} transação(ões) pendente(s)...`);

    // Buscar endereço da carteira Bitcoin configurada
    const settings = await prisma.platformSettings.findUnique({
      where: { id: 'platform' }
    });

    if (!settings || !settings.bitcoinWalletAddress) {
      console.log('[bitcoinVerificationService] Endereço Bitcoin não configurado. Pulando verificação.');
      return;
    }

    const walletAddress = settings.bitcoinWalletAddress;

    // Buscar transações do endereço
    const addressTransactions = await getAddressTransactions(walletAddress);

    for (const pendingTx of pendingTransactions) {
      try {
        let transactionFound = false;
        let confirmationCount = 0;

        // Se o usuário forneceu um TX Hash, verificar essa transação específica
        if (pendingTx.txHash) {
          const txDetails = await getTransactionDetails(pendingTx.txHash);
          
          if (txDetails) {
            // Buscar detalhes completos da transação (incluindo endereços das saídas)
            const txFull = await fetch(`${BLOCKSTREAM_API_BASE}/tx/${pendingTx.txHash}`).then(r => r.json()).catch(() => null);
            
            if (txFull) {
              // Verificar se a transação tem saídas para nosso endereço com o valor esperado
              const isCorrectTransaction = isTransactionToAddress(
                txFull,
                walletAddress,
                pendingTx.amountBTC
              );

              if (isCorrectTransaction && txFull.status?.confirmed) {
                // Buscar altura do bloco atual para calcular confirmações
                const currentBlockResponse = await fetch(`${BLOCKSTREAM_API_BASE}/blocks/tip/height`);
                const currentBlockHeight = await currentBlockResponse.json();
                
                if (txFull.status.block_height) {
                  confirmationCount = currentBlockHeight - txFull.status.block_height + 1;
                }

                // Requer pelo menos 1 confirmação para aprovar automaticamente
                if (confirmationCount >= 1) {
                  transactionFound = true;
                }
              }
            }
          }
        } else {
          // Se não há TX Hash, procurar nas transações do endereço
          for (const addressTx of addressTransactions) {
            const isCorrectTransaction = isTransactionToAddress(
              addressTx,
              walletAddress,
              pendingTx.amountBTC
            );

            if (isCorrectTransaction && addressTx.status.confirmed) {
              // Verificar se a transação foi criada após a solicitação (margem de 1 hora antes)
              const txTime = addressTx.status.block_time 
                ? new Date(addressTx.status.block_time * 1000)
                : null;
              const requestTime = new Date(pendingTx.createdAt);
              
              // Aceitar transações até 1 hora antes da solicitação (para casos de timing)
              if (!txTime || txTime >= new Date(requestTime.getTime() - 60 * 60 * 1000)) {
                transactionFound = true;
                
                // Calcular confirmações
                const currentBlockResponse = await fetch(`${BLOCKSTREAM_API_BASE}/blocks/tip/height`);
                const currentBlockHeight = await currentBlockResponse.json();
                
                if (addressTx.status.block_height) {
                  confirmationCount = currentBlockHeight - addressTx.status.block_height + 1;
                }

                // Atualizar TX Hash se não estava preenchido
                if (!pendingTx.txHash) {
                  await prisma.bitcoinTransaction.update({
                    where: { id: pendingTx.id },
                    data: { txHash: addressTx.txid }
                  });
                }

                break;
              }
            }
          }
        }

        // Se encontrou transação confirmada, aprovar automaticamente
        if (transactionFound && confirmationCount >= 1) {
          console.log(`[bitcoinVerificationService] ✅ Transação ${pendingTx.id} confirmada (${confirmationCount} confirmações). Aprovando...`);

          // Atualizar status da transação
          await prisma.bitcoinTransaction.update({
            where: { id: pendingTx.id },
            data: {
              status: 'approved',
              approvedAt: new Date()
            }
          });

          // Adicionar Super Créditos à carteira do usuário
          const wallet = await prisma.wallet.findFirst({
            where: {
              userId: pendingTx.userId,
              symbol: 'SUPER_CREDITS',
              type: 'virtual'
            }
          });

          if (wallet) {
            // Atualizar carteira existente
            await prisma.wallet.update({
              where: { id: wallet.id },
              data: {
                balance: wallet.balance + pendingTx.superCreditsAmount
              }
            });
          } else {
            // Criar nova carteira de Super Créditos
            await prisma.wallet.create({
              data: {
                userId: pendingTx.userId,
                type: 'virtual',
                symbol: 'SUPER_CREDITS',
                name: 'Super Créditos',
                balance: pendingTx.superCreditsAmount,
                value: pendingTx.superCreditsAmount
              }
            });
          }

          console.log(`[bitcoinVerificationService] ✅ Super Créditos creditados para usuário ${pendingTx.userId}`);
        } else if (transactionFound && confirmationCount === 0) {
          console.log(`[bitcoinVerificationService] ⏳ Transação ${pendingTx.id} encontrada mas ainda não confirmada. Aguardando...`);
        } else {
          console.log(`[bitcoinVerificationService] ⏸️ Transação ${pendingTx.id} ainda não encontrada no blockchain.`);
        }

        // Pequeno delay entre verificações para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`[bitcoinVerificationService] Erro ao verificar transação ${pendingTx.id}:`, error);
        // Continua verificando as outras transações
      }
    }

    console.log('[bitcoinVerificationService] Verificação concluída.');
  } catch (error) {
    console.error('[bitcoinVerificationService] Erro geral na verificação:', error);
    throw error;
  }
}
