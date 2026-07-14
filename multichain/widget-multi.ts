/**
 * Mock/Controller Template for the Multi-Chain FAsset Onboarding Widget.
 * Shows how the UI switches between XRP, BTC, and DOGE, renders BIP-21 URIs,
 * and updates fee calculations dynamically using the FAssetMultiSDK.
 */

import { FAssetMultiSDK } from './FAssetMultiSDK';

export function initializeMultiWidget() {
  const container = document.getElementById('fxrp-mint-widget');
  if (!container) return;

  // Render the Multi-Chain Tab Selectors and Inputs
  container.innerHTML = `
    <main class="mint-card">
      <header class="dashboard-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 16px;">
        <h1 style="font-size: 15px; font-weight: bold; margin: 0; color: var(--text-primary);">FAsset Onboard Portal</h1>
        <div style="display: flex; gap: 6px;">
          <select id="asset-selector" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; font-size: 11px; color: var(--text-primary); cursor: pointer; font-weight: 600; font-family: inherit;">
            <option value="XRP">FXRP (Ripple)</option>
            <option value="BTC">FBTC (Bitcoin)</option>
            <option value="DOGE">FDOGE (Dogecoin)</option>
          </select>
          <div class="network-badge">Coston2</div>
        </div>
      </header>

      <!-- Multi-Chain Lot Inputs -->
      <section id="phase-idle">
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label" id="amount-label">Amount (Lots - 10 XRP each)</label>
          <div class="lot-incrementer" style="display: flex; align-items: center; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-primary);">
            <button type="button" id="btn-dec" style="flex: 1; padding: 10px; border: none; background: none; color: var(--text-primary); cursor: pointer; font-weight: bold;">-</button>
            <div id="lot-count-display" style="width: 60px; text-align: center; font-weight: bold; font-size: 14px; color: var(--text-primary);">1</div>
            <button type="button" id="btn-inc" style="flex: 1; padding: 10px; border: none; background: none; color: var(--text-primary); cursor: pointer; font-weight: bold;">+</button>
          </div>
        </div>

        <!-- Calculated Fees Card -->
        <div class="fees-card" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-size: 12px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Direct Mint Amount</span>
            <span id="txt-amount" style="font-weight: 600; color: var(--text-primary);">10.0 XRP</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Minter Protocol Fee</span>
            <span id="txt-fee" style="font-weight: 600; color: var(--text-primary);">0.1 XRP</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Executor Bounty Fee</span>
            <span id="txt-executor" style="font-weight: 600; color: var(--text-primary);">0.1 XRP</span>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--border-color); padding-top: 8px; font-weight: bold;">
            <span style="color: var(--text-primary);">Total Required Payment</span>
            <span id="txt-total" style="color: var(--color-accent);">10.2 XRP</span>
          </div>
        </div>

        <!-- Interactive Lot Estimator Slider -->
        <div style="margin-top: 12px; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px;">
          <label style="font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 4px;">Convert balance to Lots</label>
          <input type="number" id="xrp-estimator-input" placeholder="Type raw amount..." style="width: 100%; box-sizing: border-box; padding: 6px; font-size: 11px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-family: inherit; outline: none;" />
          <div id="estimator-output" style="margin-top: 4px; color: var(--text-muted);"></div>
        </div>

        <button id="btn-action" style="width: 100%; margin-top: 16px; padding: 12px; border-radius: 6px; border: none; background: var(--color-accent); color: #ffffff; font-weight: bold; cursor: pointer; transition: opacity 0.15s ease;">Connect Wallet & Onboard</button>
      </section>

      <!-- Payment / QR Scan Phase (hidden by default) -->
      <section id="phase-payment" class="hidden" style="text-align: center; padding: 10px 0;">
        <h3 style="font-size: 13px; font-weight: bold; color: var(--text-primary); margin-bottom: 6px;">Scan & Pay</h3>
        <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 12px;">Scan using your mobile wallet to broadcast the transaction.</span>
        
        <div style="background: #ffffff; border: 1px solid var(--border-color); display: inline-block; padding: 10px; border-radius: 8px; margin-bottom: 12px;">
          <canvas id="qr-canvas" style="width: 200px; height: 200px;"></canvas>
        </div>

        <div style="text-align: left; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; word-break: break-all;">
          <strong>Target Address:</strong> <span id="pay-address"></span><br/>
          <strong>Required Memo Payload:</strong> <span id="pay-payload"></span>
        </div>
      </section>
    </main>
  `;

  // UI elements
  const assetSelector = document.getElementById('asset-selector') as HTMLSelectElement;
  const labelAmount = document.getElementById('amount-label');
  const txtAmount = document.getElementById('txt-amount');
  const txtFee = document.getElementById('txt-fee');
  const txtExecutor = document.getElementById('txt-executor');
  const txtTotal = document.getElementById('txt-total');
  
  let currentLots = 1;
  let activeAsset: 'XRP' | 'BTC' | 'DOGE' = 'XRP';

  const updateUIValues = () => {
    let multiplier = 10; // XRP
    let symbol = 'XRP';
    if (activeAsset === 'BTC') {
      multiplier = 0.0001; // Mock BTC lot size (e.g. 10,000 satoshis)
      symbol = 'BTC';
      if (labelAmount) labelAmount.innerText = 'Amount (Lots - 10,000 Satoshis each)';
    } else if (activeAsset === 'DOGE') {
      multiplier = 100; // DOGE lot size
      symbol = 'DOGE';
      if (labelAmount) labelAmount.innerText = 'Amount (Lots - 100 DOGE each)';
    } else {
      if (labelAmount) labelAmount.innerText = 'Amount (Lots - 10 XRP each)';
    }

    const baseAmount = currentLots * multiplier;
    const fee = baseAmount * 0.01; // 1% mock
    const execFee = multiplier * 0.01;
    const total = baseAmount + fee + execFee;

    if (txtAmount) txtAmount.innerText = `${baseAmount.toFixed(activeAsset === 'BTC' ? 5 : 1)} ${symbol}`;
    if (txtFee) txtFee.innerText = `${fee.toFixed(activeAsset === 'BTC' ? 5 : 1)} ${symbol}`;
    if (txtExecutor) txtExecutor.innerText = `${execFee.toFixed(activeAsset === 'BTC' ? 5 : 1)} ${symbol}`;
    if (txtTotal) txtTotal.innerText = `${total.toFixed(activeAsset === 'BTC' ? 5 : 1)} ${symbol}`;
  };

  assetSelector.addEventListener('change', () => {
    activeAsset = assetSelector.value as 'XRP' | 'BTC' | 'DOGE';
    updateUIValues();
  });

  document.getElementById('btn-inc')?.addEventListener('click', () => {
    currentLots++;
    const display = document.getElementById('lot-count-display');
    if (display) display.innerText = currentLots.toString();
    updateUIValues();
  });

  document.getElementById('btn-dec')?.addEventListener('click', () => {
    if (currentLots > 1) {
      currentLots--;
      const display = document.getElementById('lot-count-display');
      if (display) display.innerText = currentLots.toString();
      updateUIValues();
    }
  });

  // Action button trigger (Simulation details)
  document.getElementById('btn-action')?.addEventListener('click', () => {
    const idleSection = document.getElementById('phase-idle');
    const paymentSection = document.getElementById('phase-payment');
    
    if (idleSection && paymentSection) {
      idleSection.classList.add('hidden');
      paymentSection.classList.remove('hidden');
    }

    // BIP-21 URI Generation simulation for UTXO
    const payAddr = document.getElementById('pay-address');
    const payPayload = document.getElementById('pay-payload');
    
    if (activeAsset === 'BTC') {
      if (payAddr) payAddr.innerText = 'tb1q96gq8... (coston2 direct BTC gateway)';
      if (payPayload) payPayload.innerText = 'OP_RETURN: 0x464250526641001800000000[UserEVMAddress]';
    } else if (activeAsset === 'DOGE') {
      if (payAddr) payAddr.innerText = 'ndoge55gq8... (coston2 direct DOGE gateway)';
      if (payPayload) payPayload.innerText = 'OP_RETURN: 0x464250526641001800000000[UserEVMAddress]';
    } else {
      if (payAddr) payAddr.innerText = 'rDhpmiPq4BV... (coston2 direct XRP gateway)';
      if (payPayload) payPayload.innerText = 'MemoHex: 464250526641001800000000[UserEVMAddress]';
    }
  });
}
