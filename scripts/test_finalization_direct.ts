import { FXRPDirectMintSDK } from '../src/FXRPDirectMintSDK';
import { createPublicClient, http, formatUnits } from 'viem';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

const coston2 = require('@flarenetwork/flare-wagmi-periphery-package').coston2;

async function main() {
  const flarePrivateKey = process.env.COSTON2_PRIVATE_KEY;

  if (!flarePrivateKey) {
    console.error('Error: COSTON2_PRIVATE_KEY must be configured in your .env file.');
    process.exit(1);
  }

  console.log('--- Starting FDC & EVM Direct Finalization Test ---');

  // Initialize the SDK
  console.log('Initializing SDK...');
  const sdk = new FXRPDirectMintSDK({
    xrplUrl: XRPL_URL,
    flarePrivateKey,
    flareRpcUrl: FLARE_RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
  });

  const settings = await sdk.getSettings();

  // Define EVM recipient address from private key
  const { privateKeyToAccount } = require('viem/accounts');
  const account = privateKeyToAccount(flarePrivateKey);
  const recipient = account.address;
  console.log(`EVM Recipient Address: ${recipient}`);

  // Use the verified transaction hash from our recent XRPL broadcast
  const detectedResult = {
    txHash: 'BB774E7946EB80E8C9095BFD12365CCD1B30CF59485F2FE806AA013309A88E4E',
    blockTimestamp: 837097011 + 946684800, // Date timestamp of payment from XRPL ledger
    spentAmountDrops: '10200000',
    receivedAmountDrops: '10200000',
    receivingAddressXRP: 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p',
  };

  console.log(`\nUsing Validated XRPL Payment Hash: ${detectedResult.txHash}`);
  console.log('Initiating FDC proof generation and Flare finalization...');

  await sdk.monitorStatus(detectedResult, async (status) => {
    console.log(`[Status Event] State: ${status.state} | Message: ${status.message}`);
    
    if (status.state === 'Delayed') {
      console.log(`\nRate limit hit! Allowed to execute at: ${status.allowedAt}`);
      console.log('Finalization status check completed.');
      process.exit(0);
    }
    
    if (status.state === 'Complete') {
      console.log('\nDirect Minting finalized successfully!');
      
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
