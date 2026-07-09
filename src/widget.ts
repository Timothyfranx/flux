import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { createPublicClient, http, formatEther } from 'viem';
import { Client as XrplClient, Wallet as XrplWallet } from 'xrpl';

// Fallback values injected during esbuild build step
declare const PROCESS_ENV: {
  XRPL_SEED: string;
  COSTON2_PRIVATE_KEY: string;
};

// Coston2 constants
const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const XRPL_URL = 'wss://s.altnet.rippletest.net:51233';
const FLARE_RPC_URL = 'https://coston2-api.flare.network/ext/C/rpc';

let sdk: FXRPDirectMintSDK;
let currentLots = 1;
let lotSizeXRP = 10;
let minterFeeShareBIPS = 10; // 0.1% default
let executorFeeXRP = 0.1;
let minimumFeeXRP = 0.1;

// UI Elements (bound at mount-time)
let xrplBalanceEl: HTMLElement;
let xrplAddressEl: HTMLElement;
let flareBalanceEl: HTMLElement;
let flareAddressEl: HTMLElement;

let recipientAddressInput: HTMLInputElement;
let lotCountValEl: HTMLElement;
let lotDecBtn: HTMLElement;
let lotIncBtn: HTMLElement;

let feeAmountEl: HTMLElement;
let feeMintEl: HTMLElement;
let feeExecEl: HTMLElement;
let feeTotalEl: HTMLElement;
let submitBtn: HTMLButtonElement;

let statusTrackerEl: HTMLElement;
let consoleLogEl: HTMLElement;
let delayAlertEl: HTMLElement;
let delayTimerEl: HTMLElement;

let stepPayEl: HTMLElement;
let stepFdcEl: HTMLElement;
let stepProofEl: HTMLElement;
let stepExecuteEl: HTMLElement;

let settingsToggleBtn: HTMLElement;
let settingsContentEl: HTMLElement;
let settingsToggleLabel: HTMLElement;
let devXrplSeedInput: HTMLInputElement;
let devFlarePkeyInput: HTMLInputElement;

// Setup logger utility
function log(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  if (!consoleLogEl) return;
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  consoleLogEl.appendChild(el);
  consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
}

/**
 * Injects the widget layout into the target container.
 */
function mountWidget() {
  const container = document.getElementById('fxrp-mint-widget');
  if (!container) {
    console.warn('FXRP Mint Widget: #fxrp-mint-widget container not found on this page.');
    return false;
  }

  container.innerHTML = `
    <main class="glass-card">
      <header class="dashboard-header">
        <div class="logo-container">
          <h1 id="main-heading">FXRP Direct Mint</h1>
        </div>
        <div class="network-badge" id="net-badge">Coston2 Testnet</div>
      </header>

      <div class="dashboard-grid">
        <section class="wallets-panel" aria-label="Wallet Configuration Status">
          <div class="wallet-card" id="xrpl-wallet-card">
            <div class="wallet-meta">
              <span class="wallet-label">XRPL Minter Wallet</span>
              <span class="wallet-balance" id="xrpl-balance">-- XRP</span>
            </div>
            <div class="wallet-address" id="xrpl-address" title="Click to copy">Connecting...</div>
          </div>
          
          <div class="wallet-card" id="flare-wallet-card">
            <div class="wallet-meta">
              <span class="wallet-label">Flare Gas Account</span>
              <span class="wallet-balance" id="flare-balance">-- C2FLR</span>
            </div>
            <div class="wallet-address" id="flare-address" title="Click to copy">Connecting...</div>
          </div>
        </section>

        <section class="mint-form-panel" aria-label="Mint Request Form">
          <form class="mint-form" id="mint-form" onsubmit="return false;">
            <div class="form-group">
              <label class="form-label" for="recipient-address">Recipient EVM Address</label>
              <div class="input-container">
                <input type="text" id="recipient-address" class="form-input" placeholder="0x..." required pattern="^0x[a-fA-F0-9]{40}$">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="lot-count">Amount (Lots)</label>
              <div class="lot-incrementer">
                <button type="button" class="lot-btn" id="lot-dec">-</button>
                <div class="lot-value" id="lot-count-value">1</div>
                <button type="button" class="lot-btn" id="lot-inc">+</button>
              </div>
            </div>

            <div class="fees-card" aria-label="Fee details">
              <div class="fee-row">
                <span>Direct Mint Amount</span>
                <span id="fee-amount">10.0 XRP</span>
              </div>
              <div class="fee-row">
                <span>Protocol Minting Fee (0.1%)</span>
                <span id="fee-mint">0.1 XRP</span>
              </div>
              <div class="fee-row">
                <span>Executor Bounty Reward</span>
                <span id="fee-exec">0.1 XRP</span>
              </div>
              <div class="fee-row total">
                <span>Total Payment Required</span>
                <span id="fee-total">10.2 XRP</span>
              </div>
            </div>

            <button type="submit" class="action-btn" id="mint-submit-btn" disabled>
              <span>Initialize Direct Mint</span>
            </button>
          </form>
        </section>
      </div>

      <section class="status-tracker hidden" id="status-tracker" aria-label="Attestation progress">
        <h2 class="tracker-title">Attestation & Verification Progress</h2>
        
        <div class="stepper">
          <div class="step-node active" id="step-pay">
            <div class="step-dot">1</div>
            <div class="step-label">Payment</div>
          </div>
          <div class="step-node" id="step-fdc">
            <div class="step-dot">2</div>
            <div class="step-label">FDC Request</div>
          </div>
          <div class="step-node" id="step-proof">
            <div class="step-dot">3</div>
            <div class="step-label">Proof Ready</div>
          </div>
          <div class="step-node" id="step-execute">
            <div class="step-dot">4</div>
            <div class="step-label">Minted</div>
          </div>
        </div>

        <div class="console-log" id="console-log" aria-live="polite">
          <div class="log-entry info">Console logger initialized... awaiting action.</div>
        </div>

        <div class="delay-alert hidden" id="delay-alert">
          <div class="delay-icon">⚠️</div>
          <div class="delay-text">
            <div class="delay-title">Direct Minting Saturated</div>
            <div class="delay-desc">The protocol rate limits are currently exceeded. Minting will automatically execute when allowed.</div>
          </div>
          <div class="delay-countdown" id="delay-timer">00:00</div>
        </div>
      </section>

      <section class="settings-panel" aria-label="Developer Settings Panel">
        <div class="settings-header" id="settings-toggle-btn">
          <span class="settings-title">Developer Settings</span>
          <span class="settings-toggle" id="settings-toggle-label">Expand</span>
        </div>
        
        <div class="settings-content hidden" id="settings-content">
          <div class="form-group">
            <label class="form-label" for="dev-xrpl-seed">XRPL Seed Key (Testnet)</label>
            <input type="password" id="dev-xrpl-seed" class="form-input" placeholder="s...">
          </div>
          <div class="form-group">
            <label class="form-label" for="dev-flare-pkey">COSTON2 EVM Private Key</label>
            <input type="password" id="dev-flare-pkey" class="form-input" placeholder="0x...">
          </div>
          <div style="font-size: 11px; color: var(--text-dimmed); line-height: 1.4;">
            Note: Private keys are stored purely locally in your browser's localStorage and never leave the client. Leave blank to default to pre-configured testnet credentials.
          </div>
        </div>
      </section>
    </main>
  `;

  // Bind elements
  xrplBalanceEl = document.getElementById('xrpl-balance')!;
  xrplAddressEl = document.getElementById('xrpl-address')!;
  flareBalanceEl = document.getElementById('flare-balance')!;
  flareAddressEl = document.getElementById('flare-address')!;
  recipientAddressInput = document.getElementById('recipient-address') as HTMLInputElement;
  lotCountValEl = document.getElementById('lot-count-value')!;
  lotDecBtn = document.getElementById('lot-dec')!;
  lotIncBtn = document.getElementById('lot-inc')!;
  feeAmountEl = document.getElementById('fee-amount')!;
  feeMintEl = document.getElementById('fee-mint')!;
  feeExecEl = document.getElementById('fee-exec')!;
  feeTotalEl = document.getElementById('fee-total')!;
  submitBtn = document.getElementById('mint-submit-btn') as HTMLButtonElement;
  statusTrackerEl = document.getElementById('status-tracker')!;
  consoleLogEl = document.getElementById('console-log')!;
  delayAlertEl = document.getElementById('delay-alert')!;
  delayTimerEl = document.getElementById('delay-timer')!;
  stepPayEl = document.getElementById('step-pay')!;
  stepFdcEl = document.getElementById('step-fdc')!;
  stepProofEl = document.getElementById('step-proof')!;
  stepExecuteEl = document.getElementById('step-execute')!;
  settingsToggleBtn = document.getElementById('settings-toggle-btn')!;
  settingsContentEl = document.getElementById('settings-content')!;
  settingsToggleLabel = document.getElementById('settings-toggle-label')!;
  devXrplSeedInput = document.getElementById('dev-xrpl-seed') as HTMLInputElement;
  devFlarePkeyInput = document.getElementById('dev-flare-pkey') as HTMLInputElement;

  return true;
}

/**
 * Initializes wallets and balance queries.
 */
async function initializeWidget() {
  if (!mountWidget()) return;

  log('Initializing widget connection components...');
  
  // Load values from localStorage or default environment variables
  let xrplSeed = localStorage.getItem('xrpl_seed') || '';
  let flarePkey = localStorage.getItem('flare_pkey') || '';

  if (!xrplSeed && typeof PROCESS_ENV !== 'undefined') {
    xrplSeed = PROCESS_ENV.XRPL_SEED;
  }
  if (!flarePkey && typeof PROCESS_ENV !== 'undefined') {
    flarePkey = PROCESS_ENV.COSTON2_PRIVATE_KEY;
  }

  // Set inputs if they exist
  devXrplSeedInput.value = xrplSeed;
  devFlarePkeyInput.value = flarePkey;

  if (!xrplSeed || !flarePkey) {
    log('Warning: No developer credentials found. Provide keys in developer settings.', 'warning');
    return;
  }

  try {
    // 1. Setup wallets
    const xrplWallet = XrplWallet.fromSeed(xrplSeed);
    const evmAccount = require('viem/accounts').privateKeyToAccount(flarePkey);

    xrplAddressEl.innerText = xrplWallet.address;
    flareAddressEl.innerText = evmAccount.address;
    recipientAddressInput.value = evmAccount.address;

    // Initialize main SDK
    sdk = new FXRPDirectMintSDK({
      xrplSeed,
      xrplUrl: XRPL_URL,
      flarePrivateKey: flarePkey,
      flareRpcUrl: FLARE_RPC_URL,
      registryAddress: REGISTRY_ADDRESS,
    });

    log('Dynamic contract configuration fetch in progress...');
    const settings = await sdk.getSettings();
    lotSizeXRP = settings.lotSizeXRP;
    minterFeeShareBIPS = settings.minterFeeShareBIPS;
    executorFeeXRP = settings.executorFeeXRP;
    minimumFeeXRP = settings.mintingFeeXRP;

    log(`AssetManager loaded at address ${settings.assetManagerAddress}.`, 'success');
    log(`Lot size resolved: ${lotSizeXRP} XRP.`);

    // 2. Fetch balances
    await refreshBalances(xrplWallet.address, evmAccount.address);

    updateFeeBreakdown();
    submitBtn.disabled = false;

    // Setup Event Listeners
    setupEventListeners(xrplWallet.address, evmAccount.address);

  } catch (error: any) {
    log(`Initialization failed: ${error.message || error}`, 'error');
  }
}

/**
 * Configures listeners for input changes and button clicks.
 */
function setupEventListeners(xrplAddress: string, evmAddress: string) {
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

  submitBtn.addEventListener('click', () => {
    executeDirectMint(xrplAddress, evmAddress);
  });

  settingsToggleBtn.addEventListener('click', () => {
    const isHidden = settingsContentEl.classList.contains('hidden');
    if (isHidden) {
      settingsContentEl.classList.remove('hidden');
      settingsToggleLabel.innerText = 'Collapse';
    } else {
      settingsContentEl.classList.add('hidden');
      settingsToggleLabel.innerText = 'Expand';
    }
  });

  devXrplSeedInput.addEventListener('change', () => {
    localStorage.setItem('xrpl_seed', devXrplSeedInput.value.trim());
    log('XRPL Seed key updated. Re-initializing...', 'info');
    initializeWidget();
  });

  devFlarePkeyInput.addEventListener('change', () => {
    localStorage.setItem('flare_pkey', devFlarePkeyInput.value.trim());
    log('Flare Private key updated. Re-initializing...', 'info');
    initializeWidget();
  });
}

/**
 * Queries and updates XRPL and C2FLR balances in the UI.
 */
async function refreshBalances(xrplAddress: string, evmAddress: string) {
  try {
    // Fetch XRPL balance
    const xrplClient = new XrplClient(XRPL_URL);
    await xrplClient.connect();
    const xrplInfo = await xrplClient.request({
      command: 'account_info',
      account: xrplAddress,
    });
    await xrplClient.disconnect();
    
    const xrpBalance = Number(xrplInfo.result.account_data.Balance) / 1e6;
    xrplBalanceEl.innerText = `${xrpBalance.toFixed(2)} XRP`;

    // Fetch Flare balance
    const publicClient = createPublicClient({
      transport: http(FLARE_RPC_URL),
    });
    const flareBalanceWei = await publicClient.getBalance({ address: evmAddress as `0x${string}` });
    const c2flrBalance = formatEther(flareBalanceWei);
    flareBalanceEl.innerText = `${Number(c2flrBalance).toFixed(2)} C2FLR`;

  } catch (error: any) {
    console.error('Balance fetch failed:', error);
  }
}

/**
 * Updates the calculated fee card in the UI based on lots.
 */
function updateFeeBreakdown() {
  const amountXRP = currentLots * lotSizeXRP;
  const percentageFee = (amountXRP * minterFeeShareBIPS) / 10000;
  const mintingFeeXRP = Math.max(percentageFee, minimumFeeXRP);
  const totalXRP = amountXRP + mintingFeeXRP + executorFeeXRP;

  feeAmountEl.innerText = `${amountXRP.toFixed(1)} XRP`;
  feeMintEl.innerText = `${mintingFeeXRP.toFixed(2)} XRP`;
  feeExecEl.innerText = `${executorFeeXRP.toFixed(2)} XRP`;
  feeTotalEl.innerText = `${totalXRP.toFixed(2)} XRP`;
}

/**
 * Executes the Direct Minting flow programmatically using the SDK.
 */
async function executeDirectMint(xrplAddress: string, evmAddress: string) {
  submitBtn.disabled = true;
  statusTrackerEl.classList.remove('hidden');
  
  // Reset steps classes
  stepPayEl.className = 'step-node active';
  stepFdcEl.className = 'step-node';
  stepProofEl.className = 'step-node';
  stepExecuteEl.className = 'step-node';
  delayAlertEl.classList.add('hidden');

  log('Preparing Direct Minting parameters...');
  const recipient = recipientAddressInput.value;

  try {
    const paymentParams = await sdk.preparePayment({
      recipientEvmAddress: recipient,
      lots: currentLots,
    });

    log(`Prepared memoHex: ${paymentParams.memoHex}`);
    log(`Vault XRP address: ${paymentParams.vaultAddressXRP}`);
    log(`Sending payment of ${paymentParams.totalXRP} XRP on XRPL...`);

    // 1. Send Payment on XRPL
    const paymentResult = await sdk.executePayment(paymentParams);
    log(`XRPL Payment broadcasted! Hash: ${paymentResult.txHash}`, 'success');
    log('Waiting for at least 3 validations on XRPL...', 'info');

    stepPayEl.className = 'step-node completed';
    stepFdcEl.className = 'step-node active';

    // 2. Submit and track attestation status
    await sdk.monitorStatus(paymentResult, (status) => {
      if (status.state === 'FdcRequested') {
        log(status.message, 'info');
        stepFdcEl.className = 'step-node completed';
        stepProofEl.className = 'step-node active';
      } else if (status.state === 'FdcProofReady') {
        log(status.message, 'success');
        stepProofEl.className = 'step-node completed';
        stepExecuteEl.className = 'step-node active';
      } else if (status.state === 'SubmittingFinalization') {
        log(status.message, 'info');
      } else if (status.state === 'Delayed') {
        log(status.message, 'warning');
        handleDelayedState(recipient, status.allowedAt!);
      } else if (status.state === 'Complete') {
        log(status.message, 'success');
        stepExecuteEl.className = 'step-node completed';
        log(`Direct Minting successful! EVM Tx Hash: ${status.txHash}`, 'success');
        
        // Refresh balances
        refreshBalances(xrplAddress, recipient);
        submitBtn.disabled = false;
      } else if (status.state === 'Failed') {
        log(status.message, 'error');
        if (status.error) {
          console.error(status.error);
        }
        submitBtn.disabled = false;
      }
    });

  } catch (error: any) {
    log(`Execution failed: ${error.message || error}`, 'error');
    submitBtn.disabled = false;
  }
}

/**
 * Handles the rate-limited delay state. Shows the warning panel and counts down.
 */
function handleDelayedState(recipientAddress: string, allowedAt: Date) {
  delayAlertEl.classList.remove('hidden');
  
  const interval = setInterval(async () => {
    const secondsLeft = Math.floor((allowedAt.getTime() - Date.now()) / 1000);
    
    if (secondsLeft <= 0) {
      clearInterval(interval);
      delayTimerEl.innerText = '00:00';
      delayAlertEl.classList.add('hidden');
      log('Delay epoch passed. Re-submitting direct mint execution...', 'info');
      return;
    }

    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    delayTimerEl.innerText = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, 1000);
}

// Run Initializer on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget);
} else {
  initializeWidget();
}
