# FXRP Embed ⚡

**FXRP Embed** is a modular, high-fidelity, and trustless onboarding widget and SDK that enables any Flare dApp, wallet, or DeFi platform to integrate direct minting and redemption of **FXRP** (FAssets) from the XRP testnet in minutes.

Built for **Flare Summer Signal (Bounty 1: Interoperable Asset Products)**.

---

## 🚀 Key Features

* **Dual Direct Minting Routing Modes (FAssets v1.3):**
  * **Memo-Based Routing:** Encodes recipient EVM addresses directly into the XRPL `MemoData` field.
  * **Tag-Based Routing:** Binds recipient EVM addresses on-chain to reusable numerical Destination Tags via `IMintingTagManager` (`reserveMintingTag()`).
* **1-Tap Mobile XRPL Payment URIs & Pre-Filled QR Codes:**
  * Uses standard `xrpl://pay` payment URIs.
  * Scanning the canvas QR code or tapping **"📱 Pay in Xaman / Wallet"** opens Xaman (Xumm) or Bifrost with Destination Address, XRP Amount, and Memo/Tag **100% pre-filled automatically** — zero manual copy/pasting.
* **Flare Data Connector (FDC) Verification:**
  * Uses `XRPPayment` attestation type (`0x08`) to verify account-based XRPL transactions on-chain.
  * Automates voting round calculations and cryptographic Merkle proof retrieval from the Data Availability (DA) Layer.
* **Rate-Limiter Countdown Timer:**
  * Intercepts `0x40d8d67b` (`DirectMintingStillDelayed`) custom reverts and displays an automated countdown timer in the UI.
* **Unified EVM Wallet Error Translation:**
  * Translates raw wallet reverts (user rejections, insufficient C2FLR gas, chain mismatches, and agent vault payout dependencies) into human-readable notifications.
* **Embed Code Generator & Package Entrypoints:**
  * Live HTML/JS embed snippet generator in the demo app sidebar (`integrator-demo/index.html`).
  * Package entrypoint [`src/index.ts`](./src/index.ts) exports `FXRPDirectMintSDK`, `mountWidget`, `initializeWidget`, and core types.

---

## 💻 Integrator Usage

### 1. Two-Line HTML Embed
Integrators can embed the FXRP Direct Minting Widget into any dApp frontend in two lines:

```html
<!-- 1. Place mount target container -->
<div id="fxrp-mint-widget" data-theme="dark" data-accent="#00F0FF"></div>

<!-- 2. Import widget script -->
<script src="dist/widget.js"></script>
```

---

### 2. Programmatic SDK Usage

Integrators building custom UIs can import `FXRPDirectMintSDK` (`src/index.ts`):

```typescript
import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { createWalletClient, custom } from 'viem';
import { flareTestnet } from 'viem/chains';

// 1. Initialize SDK (Zero Custody — no private keys or seeds required in production!)
const sdk = new FXRPDirectMintSDK({
  xrplUrl: 'wss://clio.altnet.rippletest.net:51233',
  flareRpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  registryAddress: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
});

// 2. Fetch live protocol settings
const settings = await sdk.getSettings();
console.log(`Lot Size: ${settings.lotSizeXRP} XRP`);

// 3. Connect browser wallet (MetaMask, Bifrost, Rabby)
const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
const walletClient = createWalletClient({
  chain: flareTestnet,
  transport: custom(window.ethereum)
});
sdk.setWalletClient(walletClient, account);

// 4. Prepare payment parameters & memo encoding
const paymentParams = await sdk.preparePayment({
  recipientEvmAddress: account,
  lots: 1
});

console.log(`Vault Destination: ${paymentParams.vaultAddressXRP}`);
console.log(`Total XRP: ${paymentParams.totalXRP}`);
console.log(`Memo Hex: ${paymentParams.memoHex}`);
```

---

## 💻 Local Setup & Development

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Configure Environment (Optional for Automated Terminal Tests)
Create a `.env` file in the root directory:
```env
XRPL_SEED=sYourTestnetSeedKey
COSTON2_PRIVATE_KEY=0xYourFlarePrivateKey
```

### 3. Build & Run
* **Build Frontend Bundle:** Compiles and packages the widget for browser deployment:
  ```bash
  npm run build
  ```
* **Start Local Server:**
  ```bash
  npm run dev
  ```

Open your browser to:
* **Direct Minting Application:** `http://localhost:8080/index.html`
* **dApp Integrator Demo (Kinetic Finance):** `http://localhost:8080/integrator-demo/index.html`

---

## 📄 Documentation & Hackathon Write-Up

Full architecture diagrams, security boundary specifications, and hackathon submission details are in [`SUBMISSION.md`](./SUBMISSION.md).
