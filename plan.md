# FXRP Embed — Project Plan

## One sentence
An open-source SDK/widget that lets any Flare wallet, exchange, or dApp add trustless FXRP minting in minutes, using FAssets v1.3 direct minting, instead of implementing the flow themselves.

## Hackathon
Flare Summer Signal — Bounty 1: Interoperable Asset Products
Deadline: August 14, 2026 (submission), judged Aug 15–21.

## Target user
Two layers:
- **Integrator** (primary customer): a Flare wallet, exchange, or dApp that wants to offer FXRP without building the direct-mint flow themselves.
- **End user**: an XRP holder who mints without leaving the app they already trust.

## Why this fits Bounty 1
Directly matches "FXRP onboarding flows... asset movement UX... products that make interoperable assets easier to use." Roadmap answer is not hypothetical — it's the distribution model Flare's own v1.3 announcement says the ecosystem needs (reach XRP holders through surfaces they already trust, not a new destination site).

---

## The two hypotheses (Gate 1)

### Hypothesis 1 — Technical
*Can an embeddable SDK participate in the FAssets v1.3 direct mint flow without becoming a trusted intermediary?*

**Status: PASSES, based on documentation.** To confirm empirically, not to discover:
- Memo-based path: recipient address is encoded directly in the XRPL payment memo. No registry, no backend mapping — anyone can decode the destination from the transaction itself.
- Tag-based path: tag → recipient/executor mapping lives in the public, onchain `MintingTagManager` contract (ERC-721). Independently verifiable by anyone.
- Finalization emits a public `DirectMintingExecuted` event backed by an FDC payment proof.
- Executor role (who finalizes the mint) has no special permissions; if our executor doesn't act, anyone can after a timeout window. This is a **liveness convenience**, not a trust dependency.

**Remaining task:** run one real Coston2 mint to confirm the docs match live contract behavior, not to test whether the design is trustless — that part is answered.

### Hypothesis 2 — Market
*Does a real Flare integrator experience this as a problem worth solving?*

**Success looks like:** "the cross-chain flow is the annoying part," "implementing AssetManager ourselves is more work than we'd like," "we'd use something like this."
**Failure looks like:** "that's not the painful part," "we already solved that internally," "the bigger problem is X." Useful either way — tells you if you're solving the right problem.

**Status: not yet tested. Send outreach messages today.**

---

## What "not being a trusted intermediary" means, concretely
- No private database mapping tags/memos to addresses. That mapping must always be reconstructable from public chain state alone.
- Backend (if any) only **observes and relays status** to improve UX (polling FDC/AssetManager, showing progress). It never becomes required for a mint to succeed.
- If our backend disappears, a mint in progress must still complete (via the timeout-based "any executor" fallback).
- No custody of funds at any point. The user always sends XRP directly from their own wallet.

If any of these breaks during implementation, do not patch around it with "temporary" backend ownership. Stop and reassess — this is the fatal assumption for the whole product.

---

## Build plan (5 weeks)

**Week 1 — Validate, don't build UI**
- Morning: trace the direct-mint flow end to end, run one real Coston2 mint, confirm memo encoding and tag reservation work as documented.
- Afternoon: send outreach messages (see below). Don't wait for replies to start Week 2 — but don't ignore them either.
- Deliverable: a short internal note — did Gate 1 pass, and what did integrators say.

**Week 2 — Core SDK**
- Payload construction (memo path first — it's the simpler, more architecturally clean MVP).
- Status polling built on top of Flare's own `waitForDirectMintingOutcome` helper (`flare-viem-starter`) — do not rebuild this from scratch.
- No UI yet beyond the bare minimum to test the flow manually.

**Week 3 — Embed mechanics**
- Package as a droppable component (widget/iframe or JS component).
- Prove it by embedding it in a second, separate demo app — not just the one it was built in.

**Week 4 — UX polish**
- Real-time status states: sent → observed → proof generated → minted.
- Rate-limit / delay-window handling surfaced honestly to the user (large-mint delays, hourly/daily caps) rather than a silent stall.
- Copy and states per `design.md`.

**Week 5 — Buffer + submission**
- Demo video, README, roadmap doc, GitHub repo cleanup.
- Do not add scope this week.

**Optional stretch (only if Week 4 finishes early):** a second surface reusing the same FDC data pipeline — e.g. a read-only liquidation-risk view for FXRP used as Kinetic collateral. Cut without hesitation if behind schedule.

---

## Submission checklist (per hackathon rules)
- [ ] Project name, bounty selected (Bounty 1)
- [ ] Target user stated plainly (integrator + end user)
- [ ] Demo link — a **working**, testable Coston2 flow, not a recording of a mock
- [ ] GitHub repo
- [ ] How the project uses Flare (AssetManager, FDC, direct minting specifically — name the mechanisms)
- [ ] What was newly built (all of it — no prior project)
- [ ] Deployed on Coston2 — state this explicitly
- [ ] Roadmap / next steps
- [ ] Traction signals: outreach replies, any pilot interest

## Biggest execution risk
FDC proof timing and Coston2 reliability during a live demo. De-risk this in Week 1, not Week 4 — get one mint working end-to-end before building any UI on top of it.
