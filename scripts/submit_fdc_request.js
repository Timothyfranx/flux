const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { flareTestnet } = require('viem/chains');
require('dotenv').config();

const FDC_HUB_ADDRESS = '0x48aC463d7975828989331F4De43341627b9c5f1D';
const FDC_FEE_CONFIG_ADDRESS = '0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e';

const ABI_ENCODED_REQUEST = '0x5852505061796d656e7400000000000000000000000000000000000000000000746573745852500000000000000000000000000000000000000000000000000095d9d575228f8afad9d028cd3f8ba50c83f15254bdadff2d4681f0d1bc23586f710edc95e4113a70323f7fb4de8c6f34d92c7ac971a8fc53e44b92849354a38a0000000000000000000000000000000000000000000000000000000000000000';

const fdcFeeConfigAbi = [
  {
    "type": "function",
    "name": "getRequestFee",
    "inputs": [
      {
        "name": "_attestationRequest",
        "type": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  }
];

const fdcHubAbi = [
  {
    "type": "function",
    "name": "requestAttestation",
    "inputs": [
      {
        "name": "_attestationRequest",
        "type": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  }
];

async function main() {
  const privateKey = process.env.COSTON2_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: COSTON2_PRIVATE_KEY must be set in .env');
    process.exit(1);
  }

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
    // 1. Query the fee configurations
    console.log('Querying FDC request fee...');
    const requestFee = await publicClient.readContract({
      address: FDC_FEE_CONFIG_ADDRESS,
      abi: fdcFeeConfigAbi,
      functionName: 'getRequestFee',
      args: [ABI_ENCODED_REQUEST]
    });

    console.log(`FDC Request Fee: ${requestFee.toString()} wei (${Number(requestFee) / 1e18} C2FLR)`);

    // 2. Submit the request
    console.log('Submitting requestAttestation to FdcHub...');
    const hash = await walletClient.writeContract({
      address: FDC_HUB_ADDRESS,
      abi: fdcHubAbi,
      functionName: 'requestAttestation',
      args: [ABI_ENCODED_REQUEST],
      value: requestFee
    });

    console.log('Transaction submitted! Hash:', hash);
    console.log('Waiting for receipt...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Transaction confirmed in block:', receipt.blockNumber.toString());
    console.log('Gas used:', receipt.gasUsed.toString());

  } catch (error) {
    console.error('Error submitting FDC request:', error);
  }
}

main();
