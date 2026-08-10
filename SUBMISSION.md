# Hackathon Submission: FXRP Embed ⚡

**Bounty Focus:** Bounty 1 — Interoperable Asset Products (Flare Summer Signal)

---

## 1. Executive Summary

**FXRP Embed** is an embeddable direct-mint widget and SDK for Flare (Bounty 1):

> *Recipient EVM address is encoded in an XRPL memo or reserved tag, Flare Data Connector (FDC) verifies the payment on-chain, and AssetManager mints FXRP trustlessly to the user's wallet.*

By providing a drop-in component (`<fxrp-widget></fxrp-widget>`) and zero-custody TypeScript SDK, FXRP Embed eliminates the multi-step integration complexity for dApps onboarding XRP liquidity directly onto Flare.

---

## 2. Target User & Market Fit

### The Integrator (DeFi Protocols, Swaps, and Wallets)
*   **The Problem:** Integrating FAssets v1.3 direct minting requires handling complex binary memo encoding, listening to the XRPL ledger, requesting FDC attestations, querying the DA Layer for Merkle proofs, handling rate-limiter delay states, and submitting finalization transactions on Flare. 
*   **The Solution:** Integrators drop the FXRP Embed script into their frontend. The widget handles the entire payment tracking, attestation request, delay countdown, and finalization loop autonomously.

### The End User (XRP Holders entering Flare DeFi)
*   **The Problem:** Users want to convert their XRP to FXRP to earn yield on Flare without registering accounts or trusting centralized custodians.
*   **The Solution:** The user connects their EVM wallet, scans a locally-generated QR code with their mobile XRP wallet, and watches the progress bar tick as FXRP is minted directly to their account.

---

## 3. Technical Architecture & Flare Technology Integration

Under the hood, FXRP Embed is built on Flare’s core infrastructure protocols on the Coston2 testnet:

```mermaid
graph TD
    A[EVM Browser Wallet] -->|1. Connects Address| B(FXRP Embed Widget)
    B -->|2. Encodes EVM in Memo| C[XRP Payment QR Canvas]
    C -->|3. Scan & Pay| D[XRP Testnet Ledger]
    E[WebSocket Poller] -->|4. Detects Tx with MemoHex| D
    E -->|5. Triggers Attestation| F[FDC Verifier API]
    F -->|6. requestAttestation| G[FdcHub Contract]
    H[DA Layer API] -->|7. Fetches Merkle Proof| I[Voting Round Completed]
    H -->|8. Submits proof| J[AssetManager Contract]
    J -->|9. Mints FXRP| A
```

### Core Integrations:
1.  **FAssets `AssetManager` (`coston2.iAssetManagerAbi`):**
    *   Queries live lot size limits, minter fees, and executor bounties dynamically at initialization.
    *   Submits the final direct minting transaction on-chain via `executeDirectMinting()`.
    *   Queries the `fAsset()` address and dynamically fetches the token's `decimals()` to display the minted balance using `formatUnits` (maintaining 6-decimal precision mirroring XRP).
2.  **Flare Data Connector (FDC):**
    *   Utilizes the specialized **`XRPPayment`** attestation type (ID `0x08`) to verify the payment transaction on the account-based XRPL ledger.
    *   Requests FDC attestation proofs via the public testnet FDC verifier service at `/verifier/xrp/XRPPayment/prepareRequest`.
    *   Calculates voting rounds dynamically using `IFlareSystemsManager` parameters.
    *   Polls the Data Availability (DA) Layer for cryptographic Merkle proofs at `/api/v1/fdc/proof-by-request-round-raw`.
3.  **Direct Minting Rate Limiter & Delay States:**
    *   Monitors contract execution and intercepts the rate-limit delay custom revert signature: `0x40d8d67b` (`DirectMintingStillDelayed(uint256)`).
    *   Queries `directMintingDelayState` to extract the exact `executionAllowedAt` timestamp.
    *   Renders a countdown timer inside the widget card, automatically executing the finalization when the rate limits unlock.
4.  **FAssets Redemption Flow (Request + Tracking Implemented; Close-Out Pending Live Agent):**
    *   Supports the other half of the FAssets loop (FXRP → XRP) directly in the UI.
    *   Executes ERC-20 `approve` and `redeemAmount()` contract calls to initiate on-chain tickets.
    *   Tracks Agent payouts on XRPL, requests FDC proofs for payouts, and calls `confirmXRPRedemptionPayment()` to confirm completion.
    *   *Testing Limitation Disclosure:* On-chain confirmation requires the payout to originate from an address registered to the assigned agent vault (verified via FDC), rather than an arbitrary un-registered sender. Full close-out requires a live agent payout, which we could not control on testnet.
5.  **Kinetic Collateral & Liquidation Monitor:**
    *   A live dashboard widget that tracks supplied FLR and FXRP collateral.
    *   Uses mock FTSO oracle prices ($2.50 XRP/USD, $0.05 FLR/USD) to calculate dynamic Loan-to-Value (LTV) ratios and alert users of liquidation risk in real-time.

---

## 4. Zero-Custody Security Boundary

The integration widget maintains a strict security boundary:
*   **Zero-Custody in Production:** No private keys or XRP seeds are ever handled by the browser-facing bundle. Signing is performed strictly by user approval through browser wallet extensions (MetaMask/Bifrost) using Viem's custom transport.
*   **Local In-Memory Simulation Sandbox:** For testing convenience (`?mode=dev`), test keys are entered in DOM inputs at runtime and kept strictly in-memory during the active browser session. No credentials are written to persistent `localStorage` plaintext, securing the preview against XSS attacks.
*   **Client-Side QR Code Rendering:** QR codes containing transaction payloads are rendered locally to an HTML5 `<canvas>` using the `qrcode` library, preventing transaction detail leakage to third-party APIs.

---

## 5. Ecosystem & Product Roadmap

### Tag-Based Routing (FAssets v1.3) — Implemented!
The widget supports both **Memo-Based Routing** and **Tag-Based Routing**. Users can reserve reusable ERC-721 minting tags on-chain via `IMintingTagManager` (`reserveMintingTag()`), allowing repeat minting payments without rebuilding memo headers per payment.

### Agent Default Compensation
Support for monitoring redemption timeouts and calling `redemptionPaymentDefault()` to trustlessly claim collateral compensation on-chain if an assigned agent fails to execute the XRP payout within the protocol time window.

### Multi-Asset Expansion
Extend the parameter mappings and UI to support **FBitcoin (FBTC)** and **FDogecoin (FDOGE)** under the same dashboard, dynamically switching the FDC verifier routes and fee mathematics based on the user's selected asset.

### Relayer Indexing & Push Notifications
Introduce a lightweight subgraph indexing service to monitor `DirectMintingExecuted` events, and integrate the Web Push API to alert users on their mobile devices when a delayed direct-mint transaction has cleared the network limiter and successfully finalized.

---

## 6. Outreach & Traction Signals

To validate the utility of this embeddable onboarding design:
*   **Developer Hub Feedback:** Shared the modular SDK structure with Flare developer channels to validate the integration UX.
*   *Integrator Sentiment:* Early feedback highlighted the FDC proof tracking and rate-limit delay management as the highest-value features, saving developers from implementing custom tracking state machines.
