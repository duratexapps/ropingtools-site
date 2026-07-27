# Draw Pro Legal Drafts — Cover Memo

Four documents, all marked **DRAFT** and **not legal advice** — written to match
Draw Pro's actual data model and feature set as built so far, so counsel is
reviewing real product behavior rather than a generic template.

1. `terms-of-service.md`
2. `privacy-policy.md`
3. `minor-parental-consent-addendum.md`
4. `refund-extra-run-policy.md`

## Before these can be finalized, someone needs to decide:

- **Draw Pro's transaction-fee structure** — the ToS, Privacy Policy, and Refund
  Policy all have placeholder sections that can't be written for real until this
  is set (see the open pricing question from earlier in the build).
- **Age threshold and consent mechanism for minors** — the addendum assumes a
  parent/guardian submits a minor's entry, but the entry form itself doesn't yet
  have an age-declaration step. That's a product change, not just a policy one —
  flagging it here so it doesn't get missed.
- **Data retention windows** — scanned card images, entrant records post-event, and
  audit logs are all currently undefined in terms of how long they're kept. This
  affects both the Privacy Policy language and, practically, how much storage/
  liability surface Draw Pro is carrying long-term.
- **Guest entrants and paid entries** — whether a guest (no account) can submit a
  paid entry at all is unresolved, and affects the Refund Policy's Section 6.
- **Governing law/jurisdiction and dispute resolution** — should probably match
  whatever's already set for Steer Me and the coaching course, if that exists, for
  consistency across the RopingTools product suite.

## What's NOT covered here

- Steer Me's and the coaching course's own Terms/Privacy Policy, if they don't
  already exist — this package only covers Draw Pro.
- Payment processor terms, once one is chosen for the transaction-fee model — that
  provider (Stripe, etc.) will have its own required merchant/consumer terms that
  sit alongside, not inside, these documents.
- A cookie/tracking consent banner — check what Wix already provides at the
  platform level before building this separately, per the earlier note about
  platform-level compliance tooling.

## Recommended next step

Route all four documents to counsel together, since the ToS and Refund Policy
reference the same extra-run mechanic from two angles, and the Privacy Policy and
Minor Addendum both touch scanned-card handling — reviewing them in isolation risks
inconsistent language across documents that are meant to work as a set.

## Updated 2026-07-27 — gaps found and closed from that day's feature work

A pass was made specifically to check these documents against everything built
that day (multi-user producer accounts + tiered pricing, "first to enter, last
to rope" sequencing, CSV export) before considering this package ready to route
to counsel. Real, concrete gaps were found and closed directly in the three
affected documents (ToS, Privacy Policy, Refund Policy) — see each document's
own "NEW, added 2026-07-27" markers for the specific additions. Two of these
are now real, additional open decisions on top of the ones already listed above:

- **The producer annual subscription ($149/$199/$249 tiers) had NO mention
  anywhere in the ToS before this pass** — not a refinement of an existing
  section, a genuinely missing one (new Section 8.5). This is arguably a
  bigger gap than the still-open entry-transaction-fee placeholder in Section
  9, since real money is already changing hands under this subscription
  mechanism in the built software.
- **Subscription cancellation/refund terms are undefined** (new Section 7 of
  the Refund Policy) — recommend matching Steer Me's existing "no refund,
  access continues through the paid period" model for consistency, unless
  there's a specific reason to diverge.
- **Seat-tier downgrade handling is undefined** — if a producer downgrades
  below their current team member count, the software does not currently
  remove anyone automatically. This is a business decision that may also need
  a product-side follow-up once decided, not just a policy sentence.
