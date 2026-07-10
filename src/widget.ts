import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { createPublicClient, http, formatEther, createWalletClient, custom } from 'viem';
import { flareTestnet } from 'viem/chains';
import { Client as XrplClient, Wallet as XrplWallet } from 'xrpl';

// Injected during bundling
declare const PROCESS_ENV: {
  XRPL_SEED: string;
  COSTON2_PRIVATE_KEY: string;
};

// Coston2 Constants
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

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
    <main class="glass-card">
      <header class="dashboard-header">
        <div class="logo-container">
          <h1>FXRP Direct Mint</h1>
        </div>
        <div class="network-badge">Coston2 Testnet</div>
      </header>

      <!-- Idle / Entry Phase -->
      <section id="phase-idle" class="mint-form">
        <div class="form-group">
          <label class="form-label" for="lot-count">Amount (Lots - 10 XRP each)</label>
          <div class="lot-incrementer">
            <button type="button" class="lot-btn" id="lot-dec">-</button>
            <div class="lot-value" id="lot-count-value">1</div>
            <button type="button" class="lot-btn" id="lot-inc">+</button>
          </div>
        </div>

        <div class="fees-card">
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

        <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-top: 4px;">
          You'll send XRP from your own wallet. WFLR/FXRP arrives on Flare once the payment is verified — usually a few minutes.
        </p>

        <a href="#" id="how-works-link" style="font-size: 12px; color: var(--color-accent); text-decoration: none; font-weight: 500; align-self: flex-start; margin-top: 4px;">
          How this works
        </a>
        
        <div id="how-works-content" class="hidden" style="font-size: 12px; color: var(--text-muted); border-left: 2px solid var(--border-color); padding-left: 10px; margin-top: 8px; line-height: 1.4;">
          This widget uses FAssets v1.3 direct minting. Your recipient EVM address is securely encoded inside your payment transaction memo. The Flare Data Connector (FDC) verifies the payment trustlessly, allowing WFLR/FXRP to be minted to your EVM address without relying on any trusted intermediary.
        </div>

        <button type="button" class="action-btn" id="btn-initialize-mint" style="margin-top: 16px;">
          Connect EVM Wallet & Mint
        </button>
      </section>

      <!-- Awaiting Payment Phase -->
      <section id="phase-payment" class="hidden" style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="font-size: 14px; font-weight: 600;">Submit XRP Payment</h3>
        
        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
          Send exactly the required XRP amount to the destination vault address using your XRPL wallet. You <strong>MUST</strong> include the memo payload.
        </p>

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
          <strong>Warning:</strong> This memo must be included exactly, or funds cannot be matched to your mint.
        </div>

        <!-- Testing Simulation Provider (Explicit Separation) -->
        <div class="wallet-prompt-box">
          <div class="wallet-prompt-title">Developer Testing Simulation</div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 4px;">
            Simulate signing this payment transaction using the pre-funded testing XRPL seed.
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
          Your WFLR/FXRP tokens have been successfully minted and deposited to your EVM account on Coston2.
        </p>
        
        <div class="wallet-card" style="margin: 0 auto; width: 100%; max-width: 320px;">
          <div class="wallet-meta">
            <span class="wallet-label">Deposited WFLR/FXRP Balance</span>
            <span id="final-evm-balance" style="font-weight: 600;">-- C2FLR</span>
          </div>
        </div>

        <button type="button" class="action-btn" id="btn-complete-continue" style="margin-top: 12px; width: 100%;">
          Continue
        </button>
      </section>
    </main>
  `;

  return true;
}

/**
 * Connects browser wallet (MetaMask/Bifrost) dynamically using window.ethereum.
 */
async function connectBrowserWallet(): Promise<boolean> {
  const provider = (window as any).ethereum;
  if (!provider) {
    alert('Please install or open an EVM browser wallet (e.g. Bifrost or MetaMask) to finalize the mint on Flare.');
    return false;
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      alert('EVM account connection rejected.');
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
    alert(`Wallet connection failed: ${error.message || error}`);
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

  document.getElementById('btn-initialize-mint')!.addEventListener('click', async () => {
    const connected = await connectBrowserWallet();
    if (connected) {
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

  // Simulate payment (Xaman simulated provider)
  document.getElementById('btn-simulate-payment')!.addEventListener('click', () => {
    simulatePaymentSigning();
  });

  // Reset/Continue button on success
  document.getElementById('btn-complete-continue')!.addEventListener('click', () => {
    // Reset to idle phase
    document.getElementById('phase-complete')!.classList.add('hidden');
    document.getElementById('phase-idle')!.classList.remove('hidden');
    currentLots = 1;
    lotCountValEl.innerText = '1';
    updateFeeBreakdown();
  });
}

/**
 * Simulated Payment Signer using test credentials (encapsulated for developers/testers only).
 */
async function simulatePaymentSigning() {
  document.getElementById('phase-payment')!.classList.add('hidden');
  document.getElementById('phase-tracker')!.classList.remove('hidden');
  
  log('Initializing simulated wallet payment signing...');
  
  let xrplSeed = '';
  if (typeof PROCESS_ENV !== 'undefined') {
    xrplSeed = PROCESS_ENV.XRPL_SEED;
  }

  if (!xrplSeed) {
    log('Simulation error: Developer testing seed not configured.', 'error');
    return;
  }

  try {
    const paymentParams: any = {
      vaultAddressXRP: vaultAddressXRP,
      recipientEvmAddress: evmAddress,
      lots: currentLots,
      totalXRP: targetXRP,
      memoHex: memoHex,
    };

    // We create a temporary SDK config with the seed purely for simulating the payment
    const simulationSdk = new FXRPDirectMintSDK({
      xrplSeed,
      xrplUrl: XRPL_URL,
      flareRpcUrl: FLARE_RPC_URL,
      registryAddress: REGISTRY_ADDRESS,
    });

    log(`Prepared transaction: Destination = ${vaultAddressXRP}, Amount = ${targetXRP} XRP`);
    log('Requesting signature authorization from simulated provider...');

    // 1. Submit XRP Payment
    const paymentResult = await simulationSdk.executePayment(paymentParams);
    
    // Update tracker details
    document.getElementById('tech-evm-addr')!.innerText = evmAddress;
    document.getElementById('tech-xrpl-hash')!.innerText = paymentResult.txHash;
    document.getElementById('tech-asset-mgr')!.innerText = sdk['assetManagerAddress'] || 'Pending';

    document.getElementById('step-pay')!.className = 'step-node completed';
    document.getElementById('step-fdc')!.className = 'step-node active';
    log(`Simulated payment sent successfully! Hash: ${paymentResult.txHash}`, 'success');

    // 2. Track FDC attestation and finalization
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
          
          // Display WFLR balance
          try {
            const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
            const balanceWei = await publicClient.getBalance({ address: evmAddress as `0x${string}` });
            document.getElementById('final-evm-balance')!.innerText = `${Number(formatEther(balanceWei)).toFixed(2)} C2FLR`;
          } catch {
            document.getElementById('final-evm-balance')!.innerText = '-- C2FLR';
          }
        }, 1500);

      } else if (status.state === 'Failed') {
        log(status.message, 'error');
        if (status.error) {
          console.error(status.error);
        }
      }
    });

  } catch (error: any) {
    log(`Simulation process failed: ${error.message || error}`, 'error');
  }
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
