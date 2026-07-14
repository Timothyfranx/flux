import {
  createPublicClient,
  createWalletClient,
  http,
  Hash,
  PublicClient,
  WalletClient,
  Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { coston2 } from '@flarenetwork/flare-wagmi-periphery-package';

export interface MultiSDKConfig {
  flareRpcUrl: string;
  flarePrivateKey?: string;
  registryAddress?: string;
  verifierUrl?: string;
  daLayerUrl?: string;
  // Manual address overrides for testing before contracts are registered in the registry
  assetManagerOverrides?: {
    XRP?: string;
    BTC?: string;
    DOGE?: string;
  };
}

export interface FAssetSettings {
  lotSize: bigint;
  minterFeeShareBIPS: number;
  minimumFee: bigint;
  executorFee: bigint;
  paused: boolean;
}

export interface PaymentParams {
  gatewayAddress: string;
  recipientEvmAddress: string;
  lots: number;
  amountUnderlying: number;
  mintingFeeUnderlying: number;
  executorFeeUnderlying: number;
  totalRequiredUnderlying: number;
  memoPayload: string; // memoHex for XRP, OP_RETURN payload for UTXO
}

export interface PaymentResult {
  txHash: string;
  blockTimestamp: number;
  utxoIndex?: number; // Needed for BTC/DOGE
  inUtxoIndex?: number; // Needed for BTC/DOGE
}

export interface StatusUpdate {
  state: 'PaymentBroadcasted' | 'PaymentValidated' | 'FdcRequested' | 'FdcProofReady' | 'SubmittingFinalization' | 'Delayed' | 'Complete' | 'Failed';
  message: string;
  allowedAt?: Date;
  txHash?: string;
  error?: any;
}

export type StatusCallback = (status: StatusUpdate) => void;

/**
 * Multi-Chain FAsset Direct Minting and Onboarding SDK
 * Supports FBTC (Bitcoin), FDOGE (Dogecoin), and FXRP (Ripple) direct minting flows on Flare Coston2.
 */
export class FAssetMultiSDK {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private evmAccountAddress?: Address;
  private registryAddress: string;
  private verifierUrl: string;
  private daLayerUrl: string;
  private assetManagerOverrides: Record<string, string> = {};

  constructor(config: MultiSDKConfig) {
    this.publicClient = createPublicClient({
      transport: http(config.flareRpcUrl),
    });

    if (config.flarePrivateKey) {
      const account = privateKeyToAccount(config.flarePrivateKey as `0x${string}`);
      this.evmAccountAddress = account.address;
      this.walletClient = createWalletClient({
        account,
        transport: http(config.flareRpcUrl),
      });
    }

    this.registryAddress = config.registryAddress || '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
    this.verifierUrl = config.verifierUrl || 'https://coston2-api.flare.network/verifier';
    this.daLayerUrl = config.daLayerUrl || 'https://coston2-api.flare.network/da';

    // Set overrides from config
    if (config.assetManagerOverrides) {
      if (config.assetManagerOverrides.XRP) this.assetManagerOverrides.XRP = config.assetManagerOverrides.XRP;
      if (config.assetManagerOverrides.BTC) this.assetManagerOverrides.BTC = config.assetManagerOverrides.BTC;
      if (config.assetManagerOverrides.DOGE) this.assetManagerOverrides.DOGE = config.assetManagerOverrides.DOGE;
    }
  }

  /**
   * Dynamically registers the Wallet Client and account at runtime.
   */
  public setWalletClient(walletClient: any, evmAccountAddress?: string) {
    this.walletClient = walletClient;
    if (evmAccountAddress) {
      this.evmAccountAddress = evmAccountAddress as Address;
    }
  }

  /**
   * Resolves the AssetManager address dynamically.
   * Priority: 
   * 1. Manual config override
   * 2. Process environment variable (COSTON2_ASSET_MANAGER_FBTC/FDOGE/FXRP)
   * 3. FlareContractRegistry lookup
   */
  public async getAssetManagerAddress(asset: 'XRP' | 'BTC' | 'DOGE'): Promise<string> {
    // 1. Check config overrides
    if (this.assetManagerOverrides[asset]) {
      return this.assetManagerOverrides[asset];
    }

    // 2. Check process environment variables (useful for test suites)
    const envKey = `COSTON2_ASSET_MANAGER_F${asset}`;
    const envAddress = typeof process !== 'undefined' ? process.env[envKey] : undefined;
    if (envAddress && envAddress.startsWith('0x') && envAddress.length === 42) {
      return envAddress;
    }

    // 3. Fall back to Flare Contract Registry
    const assetManagerName = `AssetManagerF${asset}`;
    try {
      const address = (await this.publicClient.readContract({
        address: this.registryAddress as `0x${string}`,
        abi: coston2.iFlareContractRegistryAbi,
        functionName: 'getContractAddressByName',
        args: [assetManagerName],
      })) as string;

      if (address === '0x0000000000000000000000000000000000000000') {
        throw new Error(`AssetManager for F${asset} is not registered in the Flare Contract Registry.`);
      }
      return address;
    } catch (err: any) {
      throw new Error(`Failed to resolve AssetManager for F${asset}: ${err.message}`);
    }
  }

  /**
   * Fetches settings and rules from the specific AssetManager contract.
   */
  public async getSettings(asset: 'XRP' | 'BTC' | 'DOGE'): Promise<FAssetSettings> {
    const assetManagerAddress = await this.getAssetManagerAddress(asset);
    
    const settings = (await this.publicClient.readContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'getSettings',
    })) as any;

    return {
      lotSize: settings.lotSizeAMG || settings.lotSizeUBA || 10000000n,
      minterFeeShareBIPS: Number(settings.minterFeeShareBIPS || 10),
      minimumFee: settings.minimumFeeUBA || 100000n,
      executorFee: settings.executorFeeXRP || settings.executorFeeUBA || 100000n,
      paused: settings.mintingPaused || settings.emergencyPaused || false,
    };
  }

  /**
   * Prepares the payment target address, required amounts (lots + fees), and the recipient memo.
   */
  public async preparePayment(
    asset: 'XRP' | 'BTC' | 'DOGE',
    params: { recipientEvmAddress: string; lots: number }
  ): Promise<PaymentParams> {
    const assetManagerAddress = await this.getAssetManagerAddress(asset);
    const settings = await this.getSettings(asset);

    if (settings.paused) {
      throw new Error(`Direct minting for F${asset} is currently paused.`);
    }

    // Query direct minting destination address
    const gatewayAddress = (await this.publicClient.readContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'directMintingPaymentAddress',
    })) as string;

    const decimalsMultiplier = asset === 'BTC' ? 100000000 : 1000000;
    const lotSizeVal = Number(settings.lotSize) / decimalsMultiplier;
    
    const amountUnderlying = params.lots * lotSizeVal;
    const percentageFee = (amountUnderlying * settings.minterFeeShareBIPS) / 10000;
    const minimumFee = Number(settings.minimumFee) / decimalsMultiplier;
    const calculatedFee = Math.max(percentageFee, minimumFee);

    const executorFee = Number(settings.executorFee) / decimalsMultiplier;
    const totalRequired = amountUnderlying + calculatedFee + executorFee;

    // Encode Direct Minting Binary Memo (Prefix + zero padding + EVM recipient address)
    const prefix = '4642505266410018'; // DIRECT_MINTING operation prefix
    const padding = '00000000';
    const cleanAddress = params.recipientEvmAddress.replace(/^0x/i, '').toLowerCase();
    const memoPayload = `${prefix}${padding}${cleanAddress}`.toUpperCase();

    return {
      gatewayAddress,
      recipientEvmAddress: params.recipientEvmAddress,
      lots: params.lots,
      amountUnderlying,
      mintingFeeUnderlying: calculatedFee,
      executorFeeUnderlying: executorFee,
      totalRequiredUnderlying: totalRequired,
      memoPayload,
    };
  }

  /**
   * Submits FDC attestation requests dynamically per chain.
   * XRP uses XRPPayment (0x08), BTC/DOGE use Payment (0x02).
   */
  public async requestFdcAttestation(
    asset: 'XRP' | 'BTC' | 'DOGE',
    paymentResult: PaymentResult
  ): Promise<{ votingRoundId: number; requestBytes: string }> {
    const fdcHubAddress = await this.getContractAddressByName('FdcHub');
    
    let prepareUrl = '';
    let requestBody: any = {};

    if (asset === 'XRP') {
      prepareUrl = `${this.verifierUrl}/xrp/XRPPayment/prepareRequest`;
      requestBody = {
        attestationType: '0x0000000000000008',
        sourceId: 'testXRP',
        requestBody: {
          transactionId: paymentResult.txHash.startsWith('0x') ? paymentResult.txHash : `0x${paymentResult.txHash}`,
          proofOwner: this.evmAccountAddress || '0x0000000000000000000000000000000000000000',
        },
      };
    } else {
      // BTC / DOGE UTXO chains use generic Payment type (0x02)
      const sourceId = asset === 'BTC' ? 'testBTC' : 'testDOGE';
      prepareUrl = `${this.verifierUrl}/${asset.toLowerCase()}/Payment/prepareRequest`;
      requestBody = {
        attestationType: '0x0000000000000002',
        sourceId,
        requestBody: {
          transactionId: paymentResult.txHash.startsWith('0x') ? paymentResult.txHash : `0x${paymentResult.txHash}`,
          inUtxo: (paymentResult.inUtxoIndex ?? 0).toString(),
          utxo: (paymentResult.utxoIndex ?? 0).toString(),
        },
      };
    }

    // Call prepare request
    const response = await fetch(prepareUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Verifier preparation API failed: ${response.statusText}`);
    }

    const prepareResult = await response.json();
    const requestBytes = prepareResult.abiEncodedRequest;

    if (!this.walletClient || !this.evmAccountAddress) {
      throw new Error('EVM Private Key / Signer is required to submit FDC requests.');
    }

    // Write to FdcHub on-chain
    const requestTx = await this.walletClient.writeContract({
      address: fdcHubAddress as `0x${string}`,
      abi: coston2.iFdcHubAbi,
      functionName: 'requestAttestation',
      args: [requestBytes],
      value: 100000000000000000n, // Attestation request fee (0.1 C2FLR)
      account: this.evmAccountAddress,
      chain: undefined,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: requestTx });
    
    // Calculate voting round based on block timestamp
    const flareSystemsManagerAddress = await this.getContractAddressByName('FlareSystemsManager');
    const startTs = (await this.publicClient.readContract({
      address: flareSystemsManagerAddress as `0x${string}`,
      abi: [{
        type: 'function',
        name: 'firstVotingRoundStartTs',
        inputs: [],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      }],
      functionName: 'firstVotingRoundStartTs',
    })) as bigint;

    const roundDuration = 90n; // 90 seconds per voting round
    const block = await this.publicClient.getBlock({ blockHash: receipt.blockHash });
    const votingRoundId = Number((block.timestamp - startTs) / roundDuration);

    return {
      votingRoundId,
      requestBytes,
    };
  }

  /**
   * Executes the direct minting on-chain using the FDC Merkle proof.
   */
  public async executeMint(asset: 'XRP' | 'BTC' | 'DOGE', proof: any): Promise<Hash> {
    const assetManagerAddress = await this.getAssetManagerAddress(asset);

    if (!this.walletClient || !this.evmAccountAddress) {
      throw new Error('Wallet client and EVM key must be configured.');
    }

    return await this.walletClient.writeContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'executeDirectMinting',
      args: [proof],
      account: this.evmAccountAddress,
    });
  }

  /**
   * Monitor workflow from broadcast through FDC proof wait to execute.
   */
  public async monitorStatus(
    asset: 'XRP' | 'BTC' | 'DOGE',
    paymentResult: PaymentResult,
    callback: StatusCallback
  ): Promise<void> {
    try {
      callback({
        state: 'PaymentBroadcasted',
        message: `${asset} transaction detected. Preparing FDC verification...`,
      });

      const { votingRoundId, requestBytes } = await this.requestFdcAttestation(asset, paymentResult);

      callback({
        state: 'FdcRequested',
        message: `FDC attestation submitted in round ${votingRoundId}. Voting takes ~90-180s...`,
      });

      // Poll DA layer for Merkle proof
      let proof: any = null;
      const daUrl = `${this.daLayerUrl}/api/v1/fdc/proof-by-request-round-raw`;
      
      while (!proof) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
        try {
          const res = await fetch(daUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ votingRoundId, requestBytes }),
          });
          if (res.ok) {
            const rawResult = await res.json();
            if (rawResult && rawResult.proof) {
              proof = rawResult;
              break;
            }
          }
        } catch {}
      }

      callback({
        state: 'FdcProofReady',
        message: `Cryptographic Merkle proof retrieved. Finalizing on-chain...`,
      });

      let execHash: Hash;
      try {
        execHash = await this.executeMint(asset, proof);
      } catch (error: any) {
        const errorData = error.data || (error.cause && error.cause.data) || '';
        // Intercept FAssets v1.3 delay error (0x40d8d67b)
        if (typeof errorData === 'string' && errorData.includes('0x40d8d67b')) {
          callback({
            state: 'Delayed',
            message: `FAssets Direct Minting delay active (1-hour safety hold).`,
            allowedAt: new Date(Date.now() + 3600 * 1000), // Estimate 1 hour
          });
          return;
        }
        throw error;
      }

      callback({
        state: 'SubmittingFinalization',
        message: `Finalization transaction sent: ${execHash}. Waiting for block confirmation...`,
      });

      await this.publicClient.waitForTransactionReceipt({ hash: execHash });

      callback({
        state: 'Complete',
        message: `Direct onboarding successful! FAssets credited to EVM account.`,
        txHash: execHash,
      });

    } catch (err: any) {
      callback({
        state: 'Failed',
        message: `Onboarding execution encountered an error.`,
        error: err.message || err,
      });
    }
  }

  private async getContractAddressByName(name: string): Promise<string> {
    return (await this.publicClient.readContract({
      address: this.registryAddress as `0x${string}`,
      abi: coston2.iFlareContractRegistryAbi,
      functionName: 'getContractAddressByName',
      args: [name],
    })) as string;
  }
}
