const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

// FlareContractRegistry Address on Coston2
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

async function main() {
  const client = createPublicClient({
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  try {
    // 1. Resolve AssetManagerFXRP address
    const assetManagerAddress = await client.readContract({
      address: REGISTRY_ADDRESS,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['AssetManagerFXRP']
    });
    console.log('AssetManagerFXRP Address:', assetManagerAddress);

    // 2. Query configurations
    const paymentAddress = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'directMintingPaymentAddress'
    });
    console.log('Core Vault Payment Address (XRPL):', paymentAddress);

    const lotSize = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'lotSize'
    });
    console.log('Lot Size:', lotSize.toString());

    const feeBips = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingFeeBIPS'
    });
    console.log('Direct Minting Fee (BIPS):', feeBips.toString(), `(${Number(feeBips) / 100}%)`);

    const executorFeeUBA = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingExecutorFeeUBA'
    });
    console.log('Executor Fee (UBA):', executorFeeUBA.toString(), `(${Number(executorFeeUBA) / 1e6} XRP)`);

    const minimumFeeUBA = await client.readContract({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingMinimumFeeUBA'
    });
    console.log('Minimum Fee (UBA):', minimumFeeUBA.toString(), `(${Number(minimumFeeUBA) / 1e6} XRP)`);

  } catch (error) {
    console.error('Error fetching settings:', error);
  }
}

main();
