# FXRP Embed — Design

## Design goal
This is a developer tool embedded inside someone else's product. It should feel closer to a Stripe payment element than to a consumer app: quiet, plain, gets out of the way, and never fights the host app's own branding. No animation for its own sake — every visual state exists to answer "what is happening to my money right now."

## Non-goals
- Not a branded consumer experience. The integrator's brand should dominate; this widget should look like it belongs to them.
- No decorative motion. Progress should feel honest, not entertaining.
- No dark patterns or urgency cues (no countdown timers designed to pressure, no "only X left").

---

## Layout

A single vertical flow, one primary action visible at a time. Four states:

### 1. Idle / entry
- One input: amount of XRP to mint (or pre-filled if the integrator passes it in).
- One primary button: "Mint FXRP."
- One line of plain-text explanation: "You'll send XRP from your wallet. FXRP arrives on Flare once the payment is verified — usually a few minutes."
- Small, secondary link: "How this works" — expands inline, doesn't navigate away.

### 2. Awaiting payment
- Clear instruction: exact amount, exact memo/tag to include, with a copy button.
- Explicit warning, plain language, not alarmist: "This memo must be included exactly, or funds cannot be matched to your mint."
- A visible "waiting for your XRPL transaction" state, no spinner tricks — just a plain status line.

### 3. In progress (the core status tracker)
Linear steps, each with three visual states: pending (gray), active (accent color, one at a time), done (checkmark, muted green).

```
[✓] XRP payment sent
[●] Observed on XRPL — waiting for confirmation
[ ] FDC proof generated
[ ] FXRP minted
```

- Each active step shows a plain-language one-line description of what's happening, not technical jargon by default.
- A collapsed "technical detail" toggle reveals: transaction hash (linked), FDC round ID, contract address — for the minority of users who want to verify. Off by default.
- If a rate-limit or delay window is hit: say so plainly — "Large mints are processed with a short delay for network safety. Estimated wait: ~X minutes." Never a silent stall.

### 4. Complete
- Final FXRP amount, confirmation.
- One clear next action, provided by the integrator (e.g. "Continue" back to their app) — this widget does not try to keep the user inside itself afterward.

---

## Visual language

- **Color:** one neutral palette (grays) for structure, one single accent color for the active/primary action (should be easy for an integrator to override via a CSS variable — the widget must not impose a brand). Status colors kept minimal: gray = pending, accent = active, muted green = done, muted red = error only.
- **Typography:** system font stack for all UI text (inherit from host where possible, so it doesn't visually clash with the integrator's app). Monospace only for technical values — transaction hashes, addresses, round IDs — nothing else.
- **No card shadows, no gradients, no illustration.** Flat, bordered sections only where needed to separate steps.
- **Motion:** state transitions may fade/cross-fade (150–200ms), nothing more. No easing tricks, no scale/bounce effects. This is a status readout, not a showcase.

## Accessibility & embedding constraints
- Must render correctly inside an iframe and as a native component — don't assume full-page real estate.
- All status must be conveyed in text, not color alone (screen reader and colorblind safe).
- Respect host app's dark/light mode if detectable; otherwise default to light, low-contrast-neutral.
- No autoplay sound, no unexpected focus steals.

## Copy tone
Plain, factual, present tense. "Your payment was observed on XRPL" — not "Great news! We spotted your XRP!" This is a financial tool; the tone should read as trustworthy infrastructure, not a consumer app.
