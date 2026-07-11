import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { executeXrplPaymentWithSeed } from './utils/payment_signer';
import { createPublicClient, http, formatEther, formatUnits, createWalletClient, custom } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flareTestnet } from 'viem/chains';
import { Client as XrplClient } from 'xrpl';
import * as QRCode from 'qrcode';

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
          You'll send XRP from your own wallet. FXRP arrives on Flare once the payment is verified — usually a few minutes.
        </p>

        <a href="#" id="how-works-link" style="font-size: 12px; color: var(--color-accent); text-decoration: none; font-weight: 500; align-self: flex-start; margin-top: 4px;">
          How this works
        </a>
        
        <div id="how-works-content" class="hidden" style="font-size: 12px; color: var(--text-muted); border-left: 2px solid var(--border-color); padding-left: 10px; margin-top: 8px; line-height: 1.4;">
          This widget uses FAssets v1.3 direct minting. Your recipient EVM address is securely encoded inside your payment transaction memo. The Flare Data Connector (FDC) verifies the payment trustlessly, allowing FXRP to be minted to your EVM address without relying on any trusted intermediary.
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

            document.getElementById('tech-evm-addr')!.innerText = evmAddress;
            document.getElementById('tech-xrpl-hash')!.innerText = paymentResult.txHash;
            document.getElementById('tech-asset-mgr')!.innerText = sdk['assetManagerAddress'] || 'Pending';

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
    document.getElementById('tech-evm-addr')!.innerText = evmAddress;
    document.getElementById('tech-xrpl-hash')!.innerText = paymentResult.txHash;
    document.getElementById('tech-asset-mgr')!.innerText = sdk['assetManagerAddress'] || 'Pending';

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
        
        // Display minted FXRP token balance (rather than native FLR gas token!)
        try {
          const publicClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
          const fAssetAddress = await publicClient.readContract({
            address: sdk['assetManagerAddress']!,
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
          document.getElementById('final-evm-balance')!.innerText = `${Number(formatted).toFixed(2)} FXRP`;
        } catch (err) {
          console.warn('Failed to query FXRP balance:', err);
          document.getElementById('final-evm-balance')!.innerText = '-- FXRP';
        }
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
