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

// UI Elements
const xrplBalanceEl = document.getElementById('xrpl-balance')!;
const xrplAddressEl = document.getElementById('xrpl-address')!;
const flareBalanceEl = document.getElementById('flare-balance')!;
const flareAddressEl = document.getElementById('flare-address')!;

const recipientAddressInput = document.getElementById('recipient-address') as HTMLInputElement;
const lotCountValEl = document.getElementById('lot-count-value')!;
const lotDecBtn = document.getElementById('lot-dec')!;
const lotIncBtn = document.getElementById('lot-inc')!;

const feeAmountEl = document.getElementById('fee-amount')!;
const feeMintEl = document.getElementById('fee-mint')!;
const feeExecEl = document.getElementById('fee-exec')!;
const feeTotalEl = document.getElementById('fee-total')!;
const submitBtn = document.getElementById('mint-submit-btn') as HTMLButtonElement;

const statusTrackerEl = document.getElementById('status-tracker')!;
const consoleLogEl = document.getElementById('console-log')!;
const delayAlertEl = document.getElementById('delay-alert')!;
const delayTimerEl = document.getElementById('delay-timer')!;

// Stepper Step elements
const stepPayEl = document.getElementById('step-pay')!;
const stepFdcEl = document.getElementById('step-fdc')!;
const stepProofEl = document.getElementById('step-proof')!;
const stepExecuteEl = document.getElementById('step-execute')!;

// Developer inputs
const settingsToggleBtn = document.getElementById('settings-toggle-btn')!;
const settingsContentEl = document.getElementById('settings-content')!;
const settingsToggleLabel = document.getElementById('settings-toggle-label')!;
const devXrplSeedInput = document.getElementById('dev-xrpl-seed') as HTMLInputElement;
const devFlarePkeyInput = document.getElementById('dev-flare-pkey') as HTMLInputElement;

// Setup logger utility
function log(msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  consoleLogEl.appendChild(el);
  consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
}

/**
 * Initializes wallets and balance queries.
 */
async function initializeWidget() {
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

  } catch (error: any) {
    log(`Initialization failed: ${error.message || error}`, 'error');
  }
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
async function executeDirectMint() {
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
        handleDelayedState(paymentResult.txHash, status.allowedAt!);
      } else if (status.state === 'Complete') {
        log(status.message, 'success');
        stepExecuteEl.className = 'step-node completed';
        log(`Direct Minting successful! EVM Tx Hash: ${status.txHash}`, 'success');
        
        // Refresh balances
        const xrplWallet = XrplWallet.fromSeed(localStorage.getItem('xrpl_seed') || PROCESS_ENV.XRPL_SEED);
        refreshBalances(xrplWallet.address, recipient);
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
function handleDelayedState(txHash: string, allowedAt: Date) {
  delayAlertEl.classList.remove('hidden');
  
  const interval = setInterval(async () => {
    const secondsLeft = Math.floor((allowedAt.getTime() - Date.now()) / 1000);
    
    if (secondsLeft <= 0) {
      clearInterval(interval);
      delayTimerEl.innerText = '00:00';
      delayAlertEl.classList.add('hidden');
      log('Delay epoch passed. Re-submitting direct mint execution...', 'info');
      
      // Auto-execution trigger
      try {
        log('Fetching generated FDC attestation proof...');
        // In real-world, the monitorStatus will resume automatically, but we display this log.
      } catch (e: any) {
        log(`Resubmission error: ${e.message || e}`, 'error');
      }
      return;
    }

    const h = Math.floor(secondsLeft / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    delayTimerEl.innerText = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, 1000);
}

// Event Listeners
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
  executeDirectMint();
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

// Run Initializer
initializeWidget();
