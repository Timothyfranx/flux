import { FXRPDirectMintSDK } from '../src/FXRPDirectMintSDK';
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
  const flarePrivateKey = process.env.COSTON2_PRIVATE_KEY;
  const hash = 'B5677D3180246CCE39E7C8208394758D4700155F67C6C68D93B6DDCC7BF6DFA6';

  if (!flarePrivateKey) {
    console.error('Error: COSTON2_PRIVATE_KEY is missing.');
    return;
  }

  console.log('--- Finalizing Specific Minting Transaction Hash ---');
  
  // 1. Fetch transaction details from XRPL
  const xrplClient = new XrplClient(XRPL_URL);
  await xrplClient.connect();
  const txInfo = await xrplClient.request({
    command: 'tx',
    transaction: hash,
  });
  await xrplClient.disconnect();

  const tx = txInfo.result as any;
  const ledgerCloseTimeRipple = tx.date; // Ripple Epoch
  const blockTimestamp = ledgerCloseTimeRipple + 946684800; // Unix Epoch
  
  const detectedResult = {
    txHash: tx.hash,
    blockTimestamp,
    spentAmountDrops: '10200000', // 10.2 XRP in drops
    receivedAmountDrops: '10200000',
    receivingAddressXRP: tx.Destination,
  };

  console.log(`Detected transaction on XRPL!`);
  console.log(`Timestamp: ${blockTimestamp} | Receiving Address: ${detectedResult.receivingAddressXRP}`);

  // 2. Initialize SDK
  const sdk = new FXRPDirectMintSDK({
    xrplUrl: XRPL_URL,
    flarePrivateKey,
    flareRpcUrl: FLARE_RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
  });

  const settings = await sdk.getSettings();

  // 3. Monitor and Execute Direct Minting
  console.log('Submitting FDC request and polling for finalization...');
  await sdk.monitorStatus(detectedResult, async (status) => {
    console.log(`[Status Event] State: ${status.state} | Message: ${status.message}`);
    
    if (status.state === 'Delayed') {
      console.log(`Rate limit delay hit. execution allowed at: ${status.allowedAt}`);
      process.exit(0);
    }
    
    if (status.state === 'Complete') {
      console.log('>>> Minting finalized successfully!');
      
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
        args: [recipientAddress(flarePrivateKey)],
      }) as bigint;

      console.log(`Current Minted FXRP Token Balance: ${Number(fxrpBalance) / 1e6} FXRP`);
      process.exit(0);
    }

    if (status.state === 'Failed') {
      console.error('Finalization failed:', status.error);
      process.exit(1);
    }
  });
}

function recipientAddress(privateKey: string): `0x${string}` {
  const { privateKeyToAccount } = require('viem/accounts');
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

main().catch(console.error);
