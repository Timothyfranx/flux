const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');

// FlareContractRegistry Address on Coston2
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

const registryAbi = [
  {
    "type": "function",
    "name": "getContractAddressByName",
    "inputs": [
      {
        "name": "_name",
        "type": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
];

async function main() {
  const client = createPublicClient({
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  try {
    const assetManagerAddress = await client.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'getContractAddressByName',
      args: ['AssetManagerFXRP']
    });

    console.log('AssetManagerFXRP Address:', assetManagerAddress);

    const fdcVerificationAddress = await client.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'getContractAddressByName',
      args: ['FdcVerification']
    });

    console.log('FdcVerification Address:', fdcVerificationAddress);
  } catch (error) {
    console.error('Error querying registry:', error);
  }
}

main();
