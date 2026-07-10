# FXRP Embed - Product Roadmap 🗺️

This document outlines future milestones, extensions, and design directions for the **FXRP Embed** integration widget and SDK.

---

## 1. Production-Grade Wallet Connections

In the current prototype, the widget utilizes local wallet credentials (`xrplSeed` and `flarePrivateKey`) stored in `localStorage` for testing convenience. In production:
* **XRPL Wallet Integration:** Integrate client-side wallet connectors for popular Ripple wallets (e.g., **Xumm**, **Gem Wallet**) via QR codes and browser extensions.
* **EVM Wallet Integration:** Integrate **WalletConnect**, **RainbowKit**, or **MetaMask** using standard Wagmi hooks to connect EVM accounts natively, signing transactions via user approval modals instead of raw private keys.

---

## 2. Tag-Based Routing Path (FAssets v1.3)

While the direct memo-based routing path is the simplest and most cost-effective MVP, the SDK will extend to support **Tag-Based Routing**:
1. **Reservation Phase:** Call `AssetManager.reservePin` or `MintingTagManager` to mint a unique ERC-721 token representing the reservation.
2. **XRPL Payment:** The user sends XRP using the minted token ID as the destination tag.
3. **Execution Phase:** The SDK verifies the tag reservation ownership on Flare and executes the mint, resolving the destination address via the ERC-721 token record.

This path allows integrators to accommodate exchanges or payment senders that only support numerical destination tags and restrict binary memo fields.

---

## 3. Multi-Asset Onboarding (FBitcoin & FDogecoin)

Extend the widget layout and parameter configurations to support the complete FAssets ecosystem:
* **FBitcoin (FBTC):** Encodes Bitcoin transaction hashes and proofs.
* **FDogecoin (FDOGE):** Integrates Dogecoin payment verification.
* The widget will provide an asset selector dropdown allowing users to select the asset they wish to supply, dynamically updating the fee math, layout, and FDC verifier routes.

---

## 4. Decentralized Indexer & Notification Relayer

To further optimize performance and decrease RPC request volume:
* Build a lightweight, decentralized indexing service using subgraphs (e.g., The Graph) to index `DirectMintingExecuted` and `DirectMintingDelayed` events.
* Serve instant status cached notifications to the widget in real-time, reducing initial block-range scan delays on client browsers.
* Add push notifications (via Web Push API) to notify users when a delayed mint has successfully unlocked and executed on-chain.
