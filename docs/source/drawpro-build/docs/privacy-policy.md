# Draw Pro — Privacy Policy (DRAFT)

> **This is a starting draft, not final legal language.** It's mapped directly to
> Draw Pro's actual data model (events, entrants, teams, notifications, scanned
> cards, and entry alerts) so counsel reviewing it can verify it against what the
> software actually collects. Have licensed counsel review and finalize — especially
> the sections on minors and third-party data sharing — before launch. Placeholders
> are marked `[ ]`.

**Effective Date:** [ ]
**Operator:** [RopingTools legal entity name], operating Draw Pro as part of ropingtools.com

---

## 1. What This Covers

This policy explains what information Draw Pro collects when you create an event,
enter an event, or interact with a producer's event through Draw Pro (including via
a QR code from a flier), and what happens to that information.

## 2. Information We Collect

### From entrants (whether self-entered or scanned from a card)
- Name
- Classification number
- Global membership ID *(only if the producer running your event requires it — not
  all producers do)*
- Email address *(required — used to send your team number and partner assignment)*
- Phone number *(optional — collected now for a future text-message notification
  option; not used to send text messages yet)*
- Whether you entered solo or as a pre-formed team, and your chosen role
  (header/heeler)

### From scanned entry cards specifically
- A photo of the physical card you or office staff submitted
- Machine-read (OCR) text extracted from that photo
- A confidence score indicating how certain the extraction was

We store the card image and OCR text so office staff can verify what was read
against the original, and so there's a record to resolve a dispute about what a
card actually said. **Retention:** [ — placeholder; recommend defining a retention
window, e.g. "for the length of the event season plus 12 months," rather than
indefinite storage].

### From producers
- Name and contact information tied to your RopingTools account
- Event details you configure (title, date, cap, entry windows)
- Actions you take in Draw Pro that are logged for accountability, including manual
  draw-sheet overrides and any attempted pairing that would have exceeded an event's
  cap (rejected, but logged)

### From guest entrants (no account)
- The same entrant information above
- A one-way hashed version of your email/phone, used only to enforce a limit on how
  many times you can enter as a guest before being asked to create a free account.
  This hash cannot be reversed back into your email or phone number.

### From visitors who scan a QR code before an event opens
- If you choose to leave an email for a "notify me when entries open" alert, we
  store that email against the specific event, and use it only to send that one
  alert (and, per Section 5, potentially to understand how this channel converts to
  RopingTools accounts).

## 3. How We Use This Information

- To run the draw and assign team numbers
- To notify you of your team number, partner, and (in the future) other event
  logistics, by email or, once available, text message you've opted into
- To let office staff verify scanned card information before it's used in a draw
- To enforce the classification cap rule and prevent entries above a producer's
  stated limit
- To maintain an accountability record of manual draw-sheet changes
- To notify you when an event you're waiting on opens for entries

## 4. What We Don't Do

- We don't sell your information.
- We don't use your classification number, contact info, or entry history for
  advertising unrelated to RopingTools' own products.
- We don't text you unless you've explicitly opted in to SMS notifications (feature
  not yet live) and provided a phone number for that purpose — providing a phone
  number for future use does not by itself constitute that consent.

## 5. Email Alerts & Lead Tracking

If you sign up for a "notify me when entries open" alert via a QR code or entry
link, we may track whether that email later becomes a full RopingTools account, to
help us understand whether this is a useful way for people to discover the
platform. This tracking is limited to a yes/no flag tied to the alert record — it
does not affect how your account, if you create one, otherwise functions.

## 6. Information Shared With Third Parties

Draw Pro uses outside services to do its job, and your information passes through
them as follows:

| Service | What's Shared | Purpose |
|---|---|---|
| Email delivery provider [SendGrid or equivalent — placeholder] | Your email address, team number, partner name | Sending your draw notification |
| OCR / image-recognition provider [Google Cloud Vision or equivalent — placeholder] | The photo of a scanned entry card | Extracting entry information from handwritten cards |
| [SMS provider — once built] | Your phone number, team number | Sending your draw notification by text |
| Wix (platform host) | All of the above, as the underlying hosting/database provider | Running the RopingTools platform itself |

We only share what each service needs to perform its specific function, and we
require these providers to handle your information securely. [ — placeholder for a
standard "we don't allow them to use your data for their own purposes" clause,
confirmed against each vendor's actual data processing agreement.]

## 7. Minors

If you are a parent or legal guardian submitting an entry for a minor, you are
providing that minor's information to us, and you're confirming you have the
authority to do so. See the Minor & Parental Consent Addendum for more detail on
how minor entrant data is handled.

## 8. Your Choices

- **Guest entrants** can create a free account at any time, which does not change
  what information is collected but does remove the guest-entry frequency limit.
- **Correcting your information:** if something about your entry is wrong —
  including a misread scanned card — contact the producer running your event or
  [RopingTools support contact — placeholder] to have it corrected before the draw
  runs.
- **Opting out of future SMS:** once text notifications are available, you'll be
  able to opt out at any time; email notifications (required for entry) cannot be
  turned off, since they're how you receive your team assignment.

## 9. Data Retention

[ — placeholder; recommend defining explicit retention periods for: entrant records
after an event concludes, scanned card images specifically (higher sensitivity —
see Section 2), and audit log entries, rather than leaving any of these as
indefinite by default.]

## 10. Changes to This Policy

[ ] — standard "we may update this policy, we'll notify you of material changes" language.

## 11. Contact

Questions about this policy or your information: [ ]
