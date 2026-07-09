const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

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

    const paused = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'mintingPaused'
    });
    console.log('Minting Paused:', paused);

    const emergencyPaused = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'emergencyPaused'
    });
    console.log('Emergency Paused:', emergencyPaused);

    const unblockTimestamp = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingsUnblockUntilTimestamp'
    });
    console.log('Unblock Until Timestamp:', unblockTimestamp.toString(), `(${new Date(Number(unblockTimestamp) * 1000).toISOString()})`);

    const currentBlock = await client.getBlock();
    console.log('Current Block Timestamp:', currentBlock.timestamp.toString(), `(${new Date(Number(currentBlock.timestamp) * 1000).toISOString()})`);

  } catch (error) {
    console.error('Error querying status:', error);
  }
}

main();
