# Site restructure decisions (confirmed with client, 2026-07-18)

Source: `docs/source/CLAUDE_CODE_KICKOFF_MESSAGE.md`, `docs/source/LANDING_PAGE_COPY.md`,
`docs/source/STEER_ME_WEB_SPEC.md`. This doc records the answers to the open
questions those files explicitly said not to guess on.

## Site structure

| URL | What lives there | Status |
|---|---|---|
| `ropingtools.com` (root) | New landing/hub page, copy in `LANDING_PAGE_COPY.md` | To build |
| `ropingtools.com/coaching` | The coaching course (this repo's existing work) | Moving here from `/course` |
| `ropingtools.com/steerme` | Web version of the Steer Me app | To build |
| `ropingtools.com/drawpro` | "Coming soon" page | To build |
| `twominutestall.com` | Already published, separate domain | External link only |

**Do the `/course` → `/coaching` move before building anything new** — this was live
at the wrong path during the transition and needed fixing first.

## Confirmed answers

- **Brand name**: "RopingTools" — use in page titles, meta tags, nav branding site-wide.
- **Steer Me web scope**: real Wix Data backend from day one, not a fake-data
  prototype first (unlike how the coaching course started).
- **Steer Me web vs. the native app** (separate project: `STEER ME/LAUNCH APP/steer-me-app`,
  Expo/React Native, already in progress): design the Wix Data Collections now
  with an eye toward the native app eventually reading/writing the same data.
  Not building that integration now — just not designing web-only in a way that
  would force a data migration later. No shared code assumed between the two
  codebases at this point, just a shared backend data shape as a future option.
- **Global Handicap OCR**: manual entry only. No OCR/document-processing
  service. Users type their membership ID and classification number directly.
- **Producer verification review**: the client reviews submissions directly via
  the Wix Content Manager (a Wix Data Collection with a pending/approved/rejected
  status) — no separate admin tool.
- **Draw Pro "Get Notified" emails**: stored in a new `DrawProWaitlist` Wix Data
  Collection, viewable/exportable from the Content Manager. No third-party email
  tool wired in for this pass.

## Still open (not yet needed to block current work)

- Exact desktop layout treatment for Steer Me (side nav vs. other pattern) —
  design decision to make during the responsive redesign itself, not a business
  question.
- Whether/when the native Steer Me app and this web version actually converge
  on one shared backend — explicitly deferred, not decided.
