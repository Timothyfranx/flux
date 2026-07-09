const { createPublicClient, http } = require('viem');
const { flareTestnet } = require('viem/chains');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const BLOCK_NUMBER = 32674140n; // Our FdcHub transaction block number

const flareSystemsManagerAbi = [
  {
    "type": "function",
    "name": "firstVotingRoundStartTs",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "votingEpochDurationSeconds",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
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
    // 1. Resolve FlareSystemsManager address
    console.log('Resolving FlareSystemsManager...');
    const systemsManagerAddress = await client.readContract({
      address: REGISTRY_ADDRESS,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['FlareSystemsManager']
    });
    console.log('FlareSystemsManager Address:', systemsManagerAddress);

    // 2. Query constants
    const firstVotingRoundStartTs = await client.readContract({
      address: systemsManagerAddress,
      abi: flareSystemsManagerAbi,
      functionName: 'firstVotingRoundStartTs'
    });
    const votingEpochDurationSeconds = await client.readContract({
      address: systemsManagerAddress,
      abi: flareSystemsManagerAbi,
      functionName: 'votingEpochDurationSeconds'
    });

    console.log('firstVotingRoundStartTs:', firstVotingRoundStartTs.toString());
    console.log('votingEpochDurationSeconds:', votingEpochDurationSeconds.toString());

    // 3. Get block timestamp
    const block = await client.getBlock({ blockNumber: BLOCK_NUMBER });
    const blockTimestamp = block.timestamp;
    console.log(`Block ${BLOCK_NUMBER} Timestamp:`, blockTimestamp.toString(), `(${new Date(Number(blockTimestamp) * 1000).toISOString()})`);

    // 4. Calculate roundId
    const roundId = (blockTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds;
    console.log('\nCalculated FDC Voting Round ID:', roundId.toString());

  } catch (error) {
    console.error('Error calculating round ID:', error);
  }
}

main();
