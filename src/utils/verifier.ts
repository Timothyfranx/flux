import { toHex, pad } from 'viem';

/**
 * Converts a string or hex value into a 32-byte hex string, right-padded with zeroes.
 */
export function toBytes32Padded(val: string): string {
  if (val.startsWith('0x')) {
    return pad(val as `0x${string}`, { size: 32, dir: 'right' });
  }
  const hex = toHex(val);
  return pad(hex, { size: 32, dir: 'right' });
}

export interface PrepareRequestParams {
  transactionId: string;
  receivingAddress: string;
}

/**
 * Calls the verifier API to prepare the FDC request bytes.
 */
export async function prepareFdcRequestBytes(params: PrepareRequestParams): Promise<string> {
  const attestationType = toBytes32Padded('XRPPayment');
  const sourceId = toBytes32Padded('testXRP');

  // Correct layout for Coston2 testnet verifier:
  const requestBody = {
    attestationType,
    sourceId,
    requestBody: {
      transactionId: params.transactionId,
      proofOwner: '0x0000000000000000000000000000000000000000',
    },
  };

  const url = 'https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': '00000000-0000-0000-0000-000000000000',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Verifier preparation API error (${response.status}): ${errText}`);
  }

  const resJson = (await response.json()) as { abiEncodedRequest: string };
  return resJson.abiEncodedRequest;
}

import { keccak256, stringToBytes } from 'viem';

export function receivingAddressToHash(address: string): string {
  return keccak256(stringToBytes(address));
}
