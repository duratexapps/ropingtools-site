# RopingTools — Shared Design Tokens

**Source of truth:** extracted directly from the live `steer-me.html` build. This
supersedes the earlier from-scratch proposal in `brand-direction.md` — that
proposal was written before we had visibility into Steer Me's actual theme.
Draw Pro should match this exactly, not run a parallel identity.

## Palette

```css
--tan: #E4DAC6;
--tan-light: #FBF8F1;
--leather: #1E140F;
--leather-dark: #120C08;
--rust: #A9812E;        /* primary accent — buttons, active states, stat numbers */
--rope: #7C6448;        /* borders, secondary text, dividers */
--ink: #2A2420;          /* body text */
--cream: #F4EFE4;        /* base content background */
--green: #4B5A3C;        /* success / status-positive */
--brass-light: #C9A54F;
--oxblood: #5C2430;      /* alerts, destructive actions */
```

## Type

- **Display / headings:** Playfair Display, weight 700–900
- **Body / UI:** Work Sans, weights 400–700
- **Numerals (stats, classification numbers):** JetBrains Mono, weight 600–700

## The `.tag` component — reuse as-is for team numbers

Steer Me already solved "display a person's number" with a circular brass/leather
medallion (`.tag` / `.tag.big`): radial brass-to-rust gradient, dark border, inset
highlight ring, number centered in Playfair Display. Draw Pro's team number is the
same UI problem — a number identifying an entrant/team — so it should use this
exact component, not a new one. Consistency across the suite matters more here than
a Draw Pro–specific signature.

```css
.tag{
  width:56px; height:56px; border-radius:50%;
  background:linear-gradient(155deg, var(--brass-light) 0%, var(--rust) 55%, #6E5119 100%);
  border:2px solid #4a3813;
  display:flex; align-items:center; justify-content:center;
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.15), inset 0 2px 5px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3);
}
.tag span{ font-family:'Playfair Display', serif; font-weight:900; color:#2A2005; font-size:15px; }
.tag.big{ width:96px; height:96px; }
.tag.big span{ font-size:26px; }
```

## Other reused patterns

- **Topbar:** leather background, radial rust glow accent, Playfair Display title,
  cream text
- **Cards:** tan-light background, rope border, rust left-border accent (4px) —
  used for ledger-style rows (Steer Me's partner cards; Draw Pro's run-order rows)
- **Buttons:** `.btn-primary` (rust fill, cream text), `.btn-outline` (leather
  border), `.btn-ghost` (tan-light, rope border)
- **Stat row:** tan-light tiles, JetBrains Mono number in rust, uppercase label in leather
- **Alert/flag state:** oxblood — used for anything needing producer attention
  (Draw Pro: spacing conflicts, cap-violation attempts)
- **Status pill:** small uppercase tag, background rust or leather depending on context
- **Toast:** leather background, cream text, bottom-anchored, fades in/out

## Layout convention

Steer Me is built as a phone-frame mobile app mockup (390px width, rounded
leather-dark bezel) — appropriate since it's entrant/roper-facing, used standing at
the arena. Draw Pro's **entrant-facing** pages should follow the same phone-frame
convention for consistency, since it's functionally the same persona in the same
context (someone on their phone, often at an event).

Draw Pro's **producer-facing** dashboard is a different context — office staff at a
desk, often managing several events — so it doesn't need to be forced into a phone
frame. It should still use the same palette, type, and component patterns (topbar,
cards, `.tag`, stat rows), just laid out for a wider desktop surface.
