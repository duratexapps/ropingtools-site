# Architecture decisions made in this pass

This documents choices made while turning `HANDOFF_BRIEF.md` into actual
code, before any of this has touched a real Wix site. Everything here is
written from Wix/Velo documentation, not verified against a live editor —
see "What still needs live verification" at the bottom.

## Embedding: one HTML iframe element, no splitting needed

The brief flagged uncertainty about Wix's embed size/complexity limits and
suggested splitting the 471KB file per-section as a fallback. Checked
current Wix docs: **the HTML iframe element has no character/size limit**
([Working with the HTML iframe Element](https://dev.wix.com/docs/develop-websites/articles/wix-editor-elements/other-elements/html-i-frame-element/working-with-the-html-iframe-element)).
So `public/course-embed.html` stays a single file, pasted into one HTML
embed element on one Wix page. Simpler to maintain, and the file's internal
nav between sections keeps working exactly as before.

## The postMessage bridge (the core new piece)

The HTML iframe element is **sandboxed** — it has no access to `wix-members`,
`wix-data`, Secrets Manager, or anything else in the parent page's Velo
context. That's true whether the embedded code is a raw HTML paste or a
Velo Custom Element in most configurations. So the embedded file can't
`import` a backend `.jsw` module directly the way normal Velo frontend code
does.

The fix: a small `postMessage` request/response bridge.

- **`public/course-embed.html`** — added a `wixBridge` helper near the top
  of the `<script>` block. `wixBridge.call(action, payload)` posts a
  message up to `window.parent` with a random correlation ID, and returns a
  Promise that resolves when a matching response message comes back (or
  rejects after a 30–60s timeout).
- **`velo/pages/course-page.js`** — Page Code for the Wix page hosting the
  embed. Listens for messages from the iframe via `$w('#courseEmbed').onMessage()`,
  dispatches by `action` to the real backend `.jsw` calls, and posts the
  result back with `iframeEl.postMessage()`.
- The backend `.jsw` modules (`aiCoach.jsw`, `progress.jsw`, `feedback.jsw`,
  `legalAcknowledgments.jsw`) are only ever called from Page Code — never
  from the iframe — so `currentMember.getMember()` inside them is always
  backed by the visitor's real, authenticated Wix session. **The client
  never supplies its own member ID anywhere in this flow**, which is what
  actually makes the credit system and progress tracking tamper-resistant.

Five things were rewired through this bridge:
1. `analyzeRoping()` — was a direct client-side fetch to
   `api.anthropic.com`; now calls `wixBridge.call('analyzeRoping', ...)`.
   **The prompt template itself moved server-side** (into
   `aiCoach.jsw`'s `buildCoachPrompt()`) — the client now only sends
   structured fields (position/skill/goal/chapterFocus/frames), not prompt
   text. This satisfies the brief's "preserve the prompt's intent" note by
   construction (it can't drift client-side because it doesn't live there
   anymore), and closes off prompt-injection through the free-text `goal`
   field feeding directly into a system-prompt-like string.
2. `recordQuizResult()` — fires `wixBridge.call('recordQuizResult', ...)`
   in addition to updating the existing in-memory `studentProgress` object
   (kept as-is so the report page still renders instantly without a round
   trip).
3. `sendFeedback()` — tries the backend call first, falls back to the
   original `mailto:` behavior if that fails (not logged in, network
   error, etc.) — matches the brief's explicit ask to keep mailto as a
   fallback, not remove it.
4. `acknowledgeRisk()` — now persists `{ memberId (implicit), documentType,
   version, timestamp }` via the bridge instead of just closing the modal.
5. `recordVideoAnalysis()` — **left as display-only.** It no longer needs
   its own sync call because `aiCoach.jsw` already writes to
   `VideoAnalysisLog` as part of the same transaction that deducts credits
   — logging it a second time from a separate, unauthenticated path would
   just create a race between two write paths for the same fact.

### Security note: `PARENT_ORIGIN`
Both the iframe's `postMessage` calls and the parent's message listener
currently accept any origin (`'*'` / no `event.origin` check). This is
flagged inline in both files. **Lock this down to the real production
origin before launch** — left open because the actual origin Wix serves
embedded HTML content under (may differ between the Wix preview domain and
the connected `ropingtools.com` custom domain) needs to be observed on a
real, published site, not guessed.

## What's still open / explicitly not done in this pass

### Content gating (quizData + lesson HTML) — the big remaining piece
The brief's Technical Requirement #3 asks for chapter content and quiz
questions to move behind a backend check. **This wasn't done yet.** The
32 chapters' teaching content is static HTML baked directly into the file
(not generated from a JS data object the way quiz questions are), which
means gating it properly means restructuring how chapters render — fetch
chapter HTML from the backend after an entitlement check, rather than
having it all present in the DOM from page load. That's a bigger, riskier
change than anything done in this pass, and it's the kind of thing that
should be built and tested against the real Wix Members Area / purchase
records once those actually exist — not designed blind. Recommend tackling
this as its own focused pass once auth + at least one purchase path is
live, so there's something real to gate against.

In the meantime: **all 32 chapters' content and all quiz answers are still
visible in page source**, same as the original file. This is a known,
pre-existing gap, not a regression introduced here.

### Not touched
- Payment (Wix Pricing Plans vs. Stripe-via-Velo) — brief explicitly leaves
  this as an open decision, nothing to prep code-wise until that's chosen.
- Coach's real name, legal doc placeholders, real feedback inbox address,
  testimonials — all still placeholders, per the brief's own "what not to
  do" list. `REAL_FEEDBACK_INBOX` in `course-embed.html` is isolated to one
  constant now, so it's a one-line fix once the client gives you a real
  address.
- `CreditTransactions` (full audit-log history vs. just current balance) —
  flagged as a likely near-term addition in `data-collections/SCHEMA.md`,
  not built.
- Monthly credit refresh for Annual plans — needs a Wix scheduled job, not
  written.

## What still needs live verification

Everything above was written against current Wix/Velo documentation, not
tested in an actual Wix Editor, because this session doesn't have access to
the client's Wix account. Before trusting any of this in production:

- Confirm `$w('#courseEmbed').onMessage()` / `.postMessage()` actually
  round-trips with a pasted HTML iframe embed (vs. only Custom Elements) —
  this is the single riskiest unverified assumption in the whole bridge.
- Confirm the iframe's `event.origin` / the parent's actual origin, to lock
  down `PARENT_ORIGIN`.
- Confirm current `wix-members-backend` / `wix-secrets-backend` API names
  match what's used in the `.jsw` files — Wix has been migrating some
  backend modules toward newer `-v2` / SDK-style equivalents.
