import { PublicClient, Address, decodeAbiParameters } from 'viem';
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

export interface FdcProof {
  merkleProof: string[];
  data: {
    attestationType: string;
    sourceId: string;
    votingRoundId: bigint;
    lowestUsedTimestamp: bigint;
    requestBody: {
      transactionId: string;
      receivingAddressHash: string;
    };
    responseBody: {
      status: bigint;
      receivingAddressHash: string;
      intendedReceivingAddressHash: string;
      spentAmount: bigint;
      intendedSpentAmount: bigint;
      firstMemoData: string;
    };
  };
}

/**
 * Calculates the voting round ID for a given timestamp.
 */
export async function calculateVotingRoundId(
  publicClient: PublicClient,
  systemsManagerAddress: Address,
  timestamp: number
): Promise<number> {
  const firstVotingRoundStartTs = (await publicClient.readContract({
    address: systemsManagerAddress,
    abi: [
      {
        type: 'function',
        name: 'firstVotingRoundStartTs',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'firstVotingRoundStartTs',
  })) as bigint;

  const votingEpochDurationSeconds = (await publicClient.readContract({
    address: systemsManagerAddress,
    abi: [
      {
        type: 'function',
        name: 'votingEpochDurationSeconds',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'votingEpochDurationSeconds',
  })) as bigint;

  return Math.floor((timestamp - Number(firstVotingRoundStartTs)) / Number(votingEpochDurationSeconds));
}

/**
 * Fetches and decodes the FDC attestation proof from the Coston2 Data Availability (DA) Layer.
 * Returns the exact proof structure expected by the executeDirectMinting function.
 */
export async function fetchFdcProof(votingRoundId: number, requestBytes: string): Promise<any | null> {
  const url = 'https://ctn2-data-availability.flare.network/api/v1/fdc/proof-by-request-round-raw';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      votingRoundId,
      requestBytes,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // proof not found/not ready yet
    }
    const errText = await response.text();
    throw new Error(`DA Layer error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as any;
  if (data && data.proof && data.response_hex) {
    // Resolve the parameter type struct for decodeAbiParameters
    const fExecute = coston2.iAssetManagerAbi.find((item: any) => item.name === 'executeDirectMinting');
    const responseType = fExecute.inputs[0].components.find((item: any) => item.name === 'data');
    
    // Decode response_hex into structured data
    const decoded = decodeAbiParameters([responseType], data.response_hex);
    const decodedData = decoded[0];

    return {
      merkleProof: data.proof,
      data: decodedData,
    };
  }
  
  return null;
}
