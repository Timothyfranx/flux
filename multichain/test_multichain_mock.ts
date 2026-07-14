import { FAssetMultiSDK, PaymentParams, FAssetSettings, PaymentResult, StatusUpdate } from './FAssetMultiSDK';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

/**
 * Mock subclass of FAssetMultiSDK to simulate contract lookups
 * and on-chain interactions for chains not registered on Coston2.
 */
class MockFAssetMultiSDK extends FAssetMultiSDK {
  private simulateOnChain: boolean = false;

  constructor(config: any) {
    super(config);
  }

  // Override to return mock contract addresses if they fail registry lookups
  public async getAssetManagerAddress(asset: 'XRP' | 'BTC' | 'DOGE'): Promise<string> {
    try {
      if (asset === 'XRP') {
        return await super.getAssetManagerAddress(asset);
      }
      // Mock addresses for BTC and DOGE
      return asset === 'BTC' 
        ? '0x1111111111111111111111111111111111111111' 
        : '0x2222222222222222222222222222222222222222';
    } catch {
      return '0xMockAssetManagerAddress';
    }
  }

  // Override to return mock settings if contract reads are unavailable
  public async getSettings(asset: 'XRP' | 'BTC' | 'DOGE'): Promise<FAssetSettings> {
    try {
      if (asset === 'XRP') {
        return await super.getSettings(asset);
      }
    } catch {}

    // Mock settings for BTC and DOGE
    const decimalsMultiplier = asset === 'BTC' ? 100000000n : 1000000n;
    return {
      lotSize: 2n * decimalsMultiplier, // 2 BTC or 2 DOGE lots
      minterFeeShareBIPS: 50, // 0.5%
      minimumFee: 10000n,
      executorFee: 5000n,
      paused: false,
    };
  }

  // Override to mock the payment address query on-chain
  public async preparePayment(
    asset: 'XRP' | 'BTC' | 'DOGE',
    params: { recipientEvmAddress: string; lots: number }
  ): Promise<PaymentParams> {
    try {
      if (asset === 'XRP') {
        return await super.preparePayment(asset, params);
      }
    } catch {}

    const settings = await this.getSettings(asset);
    const decimalsMultiplier = asset === 'BTC' ? 100000000 : 1000000;
    const lotSizeVal = Number(settings.lotSize) / decimalsMultiplier;
    
    const amountUnderlying = params.lots * lotSizeVal;
    const percentageFee = (amountUnderlying * settings.minterFeeShareBIPS) / 10000;
    const minimumFee = Number(settings.minimumFee) / decimalsMultiplier;
    const calculatedFee = Math.max(percentageFee, minimumFee);

    const executorFee = Number(settings.executorFee) / decimalsMultiplier;
    const totalRequired = amountUnderlying + calculatedFee + executorFee;

    const gatewayAddress = asset === 'BTC' 
      ? 'tb1q96gq8utxomockedgatewaysatbtc' 
      : 'ndoge55gq8utxomockedgatewaysatdoge';

    const prefix = '4642505266410018';
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

  // Override to simulate FdcHub request submission without paying real gas
  public async requestFdcAttestation(
    asset: 'XRP' | 'BTC' | 'DOGE',
    paymentResult: PaymentResult
  ): Promise<{ votingRoundId: number; requestBytes: string }> {
    try {
      if (asset === 'XRP' && this.simulateOnChain) {
        return await super.requestFdcAttestation(asset, paymentResult);
      }
    } catch {}

    // Simulated FDC Round Attestation
    const mockRoundId = 1394800 + Math.floor(Math.random() * 100);
    const mockRequestBytes = '0xMockFdcRequestBytes' + asset + paymentResult.txHash.substring(0, 10);
    
    return {
      votingRoundId: mockRoundId,
      requestBytes: mockRequestBytes,
    };
  }

  // Override to mock direct mint execution on Flare
  public async executeMint(asset: 'XRP' | 'BTC' | 'DOGE', proof: any): Promise<Hash> {
    try {
      if (asset === 'XRP' && this.simulateOnChain) {
        return await super.executeMint(asset, proof);
      }
    } catch {}

    return '0xMockFlareTransactionHashForExecution' + asset;
  }

  // Override to simulate the complete status monitoring workflow locally
  public async monitorStatus(
    asset: 'XRP' | 'BTC' | 'DOGE',
    paymentResult: PaymentResult,
    callback: StatusCallback
  ): Promise<void> {
    try {
      if (asset === 'XRP' && this.simulateOnChain) {
        return await super.monitorStatus(asset, paymentResult, callback);
      }
    } catch {}

    callback({
      state: 'PaymentBroadcasted',
      message: `${asset} payment broadcasted. Monitoring validation...`,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const mockRoundId = 1394800 + Math.floor(Math.random() * 100);
    callback({
      state: 'FdcRequested',
      message: `FDC attestation request submitted for voting round ${mockRoundId}. Finalizing...`,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    callback({
      state: 'FdcProofReady',
      message: `FDC proof ready and verified. Submitting Flare finalization...`,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    callback({
      state: 'SubmittingFinalization',
      message: `Finalization transaction submitted. Waiting for confirmation...`,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    callback({
      state: 'Complete',
      message: `Direct minting finalized successfully! ${asset} FAsset credited.`,
      txHash: '0xMockFlareTransactionHashForExecution' + asset,
    });
  }
}

async function runMockSimulation() {
  console.log('=== FAsset Multi-Chain Onboarding Simulation (All Chains) ===');

  const mockPrivateKey = '0x1ae61682a199f710315589b41cb7028c25b4594e22fc4d106bcb24d3f770216c';
  const sdk = new MockFAssetMultiSDK({
    flareRpcUrl: FLARE_RPC_URL,
    flarePrivateKey: mockPrivateKey,
  });

  const testRecipient = '0x7bEa8C45F0cE61DF69914f5b04fa62a3D6f1E53c';
  const testLots = 3;

  const assets: Array<'XRP' | 'BTC' | 'DOGE'> = ['XRP', 'BTC', 'DOGE'];

  for (const asset of assets) {
    console.log(`\n==============================================`);
    console.log(`🚀 SIMULATING FLOW FOR ASSET: F${asset}`);
    console.log(`==============================================`);

    // 1. Prepare Payment parameters
    console.log(`[Phase 1] Preparing payment rules and memo parameters...`);
    const params = await sdk.preparePayment(asset, {
      recipientEvmAddress: testRecipient,
      lots: testLots,
    });
    console.log(`- Gateway Address: ${params.gatewayAddress}`);
    console.log(`- Amount required: ${params.amountUnderlying} ${asset}`);
    console.log(`- Minter Fee: ${params.mintingFeeUnderlying} ${asset}`);
    console.log(`- Executor Fee: ${params.executorFeeUnderlying} ${asset}`);
    console.log(`- Total required: ${params.totalRequiredUnderlying} ${asset}`);
    console.log(`- Encoded Binary Memo: ${params.memoPayload}`);

    // 2. Mock payment broadcast result
    const mockTxHash = asset === 'XRP' 
      ? '77F39358001A063079BEE561CAF1E3EAE2F88AE32123DCB621CB340CC9063559' 
      : `0xMockedTxHashOnChain${asset}99e9e984f4bfdcda8f34`;

    const paymentResult: PaymentResult = {
      txHash: mockTxHash,
      blockTimestamp: Math.floor(Date.now() / 1000) - 200,
      utxoIndex: 0,
      inUtxoIndex: 0,
    };

    // 3. Monitor Status Workflow
    console.log(`\n[Phase 2] Monitoring FDC attestation and finalization...`);
    await sdk.monitorStatus(asset, paymentResult, (status: StatusUpdate) => {
      console.log(`   [Status Change] -> State: ${status.state}`);
      console.log(`                   -> Message: ${status.message}`);
      if (status.allowedAt) {
        console.log(`                   -> Locked Until: ${status.allowedAt.toISOString()}`);
      }
      if (status.txHash) {
        console.log(`                   -> Flare Tx Hash: ${status.txHash}`);
      }
      if (status.error) {
        console.log(`                   -> Error: ${status.error}`);
      }
    });
  }

  console.log(`\n==============================================`);
  console.log('✅ MULTI-CHAIN SIMULATION SUCCESSFULLY COMPLETED');
  console.log(`==============================================`);
}

runMockSimulation().catch(console.error);
