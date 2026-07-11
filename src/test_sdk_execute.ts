import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { decodeAbiParameters } from 'viem';
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

dotenv.config({ path: path.join(__dirname, '../.env') });

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const DELAYED_TX_HASH = '0x710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';

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

  // 1. Load saved FDC proof
  const proofPath = path.join(__dirname, '../proof.json');
  console.log(`Loading saved FDC proof from: ${proofPath}`);
  if (!fs.existsSync(proofPath)) {
    throw new Error('proof.json not found! Run fetch_fdc_proof.js first.');
  }

  const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf8'));

  // Decode response_hex into data parameter
  const fExecute = coston2.iAssetManagerAbi.find((item: any) => item.name === 'executeDirectMinting');
  const responseType = fExecute.inputs[0].components.find((item: any) => item.name === 'data');
  const decoded = decodeAbiParameters([responseType], proofData.response_hex);

  const paymentProof = {
    merkleProof: proofData.proof,
    data: decoded[0]
  };

  console.log('paymentProof type:', typeof paymentProof);
  console.log('paymentProof keys:', Object.keys(paymentProof));
  console.log('paymentProof.merkleProof isArray:', Array.isArray(paymentProof.merkleProof));
  console.log('paymentProof.merkleProof value:', paymentProof.merkleProof);
  console.log('paymentProof.data type:', typeof paymentProof.data);

  // 2. Call executeMint using the structured proof
  console.log('\nSubmitting executeMint with the structured proof to Coston2...');
  try {
    const hash = await sdk.executeMint(paymentProof);
    console.log(`Success! Transaction Hash: ${hash}`);
  } catch (error: any) {
    console.log('Contract call reverted as expected.');
    
    // Check if it is the custom rate-limiting error 0x40d8d67b
    const errorData = error.data || (error.cause && error.cause.data) || error.signature || (error.cause && error.cause.signature) || error.raw || (error.cause && error.cause.raw);
    console.log('Revert Raw Data:', errorData);

    const isDelayed = typeof errorData === 'string' && (errorData.startsWith('0x40d8d67b') || errorData.includes('0x40d8d67b'));
    if (isDelayed) {
      console.log('\nDecoded Revert Cause: direct minting rate limits exceeded.');
      
      // Query delay state
      const settings = await sdk.getSettings();
      console.log('Querying directMintingDelayState...');
      
      const delayState = await sdk['publicClient'].readContract({
        address: settings.assetManagerAddress as `0x${string}`,
        abi: coston2.iAssetManagerAbi,
        functionName: 'directMintingDelayState',
        args: [DELAYED_TX_HASH],
      }) as [number, bigint, bigint];

      const [stateVal, allowedAt, startedAt] = delayState;
      const states = ['NotDelayed', 'Delayed', 'Released'];
      console.log('  State:', states[stateVal]);
      console.log('  Allowed At:', new Date(Number(allowedAt) * 1000).toISOString());
      console.log('  Started At:', new Date(Number(startedAt) * 1000).toISOString());

      const timeLeft = Number(allowedAt) - Math.floor(Date.now() / 1000);
      console.log(`  Time remaining until execution allowed: ${timeLeft} seconds (~${(timeLeft / 60).toFixed(1)} minutes)`);
    } else {
      console.error('Unexpected revert error:', error);
    }
  }
}

main().catch(console.error);
