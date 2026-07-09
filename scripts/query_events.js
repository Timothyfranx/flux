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

    console.log('Fetching logs for transaction hash:', TX_HASH);
    
    // Let's fetch logs from the last 100,000 blocks
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - 50000n;

    const logs = await client.getLogs({
      address: assetManagerAddress,
      fromBlock: fromBlock,
      toBlock: 'latest'
    });

    console.log(`Found ${logs.length} logs in the last 50,000 blocks.`);

    // Find logs matching our transaction hash in the topics
    const matchingLogs = logs.filter(log => {
      return log.topics.some(topic => topic.toLowerCase() === TX_HASH.toLowerCase());
    });

    console.log(`Found ${matchingLogs.length} matching logs for our TX_HASH:`);
    for (const log of matchingLogs) {
      console.log('\nLog Block:', log.blockNumber.toString());
      console.log('Log Transaction Hash:', log.transactionHash);
      console.log('Log Topics:', log.topics);
      console.log('Log Data:', log.data);
    }

  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

main();
