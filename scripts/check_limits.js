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

    const hourlyLimit = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingHourlyLimitUBA'
    });
    console.log('Hourly Limit (UBA):', hourlyLimit.toString(), `(${Number(hourlyLimit) / 1e6} XRP)`);

    const dailyLimit = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingDailyLimitUBA'
    });
    console.log('Daily Limit (UBA):', dailyLimit.toString(), `(${Number(dailyLimit) / 1e6} XRP)`);

    const largeThreshold = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingLargeMintingThresholdUBA'
    });
    console.log('Large Minting Threshold (UBA):', largeThreshold.toString(), `(${Number(largeThreshold) / 1e6} XRP)`);

    const hourlyState = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingHourlyLimiterState'
    });
    console.log('Hourly Limiter State (used UBA):', hourlyState.toString(), `(${Number(hourlyState) / 1e6} XRP)`);

    const dailyState = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingDailyLimiterState'
    });
    console.log('Daily Limiter State (used UBA):', dailyState.toString(), `(${Number(dailyState) / 1e6} XRP)`);

  } catch (error) {
    console.error('Error querying limits:', error);
  }
}

main();
