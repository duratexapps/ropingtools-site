# Status: superseded, not the production path

This Wix Data Collections backend (permissions.jsw, requests.jsw, events.jsw,
ratings.jsw, reports.jsw, needPosts.jsw, social.jsw, matching.jsw) was built
in good faith as the first pass at Steer Me web, and the work in it is real
and reviewed - canPair() in particular was corrected against the native
app's actual matching.ts.

**Decision (2026-07-20): Steer Me web's production backend is Next.js
talking directly to the same Supabase project the native app already
uses, not this Wix Data mirror.** Reasoning: the whole point of this
decision was "whichever option streamlines the backend between the web and
the app" - and this collection of files never actually did that. It
mirrors the native app's schema into a separate Wix Data database with no
real data-sharing between the two, which was explicitly called out as out
of scope when it was built. A Next.js frontend calling Supabase directly
shares the actual data, the actual auth-adjacent tables, and the actual
business logic with the app - this doesn't, and structurally can't without
a sync layer nobody has designed.

See `steerme-web` repo (separate GitHub repo, `duratexapps/steerme-web`)
for the real production direction, and `docs/ARCHITECTURE.md` in this repo
for the fuller decision record.

**Not deleted** - left in place as reference, since real design work went
into it (the eligibility/trust-safety logic in particular is worth
re-consulting even if the actual implementation moves to Supabase RLS
policies instead of these elevate()-gated functions). Not being actively
developed further, though.

**Known, accepted tradeoff, not an oversight:** moving Steer Me to
Supabase-direct auth means it does NOT share a login with Coaching/Draw
Pro's Wix Members Area accounts. Three separate account systems across the
RopingTools suite as of this decision (Wix Members for Coaching/Draw Pro,
Supabase Auth for Steer Me/the native app). Revisit if a unified account
ever becomes a real priority - not solved by this decision, just not
blocked by it either.
