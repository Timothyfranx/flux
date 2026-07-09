import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Address,
  Hash,
  keccak256,
  stringToBytes,
} from 'viem';
import { flareTestnet } from 'viem/chains';
const { privateKeyToAccount } = require('viem/accounts');
const { coston2 } = require('@flarenetwork/flare-wagmi-periphery-package');
import { Client as XrplClient, Wallet as XrplWallet, xrpToDrops } from 'xrpl';

import {
  FXRPDirectMintConfig,
  MintSettings,
  PaymentParams,
  PaymentResult,
  MintStatus,
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

    if (config.flarePrivateKey) {
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
   * Queries and returns the current FXRP direct minting settings from the contract.
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
      mintingFeeUBA: minimumFeeUBA, // temporary mapping
      mintingFeeXRP: Number(minimumFeeUBA) / 1e6,
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
    const minimumFeeXRP = settings.mintingFeeXRP;

    // Calculate percentage fee based on bips
    const percentageFeeXRP = (amountXRP * feeBips) / 10000;
    const mintingFeeXRP = Math.max(percentageFeeXRP, minimumFeeXRP);

    const executorFeeXRP = settings.executorFeeXRP;
    const totalXRP = amountXRP + mintingFeeXRP + executorFeeXRP;

    const memoHex = encodeDirectMintingMemo(params.recipientEvmAddress);

    return {
      vaultAddressXRP,
      recipientEvmAddress: params.recipientEvmAddress,
      lots: params.lots,
      amountXRP,
      mintingFeeXRP,
      executorFeeXRP,
      totalXRP,
      memoHex,
    };
  }

  /**
   * Connects to XRPL and executes the payment transaction.
   * Blocks until transaction has at least 3 validations.
   */
  public async executePayment(params: PaymentParams): Promise<PaymentResult> {
    if (!this.config.xrplSeed) {
      throw new Error('XRPL Seed not configured in SDK.');
    }

    const wallet = XrplWallet.fromSeed(this.config.xrplSeed);
    const client = new XrplClient(this.config.xrplUrl);

    await client.connect();

    try {
      const drops = xrpToDrops(params.totalXRP);
      const tx = {
        TransactionType: 'Payment' as const,
        Account: wallet.address,
        Amount: drops,
        Destination: params.vaultAddressXRP,
        Memos: [
          {
            Memo: {
              MemoType: Buffer.from('FAssets', 'ascii').toString('hex').toUpperCase(),
              MemoFormat: Buffer.from('application/octet-stream', 'ascii').toString('hex').toUpperCase(),
              MemoData: params.memoHex,
            },
          },
        ],
      };

      const prepared = await client.autofill(tx);
      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);

      // Verify the transaction was successful on XRPL
      const meta = result.result.meta as any;
      if (typeof meta !== 'object' || meta?.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`XRPL payment failed: ${meta?.TransactionResult}`);
      }

      // Convert XRPL block close time to unix timestamp
      const ledgerIndex = result.result.ledger_index;
      const ledger = await client.request({
        command: 'ledger',
        ledger_index: ledgerIndex,
      });
      const closeTime = ledger.result.ledger.close_time;
      const blockTimestamp = closeTime + 946684800; // Ripple Epoch to Unix Epoch

      // Parse metadata for actual spent amounts
      let spentDrops = drops;
      let receivedDrops = drops;
      if (typeof meta === 'object' && meta.delivered_amount) {
        receivedDrops = typeof meta.delivered_amount === 'string' ? meta.delivered_amount : drops;
      }

      return {
        txHash: signed.hash,
        blockTimestamp,
        spentAmountDrops: spentDrops,
        receivedAmountDrops: receivedDrops,
        receivingAddressXRP: params.vaultAddressXRP,
      };

    } finally {
      await client.disconnect();
    }
  }

  /**
   * Prepares and submits the attestation request to FdcHub.
   */
  public async requestFdcAttestation(
    paymentResult: PaymentResult
  ): Promise<{ votingRoundId: number; requestBytes: string }> {
    await this.resolveContractAddresses();
    if (!this.walletClient || !this.evmAccountAddress) {
      throw new Error('EVM Private Key not configured in SDK.');
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
      account: this.evmAccount,
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
    if (!this.walletClient || !this.evmAccount) {
      throw new Error('EVM Private Key not configured in SDK.');
    }

    // Call executeDirectMinting with the proof arguments
    const hash = await this.walletClient.writeContract({
      address: this.assetManagerAddress!,
      abi: coston2.iAssetManagerAbi,
      functionName: 'executeDirectMinting',
      args: [proof],
      account: this.evmAccount,
      chain: flareTestnet,
    });

    return hash;
  }

  /**
   * Orchestrates the direct mint status tracking lifecycle.
   * Tracks the mint from XRPL validation to final minting event on Flare.
   */
  public async monitorStatus(
    paymentResult: PaymentResult,
    callback: StatusCallback,
    pollingIntervalMs = 10000
  ): Promise<void> {
    await this.resolveContractAddresses();

    try {
      callback({
        state: 'PaymentValidated',
        message: `XRPL Payment validated at block close time ${new Date(paymentResult.blockTimestamp * 1000).toISOString()}. Preparing FDC Request...`,
      });

      // 1. Submit attestation request to FdcHub
      const { votingRoundId, requestBytes } = await this.requestFdcAttestation(paymentResult);
      callback({
        state: 'FdcRequested',
        message: `FDC attestation request submitted for voting round ${votingRoundId}. Finalizing round (takes ~90-180s)...`,
      });

      // 2. Poll Data Availability layer for proof
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
        // Decode custom revert error 0x40d8d67b (Limiter Delay)
        const errorData = error.data || (error.cause && error.cause.data) || error.signature || (error.cause && error.cause.signature) || error.raw || (error.cause && error.cause.raw);
        const isDelayed = typeof errorData === 'string' && (errorData.startsWith('0x40d8d67b') || errorData.includes('0x40d8d67b'));
        if (isDelayed) {
          const delayState = await getDirectMintingDelayState(
            this.publicClient,
            this.assetManagerAddress!,
            paymentResult.txHash.startsWith('0x') ? (paymentResult.txHash as Hash) : `0x${paymentResult.txHash}`
          );

          callback({
            state: 'Delayed',
            message: `Minting rate-limits hit. The transaction is delayed by the protocol for safety.`,
            allowedAt: new Date(Number(delayState.allowedAt) * 1000),
          });
          return;
        }

        throw error;
      }

      callback({
        state: 'SubmittingFinalization',
        message: `Finalization transaction submitted: ${execHash}. Waiting for final confirmation...`,
      });

      // 4. Wait for final event outcomes (DirectMintingExecuted or DirectMintingDelayed)
      const txHashBytes32 = (paymentResult.txHash.startsWith('0x')
        ? paymentResult.txHash
        : `0x${paymentResult.txHash}`) as Hash;

      const outcome = await waitForDirectMintingOutcome(
        this.publicClient,
        this.assetManagerAddress!,
        txHashBytes32,
        (allowedAt) => {
          callback({
            state: 'Delayed',
            message: `Minting rate-limits hit. The transaction is delayed by the protocol for safety.`,
            allowedAt: new Date(Number(allowedAt) * 1000),
          });
        },
        pollingIntervalMs
      );

      if (outcome.status === 'EXECUTED') {
        callback({
          state: 'Complete',
          message: `Direct minting complete! Successfully minted ${Number(outcome.mintedAmountUBA!) / 1e6} FXRP.`,
          txHash: outcome.transactionHash,
        });
      }

    } catch (error: any) {
      callback({
        state: 'Failed',
        message: `Direct minting process encountered an error: ${error.message || error}`,
        error: error.stack || error.toString(),
      });
    }
  }
}
