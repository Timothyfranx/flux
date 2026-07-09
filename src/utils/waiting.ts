import { PublicClient, Address, Hash, decodeEventLog } from 'viem';
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

export interface DirectMintingOutcome {
  status: 'EXECUTED' | 'DELAYED';
  mintedAmountUBA?: bigint;
  mintingFeeUBA?: bigint;
  executorFeeUBA?: bigint;
  executionAllowedAt?: bigint;
  transactionHash?: Hash;
}

/**
 * Checks the onchain direct minting delay state for a transaction ID.
 */
export async function getDirectMintingDelayState(
  publicClient: PublicClient,
  assetManagerAddress: Address,
  transactionId: Hash
): Promise<{ state: 'NotDelayed' | 'Delayed' | 'Released'; allowedAt: bigint; startedAt: bigint }> {
  const result = (await publicClient.readContract({
    address: assetManagerAddress,
    abi: coston2.iAssetManagerAbi,
    functionName: 'directMintingDelayState',
    args: [transactionId],
  })) as [number, bigint, bigint];

  const [stateVal, allowedAt, startedAt] = result;
  const states: Array<'NotDelayed' | 'Delayed' | 'Released'> = ['NotDelayed', 'Delayed', 'Released'];
  return {
    state: states[stateVal] || 'NotDelayed',
    allowedAt,
    startedAt,
  };
}

/**
 * Polls for the outcome of the direct minting transaction.
 * Resolves when the transaction is completed (EXECUTED) or if it is DELAYED.
 * Handles the 30-block RPC log query limit by polling in small ranges or using delay states.
 */
export async function waitForDirectMintingOutcome(
  publicClient: PublicClient,
  assetManagerAddress: Address,
  transactionId: Hash,
  onDelayObserved?: (allowedAt: bigint) => void,
  pollingIntervalMs = 10000,
  timeoutMs = 600000 // 10 minutes default
): Promise<DirectMintingOutcome> {
  const startTime = Date.now();
  let startBlock = await publicClient.getBlockNumber();

  while (Date.now() - startTime < timeoutMs) {
    // 1. First check the delay state view function (gas-free and instantaneous)
    const { state, allowedAt } = await getDirectMintingDelayState(publicClient, assetManagerAddress, transactionId);

    if (state === 'Delayed') {
      if (onDelayObserved) {
        onDelayObserved(allowedAt);
      }
      return {
        status: 'DELAYED',
        executionAllowedAt: allowedAt,
      };
    }

    // 2. Fetch logs from the last few blocks (up to 20 blocks to respect the 30-block RPC limit)
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - 20n < startBlock ? startBlock : currentBlock - 20n;

    try {
      const logs = await publicClient.getLogs({
        address: assetManagerAddress,
        fromBlock,
        toBlock: currentBlock,
      });

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: coston2.iAssetManagerAbi,
            data: log.data,
            topics: log.topics,
          }) as any;

          // Check DirectMintingExecuted
          if (decoded.eventName === 'DirectMintingExecuted') {
            const args = decoded.args as any;
            if (args.transactionId.toLowerCase() === transactionId.toLowerCase()) {
              return {
                status: 'EXECUTED',
                mintedAmountUBA: args.mintedAmountUBA,
                mintingFeeUBA: args.mintingFeeUBA,
                executorFeeUBA: args.executorFeeUBA,
                transactionHash: log.transactionHash,
              };
            }
          }

          // Check DirectMintingDelayed
          if (decoded.eventName === 'DirectMintingDelayed' || decoded.eventName === 'LargeDirectMintingDelayed') {
            const args = decoded.args as any;
            if (args.transactionId.toLowerCase() === transactionId.toLowerCase()) {
              if (onDelayObserved) {
                onDelayObserved(args.executionAllowedAt);
              }
              return {
                status: 'DELAYED',
                executionAllowedAt: args.executionAllowedAt,
              };
            }
          }
        } catch (e) {
          // Ignore logs that don't match the ABI event structures
        }
      }
    } catch (e) {
      console.warn('Error fetching logs, retrying...', e);
    }

    startBlock = currentBlock;
    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  }

  throw new Error('Timeout waiting for direct minting outcome.');
}
