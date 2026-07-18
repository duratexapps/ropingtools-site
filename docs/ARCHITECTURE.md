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

## Content gating (quizData + lesson HTML)

The brief's Technical Requirement #3 asked for chapter content and quiz
questions to move behind a backend check — originally all 32 chapters'
teaching content and all 320 quiz Q&As were static HTML/JS baked directly
into the file, visible to anyone via view-source, gating or no gating.

**Done in this pass**, via a scripted extraction (not hand-edited — a
471KB file with 32 chapters isn't something to slice by hand reliably):

- A one-off Node script walked the original file's DOM structure (matching
  `<div class="chapter">` blocks by brace-depth, not fixed line numbers, so
  it wasn't order- or whitespace-fragile) and pulled each chapter's teaching
  HTML out from between its `.chapter-body` open tag and its `<!-- QUIZ -->`
  comment, plus the entire `quizData` object.
- That extracted content now lives in **`velo/backend/courseContent.js`** —
  a plain backend `.js` file (not `.jsw`), which per Wix's own repo
  structure is importable by other backend files but **never exposed to the
  frontend at all**. This is stricter than "check permissions before
  returning it" — the content literally isn't reachable from client code.
- **`velo/backend/content.jsw`**'s `getChapterContent(chapterId)` is the
  only way this content reaches a browser: it checks `currentMember`, then
  queries `Purchases`/`Subscriptions` for entitlement, and only then returns
  the HTML + quiz array. Not logged in, or logged in but not entitled, both
  return `{ locked: true }` — no content, no chapter title leak beyond what
  was already public in `chapterTitles`.
- In `public/course-embed.html`, every chapter except **1.1** (the free
  preview, which stays fully inline/public, matching the brief's free-tier
  spec) now has its teaching-content region replaced with a
  `.chapter-locked` placeholder (teaser + "Unlock This Chapter" button) plus
  an empty `.chapter-content-mount` div. `toggleChapter()` — the existing
  function that already lazily rendered quizzes on first expand — now also
  calls the new `unlockChapter()` on first expand of a locked chapter, which
  round-trips through `wixBridge.call('getChapterContent', ...)`. If
  entitled, the mount div gets filled with the real HTML, `quizData[id]` gets
  populated client-side for that one chapter, and the existing `renderQuiz()`
  runs unchanged. If not entitled, the teaser text updates in place with a
  purchase prompt — no separate error state to build.
- The client-side `quizData` object now contains **only chapter 1-1's**
  10 questions — the other 310 questions across 31 chapters are gone from
  page source entirely, confirmed by grepping the shipped file for known
  chapter-1.2-only text after the transform (zero matches) alongside chapter
  1.1's text (still present, as expected).

**Not yet meaningful in practice**: `isEntitled()` in `content.jsw` queries
real `Purchases`/`Subscriptions` collections, but **no checkout flow writes
to those collections yet** (payment is still an open decision — see below).
Until that's built, every non-1.1 chapter will correctly show as locked for
every visitor, including the site owner testing it, because there's nothing
in those collections to match against. That's expected, not a bug — nothing
else needs to change in the gating logic once a real purchase writes a row
there.

**Verified**: the transform script's output was syntax-checked (`new
Function(...)` on the extracted `<script>` block) and structurally verified
(31 `.chapter-locked` placeholders, 32 intact `.chapter` shells, 32 intact
`.quiz-section`/12 `.video-coach-box` elements untouched, chapter-1.2-only
text absent from the client file, chapter-1.1 text still present). **Not**
verified: the actual `unlockChapter()` round-trip against a live Wix page,
since that depends on the postMessage bridge itself being live-verified
first (see below) and on `Purchases`/`Subscriptions` collections existing
with real test data.

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

## What's actually been verified live vs. what's still on paper

**Verified against the real site** (`duratexapps/roping-tools`, connected
to the mycamperspot.com Wix account with Dev Mode on): Git Integration
works end-to-end — repo cloned, Wix CLI authenticated via device login,
`npm install` + `wix sync-types` succeed, no Velo Packages conflict was
present, and the backend `.jsw` modules + locked-down `permissions.json`
have been pushed to `main`. That's real, not theoretical.

**Still on paper, not live-tested** — because they all require a page in
the Editor with the HTML embed element actually placed (see task "Create
course page with HTML embed element," still pending):

- Whether `$w('#courseEmbed').onMessage()` / `.postMessage()` actually
  round-trips with a pasted HTML iframe embed (vs. only Custom Elements) —
  this is the single riskiest unverified assumption in the whole bridge.
- The iframe's `event.origin` / the parent's actual origin, needed to lock
  down `PARENT_ORIGIN` from `'*'` to the real value.
- Current `wix-members-backend` / `wix-secrets-backend` API names matching
  what's used in the `.jsw` files — Wix has been migrating some backend
  modules toward newer `-v2` / SDK-style equivalents.
- The `unlockChapter()` / `getChapterContent()` round trip end-to-end,
  including against real rows in `Purchases`/`Subscriptions` (collections
  don't exist yet either — see pending task).

None of this is blocked on anything technical, just on the remaining manual
Editor steps (Secrets Manager, the course page + embed element, the Data
Collections) landing first.

## Update: the `$w.onMessage()` bridge was live-tested and doesn't work — replaced with HTTP Functions

Once the Draw Pro coming-soon page's embed was actually live, its "Get
Notified" waitlist consistently failed with a timeout. Live console
debugging (in the Local Editor's Preview mode, with browser DevTools open)
found the real cause: `$w('#drawProEmbed')` returns `{ type: undefined,
constructor: Array, keys: [] }` — an **empty array**, not the HTML
Component reference Wix's own docs describe. This was confirmed repeatable
across multiple page reloads and Local Editor reconnects, with the element
ID visually confirmed correct in the Editor ("Section: drawProEmbed" badge
matched exactly). The classic `$w.HtmlComponent` messaging API
(`onMessage()`/`postMessage()`) that Wix's docs describe for the "HTML
iFrame Element" does not appear to apply to whatever component type the
current Editor's "Custom Embeds"/"Embed a Widget" flow actually creates —
this looks like a real platform gap or naming/version mismatch between
Wix's documentation and the current Editor, not a mistake in our setup.

**Fix: switched to Wix HTTP Functions instead**, for actions that don't
need a logged-in member's identity. `backend/http-functions.js` exposes
`post_joinDrawProWaitlist` / `options_joinDrawProWaitlist` as a plain REST
endpoint at `https://www.ropingtools.com/_functions/joinDrawProWaitlist`,
called directly via `fetch()` from `public/drawpro/index.html` — no `$w`,
no `onMessage`, no Page Code involvement at all. CORS headers are set
explicitly and permissively (`Access-Control-Allow-Origin: '*'`) since it
wasn't confirmed whether the embed iframe is same-origin with
`www.ropingtools.com` (a `filesusr.com` asset-domain URL was observed in
one network trace, suggesting it may not be) — tighten this once confirmed,
same as the `PARENT_ORIGIN` lockdown.

**What this means for everything else:**
- **Draw Pro's real build** (native `$w` elements + Page Code, not an HTML
  embed at all — see the build package from Claude Chat) is unaffected by
  this bug entirely, since native elements don't go through
  `$w('#id').onMessage()` on an HTML Component — this bug is specific to
  HTML/Custom-Embed iframe elements.
- **The Coaching course page** (`course-page.js` / `course-embed.html`)
  almost certainly has the same broken bridge — it hasn't been re-tested
  live since this was found. Its actions need real member identity
  (`currentMember` in the backend), which HTTP Functions can't get for
  free the way Page Code can — an HTTP Function would need the visitor's
  session to arrive via cookies on a cross-origin-safe request, which is
  unconfirmed. **This needs verifying before assuming the same fix applies
  there** — don't port this blind.
- **Steer Me web**, if it uses any HTML-embed pattern for interactive
  pieces, should default to HTTP Functions (or native `$w` elements, like
  Draw Pro's real build) from the start rather than the `$w.onMessage()`
  bridge — no reason to re-discover this same bug a third time.
