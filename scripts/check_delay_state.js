const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const TX_HASH = '0x710EDC95E4113A70323F7FB4DE8C6F34D92C7AC971A8FC53E44B92849354A38A';

async function main() {
  const client = createPublicClient({
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  try {
    const assetManagerAddress = await client.readContract({
      address: REGISTRY_ADDRESS,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['AssetManagerFXRP']
    });

    console.log('Querying directMintingDelayState...');
    const result = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'directMintingDelayState',
      args: [TX_HASH]
    });

    const [delayState, allowedAt, startedAt] = result;
    const states = ['NotDelayed', 'Delayed', 'Released'];
    console.log('Delay State:', states[delayState] || delayState);
    console.log('Allowed At:', allowedAt.toString(), allowedAt > 0 ? `(${new Date(Number(allowedAt) * 1000).toISOString()})` : '');
    console.log('Started At:', startedAt.toString(), startedAt > 0 ? `(${new Date(Number(startedAt) * 1000).toISOString()})` : '');

    const currentBlock = await client.getBlock();
    console.log('Current Block Timestamp:', currentBlock.timestamp.toString());

  } catch (error) {
    console.error('Error querying delay state:', error);
  }
}

main();
