"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const payment_signer_1 = require("../src/utils/payment_signer");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.join(__dirname, '../.env') });
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';
const coston2 = require('@flarenetwork/flare-wagmi-periphery-package').coston2;
const erc20Abi = [
    {
        type: 'function',
        name: 'allowance',
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approve',
        inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
        outputs: [{ type: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
    }
];
async function main() {
    console.log('--- Starting FAssets Redemption & Simulated Agent Payout Test ---');
    const flarePk = process.env.COSTON2_PRIVATE_KEY;
    const xrplSeed = process.env.XRPL_SEED;
    const xrpRecipient = 'rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p'; // testnet wallet
    if (!flarePk || !xrplSeed) {
        console.error('Error: COSTON2_PRIVATE_KEY or XRPL_SEED is missing in .env');
        return;
    }
    const account = (0, accounts_1.privateKeyToAccount)(flarePk);
    console.log(`EVM Account: ${account.address}`);
    const publicClient = (0, viem_1.createPublicClient)({ transport: (0, viem_1.http)(FLARE_RPC_URL) });
    const walletClient = (0, viem_1.createWalletClient)({
        account,
        chain: chains_1.flareTestnet,
        transport: (0, viem_1.http)(FLARE_RPC_URL),
    });
    // Resolve AssetManager and fAsset addresses
    const registry = REGISTRY_ADDRESS;
    console.log('Resolving AssetManager address...');
    const assetManagerAddress = await publicClient.readContract({
        address: registry,
        abi: coston2.iFlareContractRegistryAbi,
        functionName: 'getContractAddressByName',
        args: ['AssetManagerFXRP'],
    });
    console.log(`AssetManager address: ${assetManagerAddress}`);
    const fAssetAddress = await publicClient.readContract({
        address: assetManagerAddress,
        abi: coston2.iAssetManagerAbi,
        functionName: 'fAsset',
    });
    console.log(`fAsset address: ${fAssetAddress}`);
    // Check FXRP balance
    const balance = await publicClient.readContract({
        address: fAssetAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address],
    });
    console.log(`Current FXRP Balance: ${Number(balance) / 1e6} FXRP`);
    if (balance < 10000000n) {
        console.error('Error: Insufficient FXRP balance to run redemption (requires at least 10 FXRP)');
        return;
    }
    // 1. Approve
    console.log('Approving AssetManager to spend 10 FXRP...');
    const approveTx = await walletClient.writeContract({
        address: fAssetAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [assetManagerAddress, 10000000n],
    });
    console.log(`Approve Tx: ${approveTx}. Waiting for confirmation...`);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('Approved successfully!');
    // 2. Request Redemption
    console.log(`Requesting redemption of 10 FXRP to ${xrpRecipient}...`);
    const redeemTx = await walletClient.writeContract({
        address: assetManagerAddress,
        abi: coston2.iAssetManagerAbi,
        functionName: 'redeemAmount',
        args: [10000000n, xrpRecipient, '0x0000000000000000000000000000000000000000'],
    });
    console.log(`Redeem Tx: ${redeemTx}. Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemTx });
    console.log('Redemption transaction confirmed!');
    // 3. Extract event logs
    const logs = (0, viem_1.parseEventLogs)({
        abi: coston2.iAssetManagerAbi,
        eventName: 'RedemptionRequested',
        logs: receipt.logs,
    });
    if (!logs || logs.length === 0) {
        console.error('Error: RedemptionRequested event not found in logs!');
        return;
    }
    const eventData = logs[0].args;
    const redemptionId = (eventData.requestId || eventData.redemptionId).toString();
    const paymentReference = eventData.paymentReference;
    console.log(`>>> Redemption Requested successfully!`);
    console.log(`>>> Redemption ID: ${redemptionId}`);
    console.log(`>>> Payment Reference: ${paymentReference}`);
    // 4. Simulate Agent Payout on XRPL
    console.log(`Simulating Agent payout on XRPL to ${xrpRecipient}...`);
    try {
        const paymentResult = await (0, payment_signer_1.executeXrplPaymentWithSeed)(XRPL_URL, xrplSeed, {
            vaultAddressXRP: xrpRecipient,
            totalXRP: 9.95, // 10 minus 0.5% fee
            memoHex: paymentReference,
        });
        console.log('>>> Simulated Agent payout broadcasted successfully!');
        console.log(`>>> Agent Payout XRPL Tx Hash: ${paymentResult.txHash}`);
        console.log('Redemption end-to-end integration flow verified!');
    }
    catch (err) {
        console.error('Agent payout simulation failed:', err.message || err);
    }
}
main();
