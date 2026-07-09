export interface FXRPDirectMintConfig {
  xrplSeed?: string;
  xrplUrl: string;
  flarePrivateKey?: string;
  flareRpcUrl: string;
  registryAddress: string;
}

export interface MintSettings {
  assetManagerAddress: string;
  lotSizeUBA: bigint;
  lotSizeXRP: number;
  minterFeeShareBIPS: number;
  executorFeeUBA: bigint;
  executorFeeXRP: number;
  mintingFeeUBA: bigint;
  mintingFeeXRP: number;
  mintingPaused: boolean;
  emergencyPaused: boolean;
}

export interface PaymentParams {
  vaultAddressXRP: string;
  recipientEvmAddress: string;
  lots: number;
  amountXRP: number;
  mintingFeeXRP: number;
  executorFeeXRP: number;
  totalXRP: number;
  memoHex: string;
}

export interface PaymentResult {
  txHash: string;
  blockTimestamp: number;
  spentAmountDrops: string;
  receivedAmountDrops: string;
  receivingAddressXRP: string;
}

export type MintState =
  | 'PaymentBroadcasted'
  | 'PaymentValidated'
  | 'FdcRequested'
  | 'FdcProofReady'
  | 'SubmittingFinalization'
  | 'Delayed'
  | 'Complete'
  | 'Failed';

export interface MintStatus {
  state: MintState;
  message: string;
  txHash?: string; // final EVM transaction hash (if complete)
  allowedAt?: Date; // if delayed, when execution is allowed
  error?: string;
}

export type StatusCallback = (status: MintStatus) => void;
