import { FAssetMultiSDK } from './FAssetMultiSDK';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

async function runMockSimulation() {
  console.log('--- FAsset Multi-Chain SDK Formatting & Simulation Test ---');

  // Initialize SDK with a mock private key for local formatting tests
  const mockPrivateKey = '0x1ae61682a199f710315589b41cb7028c25b4594e22fc4d106bcb24d3f770216c';
  const sdk = new FAssetMultiSDK({
    flareRpcUrl: FLARE_RPC_URL,
    flarePrivateKey: mockPrivateKey,
  });

  const testRecipient = '0x7bEa8C45F0cE61DF69914f5b04fa62a3D6f1E53c';
  const testLots = 2;

  console.log('\n[1] Testing XRP Direct Mint parameters prep...');
  try {
    const xrpParams = await sdk.preparePayment('XRP', {
      recipientEvmAddress: testRecipient,
      lots: testLots,
    });
    console.log('XRP Gateway Address:', xrpParams.gatewayAddress);
    console.log('XRP Amount Required:', xrpParams.amountUnderlying, 'XRP');
    console.log('XRP Total Required (incl. fees):', xrpParams.totalRequiredUnderlying, 'XRP');
    console.log('XRP Binary Memo Payload:', xrpParams.memoPayload);
    console.log('XRP Memo Payload Length:', xrpParams.memoPayload.length, 'hex chars (expected 64)');
    console.log('XRP Check prefix:', xrpParams.memoPayload.startsWith('4642505266410018') ? '✓ Valid' : '✗ Invalid');
  } catch (err: any) {
    console.error('XRP Prep failed:', err.message);
  }

  console.log('\n[2] Testing BTC Direct Mint parameters prep (UTXO OP_RETURN)...');
  try {
    const btcParams = await sdk.preparePayment('BTC', {
      recipientEvmAddress: testRecipient,
      lots: testLots,
    });
    console.log('BTC Gateway Address:', btcParams.gatewayAddress);
    console.log('BTC Amount Required:', btcParams.amountUnderlying, 'BTC');
    console.log('BTC Total Required (incl. fees):', btcParams.totalRequiredUnderlying, 'BTC');
    console.log('BTC OP_RETURN Payload:', btcParams.memoPayload);
    console.log('BTC OP_RETURN Payload Length:', btcParams.memoPayload.length, 'hex chars (expected 64)');
    console.log('BTC Check prefix:', btcParams.memoPayload.startsWith('4642505266410018') ? '✓ Valid' : '✗ Invalid');
  } catch (err: any) {
    console.error('BTC Prep failed:', err.message);
  }

  console.log('\n[3] Testing DOGE Direct Mint parameters prep (UTXO OP_RETURN)...');
  try {
    const dogeParams = await sdk.preparePayment('DOGE', {
      recipientEvmAddress: testRecipient,
      lots: testLots,
    });
    console.log('DOGE Gateway Address:', dogeParams.gatewayAddress);
    console.log('DOGE Amount Required:', dogeParams.amountUnderlying, 'DOGE');
    console.log('DOGE Total Required (incl. fees):', dogeParams.totalRequiredUnderlying, 'DOGE');
    console.log('DOGE OP_RETURN Payload:', dogeParams.memoPayload);
    console.log('DOGE OP_RETURN Payload Length:', dogeParams.memoPayload.length, 'hex chars (expected 64)');
    console.log('DOGE Check prefix:', dogeParams.memoPayload.startsWith('4642505266410018') ? '✓ Valid' : '✗ Invalid');
  } catch (err: any) {
    console.error('DOGE Prep failed:', err.message);
  }

  console.log('\n--- Simulation Completed ---');
}

runMockSimulation().catch(console.error);
