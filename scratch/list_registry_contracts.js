const { createPublicClient, http } = require('viem');
const coston2 = require('@flarenetwork/flare-wagmi-periphery-package').coston2;

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

async function main() {
  const publicClient = createPublicClient({
    transport: http(FLARE_RPC_URL)
  });

  console.log('Querying FlareContractRegistry on Coston2 for all registered contracts...');

  try {
    const registryAbi = [
      {
        type: 'function',
        name: 'getAllContracts',
        inputs: [],
        outputs: [
          { name: '_names', type: 'string[]' },
          { name: '_addresses', type: 'address[]' }
        ],
        stateMutability: 'view'
      }
    ];

    const [names, addresses] = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'getAllContracts'
    });

    console.log(`\nFound ${names.length} registered contracts:`);
    for (let i = 0; i < names.length; i++) {
      console.log(`- ${names[i]}: ${addresses[i]}`);
    }
  } catch (err) {
    console.error('Failed to query contracts:', err);
  }
}

main();
