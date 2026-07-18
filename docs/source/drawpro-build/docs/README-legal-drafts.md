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
