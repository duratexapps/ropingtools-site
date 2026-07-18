I'm handing you a project to build out. It has two parts now — the coaching course you're already working on, and a restructure of how it fits into the larger ropingtools.com site. Read this whole message before starting; the structure changed since you began.

## The site structure is changing

You're currently building the coaching course straight to `www.ropingtools.com`. That changes: **the root domain becomes a landing/hub page**, and the coaching course moves to its own path.

| URL | What lives there | Status |
|---|---|---|
| `ropingtools.com` (root) | New landing/hub page — copy provided in `LANDING_PAGE_COPY.md` | New, build this |
| `ropingtools.com/coaching` | The coaching course (per `HANDOFF_BRIEF.md`) | Move here from root |
| `ropingtools.com/steerme` | Web version of the Steer Me app — spec in `STEER_ME_WEB_SPEC.md` | New |
| `ropingtools.com/drawpro` | "Coming soon" page for a not-yet-built tool | New, single page |
| `twominutestall.com` | Already published, separate domain | External link only, not part of this build |

**Do the move first**, before building anything new, so the in-progress coaching work doesn't end up live at the wrong URL.

## Files attached

- `integrated_roping_system_v20.html` — the coaching course content/UI, unchanged, just moving to `/coaching`
- `HANDOFF_BRIEF.md` — the full coaching-course spec: Wix Velo backend plan, auth, payment, the pricing model, content principles (read this in full before writing backend code)
- `LANDING_PAGE_COPY.md` — actual copy for the new root landing page: hero, four tool cards, an audience-breakdown section (ropers / producers / back office / venues)
- `STEER_ME_WEB_SPEC.md` — full feature inventory and build spec for the Steer Me web version, based on a working mobile-mockup prototype
- `steer-me.html` — the existing Steer Me prototype itself (a clicked-through, 16-screen mobile mockup with real interaction logic, currently running on fake demo data)
- `RISK_DISCLAIMER.md`, `TERMS_OF_SERVICE.md`, `PRIVACY_POLICY.md` — draft legal docs for the coaching course specifically, written by an AI assistant, not a lawyer. Full of `[BRACKETED PLACEHOLDERS]`. Don't treat them as finished, and don't publish live without confirming real legal review happened. (Note: these currently only cover the coaching course — if Steer Me needs its own terms/privacy coverage, especially given it collects minors' data via the guardian-consent flow, that's a real gap to flag, not something to silently extend these docs to cover.)

## Things I want you to know going in

1. **The coaching course has zero real names in it anywhere, on purpose** — a single anonymous "coach" voice, deliberately and repeatedly enforced. Don't add real people's names to that content, its marketing copy, or a "sources" section without checking with me first. This rule is specific to the coaching course — it doesn't apply to the landing page or Steer Me.
2. **This is a Wix Velo build across the whole site, not a generic Node/Supabase backend** — one platform, one account, for everything including Steer Me. Check our existing Wix site for installed Velo Packages before assuming the Git/CLI workflow is available; `HANDOFF_BRIEF.md` explains the conflict.
3. **Before writing backend code for either the coaching course or Steer Me, walk me through your plan first** — I'd rather catch a wrong assumption before it's built than after.
4. **The coaching course's six testimonials are fictional placeholders**, clearly marked in code comments. Don't let those ship as real customer quotes — that's a legal problem (FTC/deceptive advertising), not just a content one.
5. **Steer Me is a much bigger scope than it might look at first glance** — 16 screens, a real matching/eligibility algorithm, a guardian-consent flow for minors, producer verification, and a stated pricing model already written into its own UI. Read `STEER_ME_WEB_SPEC.md` fully before scoping how much of this ships in the first pass.
6. **Two Minute Stall is a separate, already-published domain** (twominutestall.com) — link to it, don't attempt to build or modify it.

## Open questions I haven't answered yet — ask me, don't guess

- Steer Me web version: ship as a prototype with fake data first (matching how the coaching course started), or build real backend functionality from day one?
- Is real OCR in scope for the Global Handicap screenshot auto-scan, or manual entry as a fallback?
- Who reviews producer verification submissions on Steer Me, and where does that happen?
- Is "RopingTools" the actual brand name for page titles/meta tags, or is there a different intended name for the parent brand?
- Draw Pro's "get notified" email capture — where should those emails actually go?

Start by reading through all the attached files, then tell me what you'd tackle first and in what order before you start writing code.
