import { FXRPDirectMintSDK } from '../src/FXRPDirectMintSDK';
import { executeXrplPaymentWithSeed } from '../src/utils/payment_signer';
import { createPublicClient, http, formatUnits } from 'viem';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client as XrplClient } from 'xrpl';

dotenv.config({ path: path.join(__dirname, '../.env') });

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

const coston2 = require('@flarenetwork/flare-wagmi-periphery-package').coston2;

async function main() {
  const xrplSeed = process.env.XRPL_SEED;
  const flarePrivateKey = process.env.COSTON2_PRIVATE_KEY;

  if (!xrplSeed || !flarePrivateKey) {
    console.error('Error: XRPL_SEED and COSTON2_PRIVATE_KEY must be configured in your .env file.');
    process.exit(1);
  }

  console.log('--- Starting Automated End-to-End Minting Test ---');

  // 1. Initialize the SDK
  console.log('Initializing SDK...');
  const sdk = new FXRPDirectMintSDK({
    xrplUrl: XRPL_URL,
    flarePrivateKey,
    flareRpcUrl: FLARE_RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
  });

  const settings = await sdk.getSettings();
  console.log(`Live Settings: Lot Size = ${settings.lotSizeXRP} XRP | Minter Fee APY/Share = ${settings.minterFeeShareBIPS / 100}%`);

  // Define EVM recipient address from private key
  const { privateKeyToAccount } = require('viem/accounts');
  const account = privateKeyToAccount(flarePrivateKey);
  const recipient = account.address;
  console.log(`EVM Recipient Address: ${recipient}`);

  // 2. Prepare Payment parameters
  console.log('\n1. Preparing payment parameters...');
  const paymentParams = await sdk.preparePayment({
    recipientEvmAddress: recipient,
    lots: 1,
  });
  console.log(`Vault Destination: ${paymentParams.vaultAddressXRP}`);
  console.log(`Required Amount: ${paymentParams.totalXRP} XRP`);
  console.log(`Memo Hex: ${paymentParams.memoHex}`);

  // 3. Submit real XRP Payment transaction
  console.log('\n2. Submitting payment transaction on XRPL...');
  const paymentResult = await executeXrplPaymentWithSeed(XRPL_URL, xrplSeed, paymentParams);
  console.log(`Payment successfully broadcasted! Hash: ${paymentResult.txHash}`);

  // 4. Polling ledger to replicate widget payment detection
  console.log('\n3. Starting live ledger observation (matching memo)...');
  const xrplClient = new XrplClient(XRPL_URL);
  await xrplClient.connect();

  let detectedResult = null;
  const maxAttempts = 12; // 2 minutes
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await xrplClient.request({
        command: "tx",
        transaction: paymentResult.txHash,
      });
      const tx = response.result as any;
      if (tx && tx.validated) {
        detectedResult = {
          txHash: tx.hash,
          blockTimestamp: (tx.date || 0) + 946684800,
          spentAmountDrops: typeof tx.Amount === 'string' ? tx.Amount : tx.Amount.value,
          receivedAmountDrops: typeof tx.Amount === 'string' ? tx.Amount : tx.Amount.value,
          receivingAddressXRP: paymentParams.vaultAddressXRP,
        };
        console.log(`  Payment validated! Ledger Close Hash: ${detectedResult.txHash}`);
        break;
      }
    } catch (err) {
      console.log('  Payment not found in ledger yet, waiting...');
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  await xrplClient.disconnect();

  if (!detectedResult) {
    throw new Error('Timeout: Payment transaction was not detected on the XRPL ledger.');
  }

  // 5. Track attestation and finalization
  console.log('\n4. Initiating FDC proof generation and Flare finalization...');
  await sdk.monitorStatus(detectedResult, async (status) => {
    console.log(`[Status Event] State: ${status.state} | Message: ${status.message}`);
    
    if (status.state === 'Delayed') {
      console.log(`\nRate limit hit! Allowed to execute at: ${status.allowedAt}`);
      console.log('Automated flow completed (held in Delayed state securely).');
      process.exit(0);
    }
    
    if (status.state === 'Complete') {
      console.log('\n5. Direct Minting finalized successfully!');
      
      // Query final balance
      const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
      const fAssetAddress = await publicClient.readContract({
        address: settings.assetManagerAddress as `0x${string}`,
        abi: coston2.iAssetManagerAbi,
        functionName: 'fAsset',
      }) as `0x${string}`;

      const fxrpBalance = await publicClient.readContract({
        address: fAssetAddress,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
          },
          {
            type: 'function',
            name: 'decimals',
            inputs: [],
            outputs: [{ type: 'uint8' }],
            stateMutability: 'view',
          }
        ],
        functionName: 'balanceOf',
        args: [recipient as `0x${string}`],
      }) as bigint;

      const decimals = await publicClient.readContract({
        address: fAssetAddress,
        abi: [
          {
            type: 'function',
            name: 'decimals',
            inputs: [],
            outputs: [{ type: 'uint8' }],
            stateMutability: 'view',
          }
        ],
        functionName: 'decimals',
      }) as number;

      const formatted = formatUnits(fxrpBalance, decimals);
      console.log(`Current Minted FXRP Token Balance: ${Number(formatted).toFixed(2)} FXRP`);
      process.exit(0);
    }

    if (status.state === 'Failed') {
      console.error('Finalization failed:', status.error);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
