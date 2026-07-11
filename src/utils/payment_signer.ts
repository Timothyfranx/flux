import { Client as XrplClient, Wallet as XrplWallet, xrpToDrops } from 'xrpl';
import { PaymentParams, PaymentResult } from '../types';

/**
 * Connects to XRPL and executes the payment transaction using a raw seed.
 * STRICTLY ISOLATED UTILITY: Used only for developer tests and sandbox simulations.
 * This function should never be called or imported by production frontend paths.
 */
export async function executeXrplPaymentWithSeed(
  xrplUrl: string,
  xrplSeed: string,
  params: PaymentParams
): Promise<PaymentResult> {
  const wallet = XrplWallet.fromSeed(xrplSeed);
  const client = new XrplClient(xrplUrl);

  await client.connect();

  try {
    const drops = xrpToDrops(params.totalXRP);
    const tx = {
      TransactionType: 'Payment' as const,
      Account: wallet.address,
      Amount: drops,
      Destination: params.vaultAddressXRP,
      Memos: [
        {
          Memo: {
            MemoType: '46417373657473', // Hex for "FAssets"
            MemoFormat: '6170706c69636174696f6e2f6f637465742d73747265616d', // Hex for "application/octet-stream"
            MemoData: params.memoHex,
          },
        },
      ],
    };

    const prepared = await client.autofill(tx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const meta = result.result.meta;
    if (typeof meta === 'object' && meta && meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`XRPL Transaction failed with result: ${meta.TransactionResult}`);
    }

    // Convert XRPL block close time to unix timestamp
    const ledgerIndex = result.result.ledger_index;
    const ledger = await client.request({
      command: 'ledger',
      ledger_index: ledgerIndex,
    });
    const closeTime = ledger.result.ledger.close_time;
    const blockTimestamp = closeTime + 946684800; // Ripple Epoch to Unix Epoch

    // Parse metadata for actual spent amounts
    let spentDrops = drops;
    let receivedDrops = drops;
    if (typeof meta === 'object' && meta && meta.delivered_amount) {
      receivedDrops = typeof meta.delivered_amount === 'string' ? meta.delivered_amount : drops;
    }

    return {
      txHash: signed.hash,
      blockTimestamp,
      spentAmountDrops: spentDrops,
      receivedAmountDrops: receivedDrops,
      receivingAddressXRP: params.vaultAddressXRP,
    };

  } finally {
    await client.disconnect();
  }
}
