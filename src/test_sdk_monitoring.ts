import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const DELAYED_TX_HASH = '710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';
const VAULT_ADDRESS_XRP = 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p';

async function main() {
  const xrplSeed = process.env.XRPL_SEED;
  const flarePrivateKey = process.env.COSTON2_PRIVATE_KEY;

  console.log('Initializing FXRPDirectMintSDK...');
  const sdk = new FXRPDirectMintSDK({
    xrplUrl: 'wss://s.altnet.rippletest.net:51233',
    flarePrivateKey,
    flareRpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
    registryAddress: REGISTRY_ADDRESS,
  });

  // 1. Query settings
  console.log('\n--- 1. Querying FAsset Settings ---');
  const settings = await sdk.getSettings();
  console.log('AssetManager address:', settings.assetManagerAddress);
  console.log('Lot Size:', settings.lotSizeXRP, 'XRP');
  console.log('Executor Fee:', settings.executorFeeXRP, 'XRP');
  console.log('Minting Paused:', settings.mintingPaused);

  // 2. Prepare payment
  console.log('\n--- 2. Preparing Payment Parameters ---');
  const recipient = '0x7bEa8C45F0cE61DF69914f5b04fa62a3D6f1E53c';
  const paymentParams = await sdk.preparePayment({
    recipientEvmAddress: recipient,
    lots: 1,
  });
  console.log('Destination Vault Address (XRP):', paymentParams.vaultAddressXRP);
  console.log('Memo Hex data:', paymentParams.memoHex);
  console.log('Total XRP required:', paymentParams.totalXRP);

  // 3. Test monitoring on a simulated payment result
  console.log('\n--- 3. Testing monitorStatus Lifecycle with Delayed Payment ---');
  // We mock a payment result using our previously validated transaction
  const mockPaymentResult = {
    txHash: DELAYED_TX_HASH,
    blockTimestamp: 1783607782, // timestamp of the validated XRPL transaction
    spentAmountDrops: '10200000',
    receivedAmountDrops: '10200000',
    receivingAddressXRP: VAULT_ADDRESS_XRP,
  };

  console.log(`Starting status monitoring for XRPL hash: ${DELAYED_TX_HASH}...`);
  await sdk.monitorStatus(mockPaymentResult, (status) => {
    console.log(`[Status Event] State: ${status.state}`);
    console.log(`  Message: ${status.message}`);
    if (status.allowedAt) {
      console.log(`  Allowed Execution Date: ${status.allowedAt.toISOString()}`);
    }
    if (status.error) {
      console.log(`  Error details:`, status.error);
    }
  });

  console.log('\nTest completed successfully!');
}

main().catch(console.error);
