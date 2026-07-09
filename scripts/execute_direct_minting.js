const fs = require('fs');
const path = require('path');
const { createPublicClient, createWalletClient, http, decodeAbiParameters } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');
require('dotenv').config();

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

async function main() {
  const privateKey = process.env.COSTON2_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: COSTON2_PRIVATE_KEY must be set in .env');
    process.exit(1);
  }

  // Load proof.json
  const proofPath = path.join(__dirname, '../proof.json');
  if (!fs.existsSync(proofPath)) {
    console.error(`Error: proof.json not found at ${proofPath}. Run fetch_fdc_proof.js first.`);
    process.exit(1);
  }
  const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf8'));

  const account = privateKeyToAccount(privateKey);
  console.log('Using EVM Account:', account.address);

  const publicClient = createPublicClient({
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  const walletClient = createWalletClient({
    account,
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  try {
    // 1. Resolve AssetManager address
    console.log('Resolving AssetManagerFXRP address...');
    const assetManagerAddress = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['AssetManagerFXRP']
    });
    console.log('AssetManagerFXRP Address:', assetManagerAddress);

    // 2. Decode the responseBody / response_hex
    // Let's find the executeDirectMinting function inputs in ABI
    const fExecute = coston2.iAssetManagerAbi.find(item => item.name === 'executeDirectMinting');
    
    // The data parameter type components
    const responseType = fExecute.inputs[0].components.find(item => item.name === 'data');
    
    console.log('Decoding response_hex...');
    // In viem, decodeAbiParameters expects an array of components representing the tuple
    const decoded = decodeAbiParameters(
      [responseType],
      proofData.response_hex
    );
    const decodedData = decoded[0];

    console.log('Decoded Response Data:');
    console.log(JSON.stringify(decodedData, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2
    ));

    // 3. Construct the payment proof parameter
    const paymentProof = {
      merkleProof: proofData.proof,
      data: decodedData
    };

    // 4. Call executeDirectMinting
    console.log('\nSubmitting executeDirectMinting on Flare...');
    const hash = await walletClient.writeContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'executeDirectMinting',
      args: [paymentProof]
    });

    console.log('Transaction submitted! Hash:', hash);
    console.log('Waiting for transaction to be mined...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    console.log('Direct minting execution completed successfully!');
    console.log('Confirmed in block:', receipt.blockNumber.toString());
    console.log('Gas used:', receipt.gasUsed.toString());

  } catch (error) {
    console.error('Error executing direct minting:', error);
  }
}

main();
