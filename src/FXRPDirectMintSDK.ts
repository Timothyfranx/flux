import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Address,
  Hash,
} from 'viem';
import { flareTestnet } from 'viem/chains';
const { privateKeyToAccount } = require('viem/accounts');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');

import {
  FXRPDirectMintConfig,
  MintSettings,
  PaymentParams,
  PaymentResult,
  StatusCallback,
} from './types';
import { encodeDirectMintingMemo } from './utils/memo';
import { prepareFdcRequestBytes } from './utils/verifier';
import { calculateVotingRoundId, fetchFdcProof, FdcProof } from './utils/proof';
import { waitForDirectMintingOutcome, getDirectMintingDelayState } from './utils/waiting';

export class FXRPDirectMintSDK {
  private config: FXRPDirectMintConfig;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private evmAccountAddress?: Address;
  private evmAccount?: any;

  // Cached resolved contract addresses
  private assetManagerAddress?: Address;
  private systemsManagerAddress?: Address;
  private fdcHubAddress?: Address;
  private fdcRequestFeeConfigurationsAddress?: Address;

  constructor(config: FXRPDirectMintConfig) {
    this.config = config;

    this.publicClient = createPublicClient({
      transport: http(config.flareRpcUrl),
    });

    if (config.walletClient) {
      this.walletClient = config.walletClient;
    } else if (config.flarePrivateKey) {
      const account = privateKeyToAccount(config.flarePrivateKey);
      this.evmAccount = account;
      this.evmAccountAddress = account.address;
      this.walletClient = createWalletClient({
        account,
        chain: flareTestnet,
        transport: http(config.flareRpcUrl),
      });
    }
  }

  /**
   * Sets or updates the walletClient dynamically (e.g. when connecting in a browser).
   */
  public setWalletClient(walletClient: any, evmAccountAddress?: string) {
    this.walletClient = walletClient;
    if (evmAccountAddress) {
      this.evmAccountAddress = evmAccountAddress as Address;
    }
  }

  /**
   * Resolves onchain contract addresses using the registry.
   */
  private async resolveContractAddresses(): Promise<void> {
    if (this.assetManagerAddress && this.fdcHubAddress && this.systemsManagerAddress) {
      return;
    }

    const registryAddress = this.config.registryAddress as Address;

    this.assetManagerAddress = (await this.publicClient.readContract({
      address: registryAddress,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['AssetManagerFXRP'],
    })) as Address;

    this.systemsManagerAddress = (await this.publicClient.readContract({
      address: registryAddress,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['FlareSystemsManager'],
    })) as Address;

    this.fdcHubAddress = (await this.publicClient.readContract({
      address: registryAddress,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: ['FdcHub'],
    })) as Address;

    this.fdcRequestFeeConfigurationsAddress = (await this.publicClient.readContract({
      address: this.fdcHubAddress,
      abi: coston2.iFdcHubAbi,
      functionName: 'fdcRequestFeeConfigurations',
    })) as Address;
  }

  /**
   * Retrieves current direct minting settings from the AssetManager contract.
   */
  public async getSettings(): Promise<MintSettings> {
    await this.resolveContractAddresses();
    const assetManager = this.assetManagerAddress!;

    const lotSizeUBA = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'lotSize',
    })) as bigint;

    const feeBips = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingFeeBIPS',
    })) as bigint;

    const executorFeeUBA = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingExecutorFeeUBA',
    })) as bigint;

    const minimumFeeUBA = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getDirectMintingMinimumFeeUBA',
    })) as bigint;

    const mintingPaused = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'mintingPaused',
    })) as boolean;

    const emergencyPaused = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'emergencyPaused',
    })) as boolean;

    return {
      assetManagerAddress: assetManager,
      lotSizeUBA,
      lotSizeXRP: Number(lotSizeUBA) / 1e6,
      minterFeeShareBIPS: Number(feeBips),
      executorFeeUBA,
      executorFeeXRP: Number(executorFeeUBA) / 1e6,
      minimumFeeUBA,
      minimumFeeXRP: Number(minimumFeeUBA) / 1e6,
      mintingPaused,
      emergencyPaused,
    };
  }

  /**
   * Prepares the parameters and memo payload for the XRPL payment.
   */
  public async preparePayment(params: { recipientEvmAddress: string; lots: number }): Promise<PaymentParams> {
    await this.resolveContractAddresses();
    const assetManager = this.assetManagerAddress!;

    const settings = await this.getSettings();
    if (settings.mintingPaused || settings.emergencyPaused) {
      throw new Error('Direct minting is currently paused on-chain.');
    }

    const vaultAddressXRP = (await this.publicClient.readContract({
      address: assetManager,
      abi: coston2.iAssetManagerAbi,
      functionName: 'directMintingPaymentAddress',
    })) as string;

    const amountXRP = params.lots * settings.lotSizeXRP;
    const feeBips = settings.minterFeeShareBIPS;
    const minimumFeeXRP = settings.minimumFeeXRP;

    // Calculate percentage fee based on bips
    const percentageFeeXRP = (amountXRP * feeBips) / 10000;
    const calculatedFeeXRP = Math.max(percentageFeeXRP, minimumFeeXRP);

    const executorFeeXRP = settings.executorFeeXRP;
    const totalXRP = amountXRP + calculatedFeeXRP + executorFeeXRP;

    const memoHex = encodeDirectMintingMemo(params.recipientEvmAddress);

    return {
      vaultAddressXRP,
      recipientEvmAddress: params.recipientEvmAddress,
      lots: params.lots,
      amountXRP,
      mintingFeeXRP: calculatedFeeXRP,
      executorFeeXRP,
      totalXRP,
      memoHex,
    };
  }

  /**
   * Prepares and submits the attestation request to FdcHub.
   */
  public async requestFdcAttestation(
    paymentResult: PaymentResult
  ): Promise<{ votingRoundId: number; requestBytes: string }> {
    await this.resolveContractAddresses();
    const accountParam = this.evmAccount || this.evmAccountAddress;
    if (!this.walletClient || !accountParam) {
      throw new Error('Wallet client or EVM account address not configured.');
    }

    const txHash = paymentResult.txHash.startsWith('0x') ? paymentResult.txHash : `0x${paymentResult.txHash}`;

    // 1. Fetch bytes32 prepared request
    const requestBytes = (await prepareFdcRequestBytes({
      transactionId: txHash,
      receivingAddress: paymentResult.receivingAddressXRP,
    })) as `0x${string}`;

    // 2. Query fee
    const requestFee = (await this.publicClient.readContract({
      address: this.fdcRequestFeeConfigurationsAddress!,
      abi: [
        {
          type: 'function',
          name: 'getRequestFee',
          inputs: [{ name: '_attestationRequest', type: 'bytes' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'getRequestFee',
      args: [requestBytes],
    })) as bigint;

    // 3. Write request to FdcHub
    const requestTxHash = await this.walletClient.writeContract({
      address: this.fdcHubAddress!,
      abi: coston2.iFdcHubAbi,
      functionName: 'requestAttestation',
      args: [requestBytes],
      value: requestFee,
      account: accountParam,
      chain: flareTestnet,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: requestTxHash });
    const block = await this.publicClient.getBlock({ blockNumber: receipt.blockNumber });

    // 4. Calculate round ID from submission block timestamp
    const votingRoundId = await calculateVotingRoundId(
      this.publicClient,
      this.systemsManagerAddress!,
      Number(block.timestamp)
    );

    return {
      votingRoundId,
      requestBytes,
    };
  }

  /**
   * Finalizes the direct mint on-chain by calling executeDirectMinting.
   */
  public async executeMint(proof: FdcProof): Promise<Hash> {
    await this.resolveContractAddresses();
    const accountParam = this.evmAccount || this.evmAccountAddress;
    if (!this.walletClient || !accountParam) {
      throw new Error('Wallet client or EVM account address not configured.');
    }

    // Call executeDirectMinting with the proof arguments
    const hash = await this.walletClient.writeContract({
      address: this.assetManagerAddress!,
      abi: coston2.iAssetManagerAbi,
      functionName: 'executeDirectMinting',
      args: [proof],
      account: accountParam,
      chain: flareTestnet,
    });

    return hash;
  }

  /**
   * Monitors the status of a payment transaction from validation to finalization on Coston2.
   */
  public async monitorStatus(
    paymentResult: PaymentResult,
    callback: StatusCallback,
    pollingIntervalMs = 15000
  ): Promise<void> {
    try {
      callback({
        state: 'PaymentBroadcasted',
        message: `XRPL Payment detected. Monitoring ledger validation...`,
      });

      // 1. Wait for FDC eligibility / attestation submission
      callback({
        state: 'PaymentValidated',
        message: `XRPL Payment validated at block close time ${new Date(
          paymentResult.blockTimestamp * 1000
        ).toISOString()}. Preparing FDC Request...`,
      });

      const { votingRoundId, requestBytes } = await this.requestFdcAttestation(paymentResult);

      callback({
        state: 'FdcRequested',
        message: `FDC attestation request submitted for voting round ${votingRoundId}. Finalizing round (takes ~90-180s)...`,
      });

      // 2. Poll DA Layer until proof is generated
      let proof: FdcProof | null = null;
      while (!proof) {
        proof = await fetchFdcProof(votingRoundId, requestBytes);
        if (!proof) {
          await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
        }
      }

      callback({
        state: 'FdcProofReady',
        message: `Cryptographic FDC proof verified and retrieved. Submitting finalization to AssetManager...`,
      });

      // 3. Submit execution transaction (we run the finalization)
      let execHash: Hash;
      try {
        execHash = await this.executeMint(proof);
      } catch (error: any) {
        // Decode custom revert error signatures
        const errorData =
          error.data ||
          (error.cause && error.cause.data) ||
          error.signature ||
          (error.cause && error.cause.signature) ||
          error.raw ||
          (error.cause && error.cause.raw);

        // Selector 0x40d8d67b: DirectMintingStillDelayed(uint256 executionAllowedAt)
        const isDelayed =
          typeof errorData === 'string' &&
          (errorData.startsWith('0x40d8d67b') || errorData.includes('0x40d8d67b'));

        // Selector 0x18dce79f: PaymentAlreadyConfirmed()
        const isAlreadyConfirmed =
          typeof errorData === 'string' &&
          (errorData.startsWith('0x18dce79f') || errorData.includes('0x18dce79f'));

        if (isDelayed) {
          const delayState = await getDirectMintingDelayState(
            this.publicClient,
            this.assetManagerAddress!,
            paymentResult.txHash.startsWith('0x')
              ? (paymentResult.txHash as Hash)
              : `0x${paymentResult.txHash}`
          );

          callback({
            state: 'Delayed',
            message: `Minting rate-limits hit. The transaction is delayed by the protocol for safety.`,
            allowedAt: new Date(Number(delayState.allowedAt) * 1000),
          });
          return;
        }

        if (isAlreadyConfirmed) {
          callback({
            state: 'Complete',
            message: `Direct minting has already been finalized and executed.`,
            txHash: paymentResult.txHash,
          });
          return;
        }

        throw error;
      }

      callback({
        state: 'SubmittingFinalization',
        message: `Finalization transaction submitted: ${execHash}. Waiting for final confirmation...`,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: execHash });
      if (receipt.status !== 'success') {
        throw new Error(`Flare execution transaction execution failed on-chain.`);
      }

      callback({
        state: 'Complete',
        message: `Direct minting finalized successfully!`,
        txHash: execHash,
      });

    } catch (error: any) {
      callback({
        state: 'Failed',
        message: `Direct minting process encountered an error: ${error.message || error}`,
        error: error.stack || String(error),
      });
    }
  }
}
