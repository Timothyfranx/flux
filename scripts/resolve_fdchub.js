const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

async function main() {
  const client = createPublicClient({
    chain: flareTestnet,
    transport: http('https://coston2-api.flare.network/ext/C/rpc')
  });

  const names = ['FdcHub', 'FDCHub', 'FdcRequestFeeConfigurations', 'FdcVerification', 'StateConnector'];

  for (const name of names) {
    try {
      const address = await client.readContract({
        address: REGISTRY_ADDRESS,
        abi: coston2.iFlareContractRegistryAbi,
        functionName: 'getContractAddressByName',
        args: [name]
      });
      console.log(`${name} Address:`, address);
    } catch (error) {
      console.log(`Failed to resolve ${name}`);
    }
  }
}

main();
