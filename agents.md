# AGENTS.md — FXRP Embed

Context for any AI coding agent (Claude Code or similar) working on this repository. Read this before writing code.

## What this project is
An embeddable SDK/widget that lets a Flare wallet, exchange, or dApp offer FXRP minting to their users, using FAssets v1.3 direct minting, without the integrator having to implement the AssetManager/FDC flow themselves. Built for the Flare Summer Signal hackathon, Bounty 1 (Interoperable Asset Products). Deployed and demoed on **Coston2 testnet**.

## The one rule that overrides everything else
**This product must never become a trusted intermediary.** Concretely:
- Never store a private/off-chain mapping between a mint request (memo or tag) and a destination address. That mapping must always be reconstructable by anyone from public onchain/XRPL state alone.
- The backend, if one exists, only **observes and relays status** (polling FDC/AssetManager events to improve UX). It must never be a required step for a mint to succeed.
- If the backend is offline, an in-progress mint must still be able to complete — via the protocol's own timeout-based "any executor can finalize" fallback.
- Never custody user funds. The user always signs and sends their own XRPL transaction directly.

If an implementation path requires violating any of the above ("just cache the mapping for now," "we'll add a backend override for edge cases"), stop and flag it — do not implement a workaround. This is the project's core validated hypothesis; violating it invalidates the whole pitch.

## Two mint paths — prefer the memo path for MVP
1. **Memo-based direct minting**: recipient (and optionally executor) address is encoded directly in the XRPL payment's memo field. No registry lookup needed at all — the destination is self-contained in the transaction the user signs. Build this first; it's the simplest and most architecturally clean to demo and explain.
2. **Tag-based direct minting**: a destination tag is reserved via the onchain `MintingTagManager` contract (ERC-721), which maps the tag to a recipient/executor. Public and independently verifiable, but adds a reservation step. Consider as a v2 addition, not MVP.

## Don't rebuild what Flare already ships
Flare's `flare-viem-starter` repository includes a `waitForDirectMintingOutcome` helper that watches for delayed/executed mint events. Use it, or closely mirror its approach, instead of writing FDC/event-polling logic from scratch. Time saved here should go into SDK ergonomics, embed mechanics, and UX — that's where this product's actual value lives, not in re-implementing protocol plumbing.

## Known protocol-level constraints to surface, not hide
- Rate limits and delay windows exist on large or frequent mints (hourly/daily caps, delays above certain thresholds). The UI must surface these honestly when hit — never let the user stare at a silent stall. See `design.md` for exact copy expectations.
- Executors hold no special permissions; after a timeout, anyone can finalize a pending mint. This is a feature to communicate (resilience), not an edge case to hide.

## Tech stack expectations
- Contract interaction: viem (matches Flare's own starter tooling — stay consistent with it rather than introducing a second web3 library).
- Network: Coston2 for all development and demo purposes. Do not assume mainnet-specific contract addresses; confirm Coston2 deployment addresses before hardcoding anything.
- Frontend: framework-agnostic embeddable component preferred over a framework-locked one, since the whole pitch depends on any integrator being able to drop it in regardless of their stack. If a single framework must be picked for hackathon speed, document that as a known limitation, not a silent decision.

## Definition of done for Gate 1 (validation phase — do this before building UI)
A single successful Coston2 mint, executed end to end, where you can point to:
- The exact XRPL transaction and its memo/tag.
- The onchain event(s) proving the destination was resolved from public state, not from any private data your code holds.
- The `DirectMintingExecuted` event and associated FDC proof.

Do not proceed to SDK/UI work until this is demonstrated and recorded (screenshot, tx hashes, short writeup).

## What NOT to build
- No AI features, no dashboards, no analytics, no educational/explainer content. This project is deliberately scoped to one thing: a trustless, embeddable mint flow. Resist scope additions, including good ones, until Weeks 4–5 buffer time confirms there's room.
- No custodial shortcuts, ever, even "temporarily" for a demo. If Coston2 behavior forces a shortcut, it should block progress and get flagged, not get quietly patched around.

## Style / conventions
- Plain, factual copy in all user-facing strings — see `design.md` for tone.
- Prefer explicit, verifiable state over cached/optimistic UI state given the "no trust ownership" constraint — it's fine for the UI to feel a beat slower if it means every displayed status is actually backed by a real onchain/XRPL read.
