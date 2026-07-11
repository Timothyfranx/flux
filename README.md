# FXRP Embed ⚡

**FXRP Embed** is a modular, high-fidelity, and trustless onboarding widget and SDK that enables any Flare dApp, wallet, or exchange to integrate direct minting of **FXRP** (FAssets) from XRP testnet in minutes.

Built for **Flare Summer Signal (Bounty 1: Interoperable Asset Products)**.

---

## 🚀 The Integration UX

Integrators can embed the full, premium FXRP Direct Minting Dashboard into their app with just two lines of code:

```html
<!-- 1. Place the mount container anywhere in your HTML -->
<div id="fxrp-mint-widget"></div>

<!-- 2. Import stylesheet and script -->
<link rel="stylesheet" href="style.css">
<script src="dist/widget.js"></script>
```

Upon loading, the script self-mounts the dashboard inside the container, automatically resolving FAsset settings and loading balances.

---

## 🛠️ Programmatic SDK Usage

Integrators who want to build their own custom UI can use the underlying `@flux/sdk` (`FXRPDirectMintSDK` class) programmatically:

```typescript
import { FXRPDirectMintSDK } from './FXRPDirectMintSDK';
import { createWalletClient, custom } from 'viem';
import { flareTestnet } from 'viem/chains';

// 1. Initialize the SDK (Zero Custody — no private keys or seeds required!)
const sdk = new FXRPDirectMintSDK({
  xrplUrl: 'wss://s.altnet.rippletest.net:51233',
  flareRpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  registryAddress: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
});

// 2. Fetch live settings
const settings = await sdk.getSettings();
console.log(`Lot Size: ${settings.lotSizeXRP} XRP`);

// 3. Connect user's EVM browser wallet (e.g. Bifrost or MetaMask)
const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
const walletClient = createWalletClient({
  chain: flareTestnet,
  transport: custom(window.ethereum)
});
sdk.setWalletClient(walletClient, account);

// 4. Prepare payment details & binary memo encoding
const paymentParams = await sdk.preparePayment({
  recipientEvmAddress: account,
  lots: 1
});

console.log(`Vault Destination: ${paymentParams.vaultAddressXRP}`);
console.log(`Expected XRP: ${paymentParams.totalXRP}`);
console.log(`Encoded Memo: ${paymentParams.memoHex}`);

// 5. User submits the transaction from their XRP wallet (e.g. scanning QR code)
// 6. Monitor progress through FDC proof & finalization on Flare
const paymentResult = {
  txHash: '0xYourXRPLPaymentTransactionHash',
  blockTimestamp: 1783607782, // Unix timestamp of payment validation
  spentAmountDrops: '10200000',
  receivedAmountDrops: '10200000',
  receivingAddressXRP: paymentParams.vaultAddressXRP,
};

await sdk.monitorStatus(paymentResult, (status) => {
  console.log(`State: ${status.state} | Message: ${status.message}`);
  if (status.state === 'Delayed') {
    console.log(`Limiter hit. Allowed to execute at: ${status.allowedAt}`);
  }
});
```

---

## ⚡ Direct Minting & FDC Mechanics

The SDK and Widget participate in the **FAssets v1.3 Direct Minting** architecture on Flare Coston2 testnet:
1. **Memo-Based Routing:** Formats the recipient EVM address into a 32-byte direct-minting binary memo, allowing trustless, database-free destination resolution directly from the XRPL payment.
2. **FDC Attestation Verification:** Prepares attestation bytes and requests FDC validation (`XRPPayment`) on-chain via the `FdcHub` contract.
3. **Data Availability (DA) Layer Retrieval:** Calculates FDC voting rounds using `IFlareSystemsManager` parameters, fetches cryptographic validation proofs, and decodes the `response_hex` payload.
4. **Limiter & Delay State Management:** Automatically captures custom error `0x40d8d67b` (Direct Minting Limiter Delay). Instead of silently failing, the SDK decodes the revert cause, queries `directMintingDelayState` to extract the `allowedAt` unlock timestamp, and starts a countdown timer to auto-execute when rate limits clear.

---

## 💻 Local Setup & Development

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
XRPL_SEED=sYourTestnetSeedKey
COSTON2_PRIVATE_KEY=0xYourFlarePrivateKey
```

### 3. Build & Run
* **Build Frontend Bundle:** Compiles and packages the SDK and widget for the browser:
  ```bash
  npm run build
  ```
* **Start Dev Server:** Launches a lightweight local HTTP server:
  ```bash
  npm run dev
  ```

Open your browser and navigate to:
* **Standalone Dashboard:** `http://localhost:8080/index.html`
* **DeFi Integrator Demo (Kinetic Finance):** `http://localhost:8080/integrator-demo/index.html`
