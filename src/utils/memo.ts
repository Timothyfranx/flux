import { toHex } from 'viem';

/**
 * Encodes the recipient EVM address and executor EVM address into a 32-byte direct minting binary memo.
 * Format: Operation Prefix (8 bytes) + Zero Padding (4 bytes) + EVM Address (20 bytes)
 * Or with Executor: Operation Prefix (8 bytes) + Executor (20 bytes) + Recipient (20 bytes) - wait, standard direct minting without executor uses:
 * Operation Prefix (8 bytes) + Zero Padding (4 bytes) + EVM Address (20 bytes).
 * 
 * DIRECT_MINTING Prefix: 0x4642505266410018
 */
export function encodeDirectMintingMemo(recipientEvmAddress: string): string {
  const prefix = '4642505266410018'; // DIRECT_MINTING prefix
  const padding = '00000000'; // 4 bytes of padding
  const cleanAddress = recipientEvmAddress.replace(/^0x/i, '').toLowerCase();

  if (cleanAddress.length !== 40) {
    throw new Error(`Invalid EVM address length: expected 40 hex chars, got ${cleanAddress.length}`);
  }

  return `${prefix}${padding}${cleanAddress}`.toUpperCase();
}
