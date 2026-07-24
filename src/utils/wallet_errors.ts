/**
 * Shared EVM Wallet Error Translator
 * Translates raw contract write errors into clean, user-friendly messages.
 * Preserves raw original error message for all unrecognized cases.
 */
export function getFriendlyWalletError(err: any): string {
  if (!err) return 'An unknown error occurred.';

  const rawMessage = err.message || String(err);

  // 1. User rejection check (EIP-1193 code 4001 or Viem UserRejectedRequestError)
  const code = err.code ?? err.cause?.code;
  const name = err.name ?? err.cause?.name;
  const msgLower = rawMessage.toLowerCase();

  if (
    code === 4001 ||
    name === 'UserRejectedRequestError' ||
    msgLower.includes('user rejected') ||
    msgLower.includes('user denied') ||
    msgLower.includes('transaction rejected')
  ) {
    return 'Transaction cancelled — no changes were made.';
  }

  // 2. Insufficient funds check
  if (msgLower.includes('insufficient funds') || msgLower.includes('exceeds balance')) {
    return "This wallet doesn't have enough C2FLR to cover this transaction. Get free testnet C2FLR from https://faucet.flare.network";
  }

  // 3. Wrong network / chain mismatch check
  if (
    msgLower.includes('chain mismatch') ||
    msgLower.includes('chain id') ||
    msgLower.includes('wrong chain') ||
    msgLower.includes('target chain')
  ) {
    return 'Please switch your wallet to Flare Testnet Coston2 and try again.';
  }

  // 4. Fallback — return original message unchanged
  return rawMessage;
}
