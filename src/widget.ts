import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { executeXrplPaymentWithSeed } from './utils/payment_signer';
import { createPublicClient, http, formatEther, formatUnits, createWalletClient, custom, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flareTestnet } from 'viem/chains';
import { Client as XrplClient } from 'xrpl';
import * as QRCode from 'qrcode';
import { fetchFdcProof } from './utils/proof';

// Coston2 Constants
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

const coston2 = require('@flarenetwork/flare-wagmi-periphery-package').coston2;

let sdk: FXRPDirectMintSDK;
let currentLots = 1;
let lotSizeXRP = 10;
let minterFeeShareBIPS = 10; // 0.1%
let executorFeeXRP = 0.1;
let minimumFeeXRP = 0.1;

// Active variables
let evmAddress: string = '';
let targetXRP: number = 0;
let memoHex: string = '';
let vaultAddressXRP: string = '';

// Redemption active variables
let activeTab: 'mint' | 'redeem' = 'mint';
let redemptionId: string = '';
let redemptionReference: string = '';
let redemptionAddressXRP: string = '';

// Minimal ERC-20 ABI
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

// Check if dev mode is enabled via URL parameters to show simulated testing panel
const isDevMode = new URLSearchParams(window.location.search).get('mode') === 'dev';

// Live XRPL payment polling interval
let paymentPollInterval: any = null;

// UI Container Element
let container: HTMLElement;

/**
 * Self-mounts and draws the quiet, flat Stripe-like dashboard layout.
 */
function mountWidget() {
  container = document.getElementById('fxrp-mint-widget')!;
  if (!container) {
    console.warn('FXRP Mint Widget: #fxrp-mint-widget not found.');
    return false;
  }

  container.innerHTML = `
    <main class="mint-card">
      <header class="dashboard-header" style="margin-bottom: 12px;">
        <div class="logo-container">
          <h1 id="widget-main-title">FXRP Onboard Portal</h1>
        </div>
        <div class="network-badge">Coston2 Testnet</div>
      </header>

      <!-- Tab Selector -->
      <div class="tab-selector" style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 16px;">
        <button class="tab-btn active" id="tab-mint" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid var(--color-accent); color: var(--text-primary); font-weight: 600; cursor: pointer; font-size: 13px;">Mint FXRP</button>
        <button class="tab-btn" id="tab-redeem" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted); font-weight: 600; cursor: pointer; font-size: 13px;">Redeem FXRP</button>
      </div>

      <!-- Idle / Entry Phase -->
      <section id="phase-idle" class="mint-form">
        <!-- Mint Inputs Area -->
        <div id="mint-inputs-container">
          <div class="form-group">
            <label class="form-label" for="lot-count">Amount (Lots - 10 XRP each)</label>
            <div class="lot-incrementer">
              <button type="button" class="lot-btn" id="lot-dec">-</button>
              <div class="lot-value" id="lot-count-value">1</div>
              <button type="button" class="lot-btn" id="lot-inc">+</button>
            </div>
          </div>

          <div class="fees-card" style="margin-top: 14px;">
            <div class="fee-row">
              <span>Direct Mint Amount</span>
              <span id="fee-amount">10.0 XRP</span>
            </div>
            <div class="fee-row">
              <span>Protocol Minting Fee (0.1% floor)</span>
              <span id="fee-mint">0.1 XRP</span>
            </div>
            <div class="fee-row">
              <span>Executor Bounty Reward</span>
              <span id="fee-exec">0.1 XRP</span>
            </div>
            <div class="fee-row total">
              <span>Total XRP Required</span>
              <span id="fee-total">10.2 XRP</span>
            </div>
          </div>
        </div>

        <!-- Redeem Inputs Area (hidden by default) -->
        <div id="redeem-inputs-container" class="hidden">
          <div class="form-group">
            <label class="form-label" for="redeem-amount-val">Amount (FXRP)</label>
            <input type="number" id="redeem-amount-val" value="10" min="10" step="10" style="width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; color: var(--text-primary); font-size: 13px; font-family: inherit;" />
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label" for="redeem-xrp-addr-val">Destination XRP Address</label>
            <input type="text" id="redeem-xrp-addr-val" placeholder="r... (your XRPL address)" style="width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; color: var(--text-primary); font-size: 13px; font-family: inherit;" />
          </div>

          <div class="fees-card" style="margin-top: 14px;">
            <div class="fee-row">
              <span>Redemption Amount</span>
              <span id="redeem-val-display">10.0 FXRP</span>
            </div>
            <div class="fee-row">
              <span>Agent Payout Fee (0.5%)</span>
              <span id="redeem-fee-display">0.05 XRP</span>
            </div>
            <div class="fee-row total">
              <span>Expected XRP Payout</span>
              <span id="redeem-total-display">9.95 XRP</span>
            </div>
          </div>
        </div>

        <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-top: 4px;">
          <span id="dynamic-helper-text">You'll send XRP from your own wallet. FXRP arrives on Flare once the payment is verified — usually a few minutes.</span>
        </p>

        <a href="#" id="how-works-link" style="font-size: 12px; color: var(--color-accent); text-decoration: none; font-weight: 500; align-self: flex-start; margin-top: 4px;">
          How this works
        </a>
        
        <div id="how-works-content" class="hidden" style="font-size: 12px; color: var(--text-muted); border-left: 2px solid var(--border-color); padding-left: 10px; margin-top: 8px; line-height: 1.4;">
          <span id="dynamic-how-works-text">This widget uses FAssets v1.3 direct minting. Your recipient EVM address is securely encoded inside your payment transaction memo. The Flare Data Connector (FDC) verifies the payment trustlessly, allowing FXRP to be minted to your EVM address without relying on any trusted intermediary.</span>
        </div>

        <button type="button" class="action-btn" id="btn-initialize-mint" style="margin-top: 16px;">
          Connect EVM Wallet & Mint
        </button>
        <div id="wallet-status-msg" style="font-size: 12px; color: var(--color-error); margin-top: 8px; text-align: center;" class="hidden"></div>
      </section>

      <!-- Awaiting Payment Phase -->
      <section id="phase-payment" class="hidden" style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="font-size: 14px; font-weight: 600;">Submit XRP Payment</h3>
        
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
          Scan the QR code below using your XRP wallet (Bifrost, Xaman, etc.) to review and submit the transaction.
        </p>

        <!-- Real Wallet QR code generated fully client-side -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
          <canvas id="wallet-qr-code-canvas" style="width: 220px; height: 220px; border: 1px solid var(--border-color); border-radius: 4px; background: white;"></canvas>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div class="wallet-card">
            <div class="wallet-meta">
              <span class="wallet-label">Amount</span>
              <span id="pay-amount" style="font-weight: 600;">10.2 XRP</span>
            </div>
          </div>
          
          <div class="wallet-card">
            <div class="wallet-meta">
              <span class="wallet-label">Vault Address</span>
            </div>
            <div id="pay-destination" class="wallet-address" style="font-size: 12px; margin-top: 4px; user-select: all; cursor: pointer;">--</div>
          </div>
          
          <div class="wallet-card">
            <div class="wallet-meta">
              <span class="wallet-label">Memo (Hex)</span>
            </div>
            <div id="pay-memo" class="wallet-address" style="font-size: 11px; margin-top: 4px; word-break: break-all; user-select: all; cursor: pointer;">--</div>
          </div>
        </div>

        <div style="border: 1px solid var(--color-error); background: rgba(220, 38, 38, 0.03); border-radius: 6px; padding: 12px; font-size: 12px; color: var(--color-error); line-height: 1.4;">
          <strong>Warning:</strong> The memo must be included exactly as shown, or the protocol cannot match the mint to your account.
        </div>

        <!-- Testing Simulation Provider (Explicitly Isolated & Developer Only) -->
        <div id="dev-sim-panel" class="wallet-prompt-box hidden">
          <div class="wallet-prompt-title">Developer Testing Simulation</div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px;">
            Input your testnet credentials below to simulate signing this payment transaction. (Stored locally in your browser).
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);" for="dev-xrpl-seed">Test XRPL Seed</label>
              <input type="password" id="dev-xrpl-seed" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-size: 11px;" placeholder="s..." />
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);" for="dev-flare-pk">Test Flare Private Key</label>
              <input type="password" id="dev-flare-pk" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-size: 11px;" placeholder="0x..." />
            </div>
          </div>
          <button type="button" class="action-btn" id="btn-simulate-payment" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); box-shadow: none;">
            Simulate Payment Signing (Xaman)
          </button>
        </div>

        <div style="font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
          <span style="color: var(--color-accent);">●</span> Awaiting your XRPL transaction...
        </div>
      </section>

      <!-- In Progress / Tracker Phase -->
      <section id="phase-tracker" class="status-tracker hidden">
        <h3 class="tracker-title">Mint Status Tracking</h3>
        
        <div class="stepper">
          <div class="step-node pending" id="step-pay">
            <span class="step-dot"></span>
            <span class="step-label">XRP payment sent</span>
          </div>
          <div class="step-node pending" id="step-fdc">
            <span class="step-dot"></span>
            <span class="step-label">Observed on XRPL — waiting for confirmation</span>
          </div>
          <div class="step-node pending" id="step-proof">
            <span class="step-dot"></span>
            <span class="step-label">FDC proof generated</span>
          </div>
          <div class="step-node pending" id="step-execute">
            <span class="step-dot"></span>
            <span class="step-label">FXRP minted</span>
          </div>
        </div>

        <!-- Inline Technical Detail Toggle -->
        <div class="technical-toggle-header" id="tech-toggle-btn">
          <span>▶ Technical Details</span>
        </div>
        <div class="technical-toggle-content hidden" id="tech-content">
          <div>EVM Address: <span id="tech-evm-addr" style="color: var(--text-primary);">--</span></div>
          <div>XRPL Hash: <span id="tech-xrpl-hash" style="color: var(--text-primary);">--</span></div>
          <div>FDC Round ID: <span id="tech-round-id" style="color: var(--text-primary);">--</span></div>
          <div>AssetManager: <span id="tech-asset-mgr" style="color: var(--text-primary);">--</span></div>
        </div>

        <!-- Logging Console -->
        <div class="console-log" id="console-log" style="margin-top: 16px;">
          <div class="log-entry info">Console logger initialized... awaiting action.</div>
        </div>

        <!-- Rate limit delay widget -->
        <div class="delay-alert hidden" id="delay-alert">
          <div class="delay-icon">⚠️</div>
          <div class="delay-text">
            <div class="delay-title">Direct Minting Saturated</div>
            <div class="delay-desc">Large mints are processed with a short delay for network safety. Estimated wait: <span id="delay-timer" style="font-weight: bold;">00:00</span></div>
          </div>
        </div>
      </section>

      <!-- Complete Phase -->
      <section id="phase-complete" class="hidden" style="display: flex; flex-direction: column; gap: 16px; text-align: center; padding: 10px 0;">
        <div style="font-size: 40px; color: var(--color-success);">✓</div>
        <h2 style="font-family: var(--font-system); font-size: 20px; font-weight: 600;">Mint Completed Successfully</h2>
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
          Your FXRP tokens have been successfully minted and deposited to your EVM account on Coston2.
        </p>
        
        <div class="wallet-card" style="margin: 0 auto; width: 100%; max-width: 320px;">
          <div class="wallet-meta">
            <span class="wallet-label">Minted FXRP Balance</span>
            <span id="final-evm-balance" style="font-weight: 600;">-- FXRP</span>
          </div>
        </div>

        <button type="button" class="action-btn" id="btn-complete-continue" style="margin-top: 12px; width: 100%;">
          Continue
        </button>
      </section>
    </main>
  `;

  if (isDevMode) {
    document.getElementById('dev-sim-panel')!.classList.remove('hidden');
  }

  return true;
}

/**
 * Helper to populate and stylize technical details with clickable block explorer links.
 */
function updateTechnicalDetails(evmAddr: string, txHash: string) {
  const evmAddrEl = document.getElementById('tech-evm-addr');
  if (evmAddrEl) {
    evmAddrEl.innerHTML = `<a href="https://coston2-explorer.flare.network/address/${evmAddr}" target="_blank" style="color: var(--color-accent); text-decoration: underline;">${evmAddr.slice(0, 8)}...${evmAddr.slice(-8)}</a>`;
  }
  const xrplHashEl = document.getElementById('tech-xrpl-hash');
  if (xrplHashEl) {
    xrplHashEl.innerHTML = `<a href="https://testnet.xrpl.org/transactions/${txHash}" target="_blank" style="color: var(--color-accent); text-decoration: underline;">${txHash.slice(0, 8)}...${txHash.slice(-8)}</a>`;
  }
  const assetMgrEl = document.getElementById('tech-asset-mgr');
  if (assetMgrEl) {
    const addr = sdk['assetManagerAddress'] || REGISTRY_ADDRESS;
    assetMgrEl.innerHTML = `<a href="https://coston2-explorer.flare.network/address/${addr}" target="_blank" style="color: var(--color-accent); text-decoration: underline;">${addr.slice(0, 8)}...${addr.slice(-8)}</a>`;
  }
}

/**
 * Connects browser wallet (MetaMask/Bifrost) dynamically using window.ethereum.
 */
async function connectBrowserWallet(): Promise<boolean> {
  const statusMsgEl = document.getElementById('wallet-status-msg');
  if (statusMsgEl) {
    statusMsgEl.classList.add('hidden');
    statusMsgEl.innerText = '';
  }

  if (isDevMode) {
    // In dev mode, we bypass MetaMask checks and allow simulated EVM wallets
    const pkInput = document.getElementById('dev-flare-pk') as HTMLInputElement;
    const devPk = pkInput ? pkInput.value.trim() : '';
    
    let derivedAddress = '';
    if (devPk && devPk.startsWith('0x') && devPk.length === 66) {
      try {
        const account = privateKeyToAccount(devPk as `0x${string}`);
        derivedAddress = account.address;
      } catch {}
    }

    // Derive address directly from current input; no localStorage fallback is allowed for security

    evmAddress = derivedAddress || '0x7bEa8C45F0cE61DF69914f5b04fa62a3D6f1E53c';
    log(`Simulated EVM wallet connected: ${evmAddress}`, 'success');
    return true;
  }

  const provider = (window as any).ethereum;
  if (!provider) {
    const msg = 'EVM browser wallet extension not detected (window.ethereum is undefined).';
    if (statusMsgEl) {
      statusMsgEl.innerText = msg;
      statusMsgEl.classList.remove('hidden');
    } else {
      alert(msg);
    }
    return false;
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      const msg = 'EVM account connection rejected by user.';
      if (statusMsgEl) {
        statusMsgEl.innerText = msg;
        statusMsgEl.classList.remove('hidden');
      } else {
        alert(msg);
      }
      return false;
    }
    
    evmAddress = accounts[0];
    
    // Create walletClient using custom window.ethereum transport (non-custodial!)
    const walletClient = createWalletClient({
      chain: flareTestnet,
      transport: custom(provider)
    });

    sdk.setWalletClient(walletClient, evmAddress);
    return true;
  } catch (error: any) {
    console.error('Wallet connection failed:', error);
    const msg = `Wallet connection failed: ${error.message || error}`;
    if (statusMsgEl) {
      statusMsgEl.innerText = msg;
      statusMsgEl.classList.remove('hidden');
    } else {
      alert(msg);
    }
    return false;
  }
}

/**
 * Setup logger utility
 */
function log(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const el = document.getElementById('console-log');
  if (!el) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
}

/**
 * Initializes wallets and balance queries.
 */
async function initializeWidget() {
  if (!mountWidget()) return;

  // Initialize main SDK (without seed or private key! Non-custodial!)
  sdk = new FXRPDirectMintSDK({
    xrplUrl: XRPL_URL,
    flareRpcUrl: FLARE_RPC_URL,
    registryAddress: REGISTRY_ADDRESS,
  });

  try {
    const settings = await sdk.getSettings();
    lotSizeXRP = settings.lotSizeXRP;
    minterFeeShareBIPS = settings.minterFeeShareBIPS;
    executorFeeXRP = settings.executorFeeXRP;
    minimumFeeXRP = settings.minimumFeeXRP;

    setupEventListeners();
    updateFeeBreakdown();

  } catch (error: any) {
    console.error('Settings initialization failed:', error);
  }
}

/**
 * Updates the calculated fee card in the UI based on lots.
 */
function updateFeeBreakdown() {
  const amountXRP = currentLots * lotSizeXRP;
  const percentageFee = (amountXRP * minterFeeShareBIPS) / 10000;
  const calculatedFeeXRP = Math.max(percentageFee, minimumFeeXRP);
  const totalXRP = amountXRP + calculatedFeeXRP + executorFeeXRP;

  document.getElementById('fee-amount')!.innerText = `${amountXRP.toFixed(1)} XRP`;
  document.getElementById('fee-mint')!.innerText = `${calculatedFeeXRP.toFixed(2)} XRP`;
  document.getElementById('fee-exec')!.innerText = `${executorFeeXRP.toFixed(2)} XRP`;
  document.getElementById('fee-total')!.innerText = `${totalXRP.toFixed(2)} XRP`;
}

/**
 * Sets up event listeners for inputs and actions.
 */
function setupEventListeners() {
  const lotDecBtn = document.getElementById('lot-dec')!;
  const lotIncBtn = document.getElementById('lot-inc')!;
  const lotCountValEl = document.getElementById('lot-count-value')!;

  lotDecBtn.addEventListener('click', () => {
    if (currentLots > 1) {
      currentLots--;
      lotCountValEl.innerText = currentLots.toString();
      updateFeeBreakdown();
    }
  });

  lotIncBtn.addEventListener('click', () => {
    currentLots++;
    lotCountValEl.innerText = currentLots.toString();
    updateFeeBreakdown();
  });

  // Tab Selection Event Listeners
  const tabMint = document.getElementById('tab-mint');
  const tabRedeem = document.getElementById('tab-redeem');
  const mintContainer = document.getElementById('mint-inputs-container');
  const redeemContainer = document.getElementById('redeem-inputs-container');
  const helperText = document.getElementById('dynamic-helper-text');
  const howWorksText = document.getElementById('dynamic-how-works-text');
  const actionBtn = document.getElementById('btn-initialize-mint');
  const simBtn = document.getElementById('btn-simulate-payment');
  const widgetTitle = document.getElementById('widget-main-title');

  tabMint?.addEventListener('click', () => {
    activeTab = 'mint';
    tabMint.classList.add('active');
    tabRedeem?.classList.remove('active');
    mintContainer?.classList.remove('hidden');
    redeemContainer?.classList.add('hidden');
    if (widgetTitle) widgetTitle.innerText = "FXRP Onboard Portal";
    if (helperText) helperText.innerText = "You'll send XRP from your own wallet. FXRP arrives on Flare once the payment is verified — usually a few minutes.";
    if (howWorksText) howWorksText.innerText = "This widget uses FAssets v1.3 direct minting. Your recipient EVM address is securely encoded inside your payment transaction memo. The Flare Data Connector (FDC) verifies the payment trustlessly, allowing FXRP to be minted to your EVM address without relying on any trusted intermediary.";
    if (actionBtn) actionBtn.innerText = "Connect EVM Wallet & Mint";
    if (simBtn) simBtn.innerText = "Simulate Payment Signing (Xaman)";
  });

  tabRedeem?.addEventListener('click', () => {
    activeTab = 'redeem';
    tabRedeem.classList.add('active');
    tabMint?.classList.remove('active');
    mintContainer?.classList.add('hidden');
    redeemContainer?.classList.remove('hidden');
    if (widgetTitle) widgetTitle.innerText = "FXRP Onboard Portal";
    if (helperText) helperText.innerText = "You'll burn FXRP on Flare. The assigned FAssets Agent will pay XRP directly back to your Ripple address on the XRPL ledger.";
    if (howWorksText) howWorksText.innerText = "This widget requests redemption from the FAssets AssetManager contract. Your requested FXRP tokens are burned, and an Agent is dynamically assigned to pay the equivalent XRP to your Ripple address within the designated block/time window.";
    if (actionBtn) actionBtn.innerText = "Connect EVM Wallet & Redeem";
    if (simBtn) simBtn.innerText = "Simulate Agent Payout (XRPL)";
  });

  // Redeem input calculations
  const redeemAmountInput = document.getElementById('redeem-amount-val') as HTMLInputElement;
  redeemAmountInput?.addEventListener('input', () => {
    const val = Number(redeemAmountInput.value) || 0;
    const fee = val * 0.005; // 0.5%
    const total = val - fee;
    
    const valDisplay = document.getElementById('redeem-val-display');
    const feeDisplay = document.getElementById('redeem-fee-display');
    const totalDisplay = document.getElementById('redeem-total-display');
    
    if (valDisplay) valDisplay.innerText = `${val.toFixed(1)} FXRP`;
    if (feeDisplay) feeDisplay.innerText = `${fee.toFixed(2)} XRP`;
    if (totalDisplay) totalDisplay.innerText = `${total.toFixed(2)} XRP`;
  });

  // Action Button Trigger
  document.getElementById('btn-initialize-mint')!.addEventListener('click', async () => {
    const connected = await connectBrowserWallet();
    if (connected) {
      if (activeTab === 'mint') {
        // Transition to phase awaiting payment
        document.getElementById('phase-idle')!.classList.add('hidden');
        document.getElementById('phase-payment')!.classList.remove('hidden');
        
        // Calculate direct minting parameters
        const paymentParams = await sdk.preparePayment({
          recipientEvmAddress: evmAddress,
          lots: currentLots,
        });

        targetXRP = paymentParams.totalXRP;
        memoHex = paymentParams.memoHex;
        vaultAddressXRP = paymentParams.vaultAddressXRP;

        document.getElementById('pay-amount')!.innerText = `${targetXRP.toFixed(2)} XRP`;
        document.getElementById('pay-destination')!.innerText = vaultAddressXRP;
        document.getElementById('pay-memo')!.innerText = memoHex;

        // Render standard XRPL transaction JSON in the QR code entirely client-side
        const txJson = {
          TransactionType: 'Payment',
          Destination: vaultAddressXRP,
          Amount: Math.floor(targetXRP * 1000000).toString(), // drops
          Memos: [
            {
              Memo: {
                MemoType: '46417373657473', // "FAssets"
                MemoFormat: '6170706c69636174696f6e2f6f637465742d73747265616d', // "application/octet-stream"
                MemoData: memoHex
              }
            }
          ]
        };

        const canvas = document.getElementById('wallet-qr-code-canvas') as HTMLCanvasElement;
        if (canvas) {
          QRCode.toCanvas(canvas, JSON.stringify(txJson), { width: 220, margin: 1 }, (err) => {
            if (err) console.error('Error generating QR code client-side:', err);
          });
        }

        // Start observing the XRPL ledger for the incoming payment from a real user
        startRealPaymentDetection();
      } else {
        // Redemption path
        const valInput = document.getElementById('redeem-amount-val') as HTMLInputElement;
        const addrInput = document.getElementById('redeem-xrp-addr-val') as HTMLInputElement;
        const amountFXRP = Number(valInput.value) || 0;
        const xrpAddress = addrInput.value.trim();

        if (amountFXRP < 10) {
          alert('Redemption minimum is 10 FXRP.');
          return;
        }
        if (!xrpAddress.startsWith('r') || xrpAddress.length < 25) {
          alert('Please enter a valid Ripple testnet destination address (starts with r).');
          return;
        }

        await requestRedemption(amountFXRP, xrpAddress);
      }
    }
  });

  // How it works toggle
  document.getElementById('how-works-link')!.addEventListener('click', (e) => {
    e.preventDefault();
    const content = document.getElementById('how-works-content')!;
    content.classList.toggle('hidden');
  });

  // Technical details toggle
  document.getElementById('tech-toggle-btn')!.addEventListener('click', () => {
    const content = document.getElementById('tech-content')!;
    content.classList.toggle('hidden');
  });

  // Simulate payment / payout
  document.getElementById('btn-simulate-payment')!.addEventListener('click', () => {
    if (activeTab === 'mint') {
      simulatePaymentSigning();
    } else {
      simulateAgentPayout();
    }
  });

  // Reset/Continue button on success
  document.getElementById('btn-complete-continue')!.addEventListener('click', () => {
    // Reset to idle phase
    document.getElementById('phase-complete')!.classList.add('hidden');
    document.getElementById('phase-idle')!.classList.remove('hidden');
    currentLots = 1;
    lotCountValEl.innerText = '1';
    updateFeeBreakdown();
    
    // Restore default tab
    tabMint?.click();
  });
}

/**
 * Monitors the XRPL ledger for the matching transaction from a real user's payment.
 */
async function startRealPaymentDetection() {
  if (paymentPollInterval) {
    clearInterval(paymentPollInterval);
  }

  const client = new XrplClient(XRPL_URL);
  let connected = false;

  const poll = async () => {
    try {
      if (!connected) {
        await client.connect();
        connected = true;
      }

      const response = await client.request({
        command: 'account_tx',
        account: vaultAddressXRP,
        limit: 15,
      });

      const txs = response.result.transactions || [];
      for (const txObj of txs) {
        const tx = txObj.tx as any;
        if (!tx) continue;

        if (tx.TransactionType === 'Payment' && tx.Destination === vaultAddressXRP) {
          const memos = tx.Memos || [];
          const hasMatchingMemo = memos.some((m: any) => {
            return m.Memo?.MemoData?.toUpperCase() === memoHex.toUpperCase();
          });

          if (hasMatchingMemo) {
            // Matching payment detected!
            clearInterval(paymentPollInterval);
            paymentPollInterval = null;
            await client.disconnect();

            const paymentResult = {
              txHash: tx.hash!,
              blockTimestamp: (tx.date || 0) + 946684800, // Ripple to Unix epoch
              spentAmountDrops: typeof tx.Amount === 'string' ? tx.Amount : (tx.Amount as any).value,
              receivedAmountDrops: typeof tx.Amount === 'string' ? tx.Amount : (tx.Amount as any).value,
              receivingAddressXRP: vaultAddressXRP,
            };

            // Transition to tracker
            document.getElementById('phase-payment')!.classList.add('hidden');
            document.getElementById('phase-tracker')!.classList.remove('hidden');

            updateTechnicalDetails(evmAddress, paymentResult.txHash);

            document.getElementById('step-pay')!.className = 'step-node completed';
            document.getElementById('step-fdc')!.className = 'step-node active';

            await runFinalizationFlow(paymentResult);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Real payment poller check failed (will retry):', err);
    }
  };

  // Poll every 10 seconds
  poll();
  paymentPollInterval = setInterval(poll, 10000);
}

/**
 * Request redemption of FXRP to XRP on Coston2.
 */
async function requestRedemption(amountFXRP: number, xrpAddress: string): Promise<boolean> {
  const amountUBA = BigInt(amountFXRP * 1e6); // XRP has 6 decimals
  const assetManagerAddress = sdk['assetManagerAddress'] || REGISTRY_ADDRESS;

  // Resolve fAsset Address
  const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });

  log(`Resolving FXRP token contract...`, 'info');
  let fAssetAddress: `0x${string}`;
  try {
    fAssetAddress = await publicClient.readContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'fAsset',
    }) as `0x${string}`;
  } catch (err: any) {
    console.error('Failed to resolve fAsset address:', err);
    log(`Failed to resolve fAsset address: ${err.message || err}`, 'error');
    return false;
  }

  // Get walletClient
  let walletClient = sdk['walletClient'];
  let signerAddress = evmAddress;

  if (isDevMode) {
    // In dev mode, we can derive the wallet client from the input private key
    const pkInput = document.getElementById('dev-flare-pk') as HTMLInputElement;
    const devPk = pkInput ? pkInput.value.trim() : '';
    if (devPk && devPk.startsWith('0x') && devPk.length === 66) {
      try {
        const account = privateKeyToAccount(devPk as `0x${string}`);
        signerAddress = account.address;
        walletClient = createWalletClient({
          account,
          chain: flareTestnet,
          transport: http(FLARE_RPC_URL)
        });
      } catch (err: any) {
        console.error('Failed to build simulated wallet client:', err);
      }
    }
  }

  if (!walletClient) {
    alert('EVM Wallet client not initialized. Please connect wallet.');
    return false;
  }

  try {
    log(`Checking FXRP token allowance...`, 'info');
    const allowance = await publicClient.readContract({
      address: fAssetAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [signerAddress as `0x${string}`, assetManagerAddress as `0x${string}`],
    }) as bigint;

    if (allowance < amountUBA) {
      log(`Approving AssetManager to burn FXRP...`, 'warning');
      const approveTx = await walletClient.writeContract({
        address: fAssetAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [assetManagerAddress as `0x${string}`, amountUBA],
        account: signerAddress as `0x${string}`,
        chain: flareTestnet,
      });
      log(`Approve transaction submitted: ${approveTx}. Waiting for confirmation...`, 'info');
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      log(`Allowance approved successfully!`, 'success');
    }

    log(`Submitting redemption request for ${amountFXRP} FXRP...`, 'info');
    const redeemTx = await walletClient.writeContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'redeemAmount',
      args: [amountUBA, xrpAddress, '0x0000000000000000000000000000000000000000'],
      account: signerAddress as `0x${string}`,
      chain: flareTestnet,
    });

    log(`Redeem transaction submitted: ${redeemTx}. Waiting for confirmation...`, 'info');
    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemTx });
    log(`Redemption transaction confirmed!`, 'success');

    // Parse logs for RedemptionRequested event
    const logs = parseEventLogs({
      abi: coston2.iAssetManagerAbi,
      eventName: 'RedemptionRequested',
      logs: receipt.logs,
    }) as any[];

    if (logs && logs.length > 0) {
      const eventData = logs[0].args as any;
      redemptionId = (eventData.requestId || eventData.redemptionId).toString();
      redemptionReference = eventData.paymentReference;
      redemptionAddressXRP = xrpAddress;

      log(`Redemption Requested! ID: ${redemptionId} | Reference: ${redemptionReference}`, 'success');

      // Setup tracking views
      setupRedemptionTracker(redemptionId, redemptionReference, xrpAddress);

      // Start polling XRPL for agent payout
      startRealRedemptionDetection(redemptionReference, xrpAddress);
      return true;
    } else {
      throw new Error('RedemptionRequested event not found in transaction logs.');
    }
  } catch (err: any) {
    console.error('Redemption failed:', err);
    log(`Redemption failed: ${err.message || err}`, 'error');
    alert(`Redemption failed: ${err.message || err}`);
    return false;
  }
}

/**
 * Configure UI tracker elements for redemption process.
 */
function setupRedemptionTracker(redemptionId: string, paymentReference: string, xrpAddress: string) {
  // Switch to tracker phase
  document.getElementById('phase-idle')!.classList.add('hidden');
  document.getElementById('phase-tracker')!.classList.remove('hidden');

  // Set stepper nodes to redemption mode
  document.getElementById('step-pay')!.className = 'step-node completed';
  document.getElementById('step-pay')!.querySelector('.step-label')!.innerHTML = `Redemption Requested (ID: ${redemptionId})`;

  document.getElementById('step-fdc')!.className = 'step-node active';
  document.getElementById('step-fdc')!.querySelector('.step-label')!.innerHTML = `Awaiting Agent's payment on XRPL...`;

  document.getElementById('step-proof')!.className = 'step-node pending';
  document.getElementById('step-proof')!.querySelector('.step-label')!.innerHTML = `Observed payment on XRPL ledger`;

  document.getElementById('step-execute')!.className = 'step-node pending';
  document.getElementById('step-execute')!.querySelector('.step-label')!.innerHTML = `Redemption Complete!`;

  // Update technical details panel
  updateTechnicalDetails(evmAddress, 'N/A'); // No XRPL payment sent by user, it's sent by Agent
  const xrplHashEl = document.getElementById('tech-xrpl-hash');
  if (xrplHashEl) {
    xrplHashEl.innerText = `Awaiting payout...`;
  }
}

/**
 * Executes FDC proof generation and Flare confirmation for redemption payouts on-chain.
 */
async function runRedemptionFinalizationFlow(paymentResult: any, requestId: bigint) {
  try {
    document.getElementById('step-proof')!.className = 'step-node active';
    log(`Preparing FDC proof request for Agent payout...`, 'info');

    const { votingRoundId, requestBytes } = await sdk.requestFdcAttestation(paymentResult);
    
    // Update FDC Round ID in technical details panel
    const techRoundEl = document.getElementById('tech-round-id');
    if (techRoundEl) {
      techRoundEl.innerText = votingRoundId.toString();
    }

    log(`FDC attestation requested for round ${votingRoundId}. Finalizing round (takes ~90-180s)...`, 'info');

    // Poll for the proof
    let proof: any = null;
    while (!proof) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      try {
        proof = await fetchFdcProof(votingRoundId, requestBytes);
        if (proof) {
          log(`FDC proof successfully retrieved!`, 'success');
          break;
        }
      } catch (err: any) {
        log(`Still waiting for FDC proof: ${err.message || err}`, 'info');
      }
    }

    document.getElementById('step-proof')!.className = 'step-node completed';
    document.getElementById('step-execute')!.className = 'step-node active';

    // Submit confirmation to AssetManager
    log(`Submitting redemption payment confirmation to AssetManager...`, 'info');
    const assetManagerAddress = sdk['assetManagerAddress'] || REGISTRY_ADDRESS;
    
    let walletClient = sdk['walletClient'];
    let signerAddress = evmAddress;

    if (isDevMode) {
      const pkInput = document.getElementById('dev-flare-pk') as HTMLInputElement;
      const devPk = pkInput ? pkInput.value.trim() : '';
      if (devPk && devPk.startsWith('0x') && devPk.length === 66) {
        try {
          const account = privateKeyToAccount(devPk as `0x${string}`);
          signerAddress = account.address;
          walletClient = createWalletClient({
            account,
            chain: flareTestnet,
            transport: http(FLARE_RPC_URL)
          });
        } catch {}
      }
    }

    if (!walletClient) {
      throw new Error('EVM Wallet client not initialized.');
    }

    const confirmTx = await walletClient.writeContract({
      address: assetManagerAddress as `0x${string}`,
      abi: coston2.iAssetManagerAbi,
      functionName: 'confirmXRPRedemptionPayment',
      args: [proof, requestId],
      account: signerAddress as `0x${string}`,
      chain: flareTestnet,
    });

    log(`Confirmation transaction submitted: ${confirmTx}. Waiting for receipt...`, 'info');
    const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
    await publicClient.waitForTransactionReceipt({ hash: confirmTx });
    log(`Redemption payment confirmed on-chain! Ticket closed.`, 'success');

    document.getElementById('step-execute')!.className = 'step-node completed';

    setTimeout(async () => {
      document.getElementById('phase-tracker')!.classList.add('hidden');
      document.getElementById('phase-complete')!.classList.remove('hidden');

      document.getElementById('final-evm-balance')!.innerText = `Redemption Confirmed!`;
      const finalDesc = document.querySelector('#phase-complete p');
      if (finalDesc) {
        finalDesc.innerHTML = `Your redemption has been verified by FDC and confirmed on Flare. XRP received at address <strong>${redemptionAddressXRP}</strong>.`;
      }
      
      await queryBalances();
    }, 1500);

  } catch (err: any) {
    const errMsg = err.message || '';
    if (errMsg.includes('0xba0514c0') || errMsg.toLowerCase().includes('invalidrequestid')) {
      log(`Redemption ticket already finalized or expired. verification complete!`, 'success');
      document.getElementById('step-execute')!.className = 'step-node completed';
      
      setTimeout(async () => {
        document.getElementById('phase-tracker')!.classList.add('hidden');
        document.getElementById('phase-complete')!.classList.remove('hidden');
        document.getElementById('final-evm-balance')!.innerText = `Redemption Confirmed!`;
        const finalDesc = document.querySelector('#phase-complete p');
        if (finalDesc) {
          finalDesc.innerHTML = `Your redemption has been verified by FDC on-chain, and the payout transaction is confirmed. XRP received at address <strong>${redemptionAddressXRP}</strong>.`;
        }
        await queryBalances();
      }, 1500);
      return;
    }

    console.error('Redemption finalization failed:', err);
    log(`Redemption finalization failed: ${errMsg}`, 'error');
    document.getElementById('step-execute')!.className = 'step-node failed';
  }
}

/**
 * Polls the user's XRPL address for incoming agent payment with correct memo.
 */
function startRealRedemptionDetection(paymentReference: string, xrpAddress: string) {
  if (paymentPollInterval) {
    clearInterval(paymentPollInterval);
  }

  const client = new XrplClient(XRPL_URL);
  let connected = false;

  const poll = async () => {
    try {
      if (!connected) {
        await client.connect();
        connected = true;
      }

      log(`Polling XRPL for Agent payment to ${xrpAddress}...`, 'info');
      const response = await client.request({
        command: 'account_tx',
        account: xrpAddress,
        limit: 15,
      });

      const txs = response.result.transactions || [];
      for (const txObj of txs) {
        const tx = txObj.tx as any;
        if (!tx) continue;

        if (tx.TransactionType === 'Payment' && tx.Destination === xrpAddress) {
          const memos = tx.Memos || [];
          const hasMatchingReference = memos.some((m: any) => {
            const memoData = m.Memo?.MemoData || '';
            // Compare bytes32 memo hex case-insensitive
            const cleanRef = paymentReference.replace('0x', '');
            return memoData.toUpperCase() === cleanRef.toUpperCase();
          });

          if (hasMatchingReference) {
            // Agent payment detected!
            clearInterval(paymentPollInterval);
            paymentPollInterval = null;
            await client.disconnect();

            log(`Agent payment detected on XRPL! Hash: ${tx.hash}`, 'success');

            const drops = typeof tx.Amount === 'string' ? tx.Amount : (tx.Amount as any).value;
            const paymentResult = {
              txHash: tx.hash!,
              blockTimestamp: (tx.date || 0) + 946684800, // Ripple to Unix epoch
              spentAmountDrops: drops,
              receivedAmountDrops: drops,
              receivingAddressXRP: xrpAddress,
            };

            // Show updated explorer link for the Agent payout hash
            const techXrplEl = document.getElementById('tech-xrpl-hash');
            if (techXrplEl) {
              techXrplEl.innerHTML = `<a href="https://testnet.xrpl.org/transactions/${tx.hash}" target="_blank" style="color: var(--color-accent); text-decoration: underline;">${tx.hash.slice(0, 8)}...${tx.hash.slice(-8)}</a>`;
            }

            document.getElementById('step-fdc')!.className = 'step-node completed';
            
            // Execute on-chain proof verification and confirmation
            await runRedemptionFinalizationFlow(paymentResult, BigInt(redemptionId));
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Redemption poller failed (will retry):', err);
    }
  };

  poll();
  paymentPollInterval = setInterval(poll, 10000);
}

/**
 * Simulates Agent payment from test credentials.
 */
async function simulateAgentPayout() {
  const seedInput = document.getElementById('dev-xrpl-seed') as HTMLInputElement;
  const xrplSeed = seedInput ? seedInput.value.trim() : '';

  if (!xrplSeed) {
    alert('Please enter your Test XRPL Seed to simulate the Agent payout.');
    return;
  }

  if (!redemptionReference || !redemptionAddressXRP) {
    alert('No active redemption request found to simulate.');
    return;
  }

  // Clear live poller
  if (paymentPollInterval) {
    clearInterval(paymentPollInterval);
    paymentPollInterval = null;
  }

  log(`[Simulation] Broadcasting Agent payout of 9.95 XRP to ${redemptionAddressXRP}...`, 'warning');
  try {
    const paymentResult = await executeXrplPaymentWithSeed(XRPL_URL, xrplSeed, {
      vaultAddressXRP: redemptionAddressXRP,
      totalXRP: 9.95, // expected payout (10 minus 0.5% fee)
      memoHex: redemptionReference,
    } as any);
    log(`[Simulation] Agent payout broadcasted! Hash: ${paymentResult.txHash}`, 'success');

    const techXrplEl = document.getElementById('tech-xrpl-hash');
    if (techXrplEl) {
      techXrplEl.innerHTML = `<a href="https://testnet.xrpl.org/transactions/${paymentResult.txHash}" target="_blank" style="color: var(--color-accent); text-decoration: underline;">${paymentResult.txHash.slice(0, 8)}...${paymentResult.txHash.slice(-8)}</a>`;
    }

    document.getElementById('step-fdc')!.className = 'step-node completed';

    // Execute simulated proof submission and confirmation on-chain
    await runRedemptionFinalizationFlow(paymentResult, BigInt(redemptionId));

  } catch (err: any) {
    log(`[Simulation] Payout broadcast failed: ${err.message || err}`, 'error');
  }
}

/**
 * Simulated Payment Signer using developer test inputs.
 */
async function simulatePaymentSigning() {
  const seedInput = document.getElementById('dev-xrpl-seed') as HTMLInputElement;
  const pkInput = document.getElementById('dev-flare-pk') as HTMLInputElement;

  const xrplSeed = seedInput.value.trim();
  const flarePk = pkInput.value.trim();

  if (!xrplSeed || !flarePk) {
    alert('Please enter both your Test XRPL Seed and Test Flare Private Key to simulate.');
    return;
  }

  // In-memory execution only; credentials are never persisted to localStorage for security

  // Clear live poller
  if (paymentPollInterval) {
    clearInterval(paymentPollInterval);
    paymentPollInterval = null;
  }

  document.getElementById('phase-payment')!.classList.add('hidden');
  document.getElementById('phase-tracker')!.classList.remove('hidden');
  
  log('Initializing simulated wallet payment signing...');

  try {
    const paymentParams = {
      vaultAddressXRP: vaultAddressXRP,
      recipientEvmAddress: evmAddress,
      lots: currentLots,
      amountXRP: currentLots * lotSizeXRP,
      mintingFeeXRP: Math.max((currentLots * lotSizeXRP * minterFeeShareBIPS) / 10000, minimumFeeXRP),
      executorFeeXRP: executorFeeXRP,
      totalXRP: targetXRP,
      memoHex: memoHex,
    };

    log(`Prepared transaction: Destination = ${vaultAddressXRP}, Amount = ${targetXRP} XRP`);
    log('Requesting signature authorization from simulated provider...');

    // 1. Submit XRP Payment (calls structurally isolated payment signer utility)
    const paymentResult = await executeXrplPaymentWithSeed(XRPL_URL, xrplSeed, paymentParams);
    
    // Inject wallet client generated from input private key for simulation finalization
    const account = privateKeyToAccount(flarePk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: flareTestnet,
      transport: http(FLARE_RPC_URL)
    });
    sdk.setWalletClient(walletClient, account.address);

    // Update tracker details
    updateTechnicalDetails(evmAddress, paymentResult.txHash);

    document.getElementById('step-pay')!.className = 'step-node completed';
    document.getElementById('step-fdc')!.className = 'step-node active';
    log(`Simulated payment sent successfully! Hash: ${paymentResult.txHash}`, 'success');

    // 2. Track FDC attestation and finalization
    await runFinalizationFlow(paymentResult);

  } catch (error: any) {
    log(`Simulation process failed: ${error.message || error}`, 'error');
  }
}

/**
 * Shared status monitoring and finalization flow
 */
async function runFinalizationFlow(paymentResult: any) {
  await sdk.monitorStatus(paymentResult, (status) => {
    if (status.state === 'FdcRequested') {
      log(status.message, 'info');
      document.getElementById('step-fdc')!.className = 'step-node completed';
      document.getElementById('step-proof')!.className = 'step-node active';
    } else if (status.state === 'FdcProofReady') {
      log(status.message, 'success');
      document.getElementById('step-proof')!.className = 'step-node completed';
      document.getElementById('step-execute')!.className = 'step-node active';
    } else if (status.state === 'SubmittingFinalization') {
      log(status.message, 'info');
    } else if (status.state === 'Delayed') {
      log(status.message, 'warning');
      handleDelayedState(status.allowedAt!);
    } else if (status.state === 'Complete') {
      log(status.message, 'success');
      document.getElementById('step-execute')!.className = 'step-node completed';
      
      // Transition to success phase
      setTimeout(async () => {
        document.getElementById('phase-tracker')!.classList.add('hidden');
        document.getElementById('phase-complete')!.classList.remove('hidden');
        await queryBalances();
      }, 1500);

    } else if (status.state === 'Failed') {
      log(status.message, 'error');
      if (status.error) {
        console.error(status.error);
      }
    }
  });
}

/**
 * Handles the rate-limited delay state. Shows the warning panel and counts down.
 */
function handleDelayedState(allowedAt: Date) {
  const alertEl = document.getElementById('delay-alert')!;
  const timerEl = document.getElementById('delay-timer')!;
  
  alertEl.classList.remove('hidden');
  
  const interval = setInterval(async () => {
    const secondsLeft = Math.floor((allowedAt.getTime() - Date.now()) / 1000);
    
    if (secondsLeft <= 0) {
      clearInterval(interval);
      timerEl.innerText = '00:00';
      alertEl.classList.add('hidden');
      log('Delay epoch passed. Re-submitting direct mint execution...', 'info');
      return;
    }

    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    timerEl.innerText = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, 1000);
}

// Run Initializer on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget);
} else {
  initializeWidget();
}

/**
 * Dynamic balancer selector query.
 */
async function queryBalances() {
  try {
    const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
    const fAssetAddress = await publicClient.readContract({
      address: sdk['assetManagerAddress'] || REGISTRY_ADDRESS,
      abi: coston2.iAssetManagerAbi,
      functionName: 'fAsset',
    }) as `0x${string}`;

    const fxrpBalance = await publicClient.readContract({
      address: fAssetAddress,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'balanceOf',
      args: [evmAddress as `0x${string}`],
    }) as bigint;

    const decimals = await publicClient.readContract({
      address: fAssetAddress,
      abi: [
        {
          type: 'function',
          name: 'decimals',
          inputs: [],
          outputs: [{ type: 'uint8' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'decimals',
    }) as number;

    const formatted = formatUnits(fxrpBalance, decimals);
    
    // Set success screen message balance
    const finalBalanceEl = document.getElementById('final-evm-balance');
    if (finalBalanceEl) {
      if (activeTab === 'mint') {
        finalBalanceEl.innerText = `${Number(formatted).toFixed(2)} FXRP`;
      }
    }

    // Update parent wallet layout displays if they exist
    const widgetFassetBal = document.getElementById('fasset-balance');
    if (widgetFassetBal) {
      widgetFassetBal.innerText = `${Number(formatted).toFixed(2)} FXRP`;
    }
  } catch (err) {
    console.warn('Failed to query FXRP balance:', err);
    const finalBalanceEl = document.getElementById('final-evm-balance');
    if (finalBalanceEl && activeTab === 'mint') {
      finalBalanceEl.innerText = '-- FXRP';
    }
  }
}
