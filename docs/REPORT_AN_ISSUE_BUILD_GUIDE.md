# Report an Issue — Manual Build Guide (Lightbox + site-wide Footer link)

This is deliberately **not** a per-page feature. Wix has no per-page
favicon-style setting for something like this either — a Lightbox opened
from a link in the site's shared Footer is the correct site-wide
mechanism, appearing on every page (Draw Pro, Coaching, landing) the same
way the site favicon already does, without adding anything to individual
pages. Backend module: `velo/backend/issueReports.jsw` (already written and
pushed to the real `roping-tools` repo — see that file for the full
`submitIssueReport()` implementation). Data model: `IssueReports` in
`data-collections/SCHEMA.md`.

Same rule as the Draw Pro build guide: element IDs below must match the
Editor's Properties panel exactly, or `$w('#idName')` throws "could not be
found" at runtime.

---

## Step 1 — Create the `IssueReports` Data Collection

Content Manager → **Create Collection → Start from scratch** (not CSV
import — see "Collection ID vs. display name" in `SCHEMA.md`; CSV import
locks in a wrong Collection ID permanently). Name it exactly `IssueReports`
so the ID and display name match. Add every field listed in `SCHEMA.md`'s
`IssueReports` section, matching types exactly.

**Permissions** (Collection Settings → Permissions):
- **Insert**: Everyone (a visitor hitting a bug before logging in should
  still be able to report it)
- **View / Update / Delete**: Admin only

---

## Step 2 — Create the Lightbox

Editor → **Pages panel → Lightboxes → Add Lightbox → Blank Lightbox**. Name
it `Report an Issue` (this becomes both the display name and, once you add
code to it, the page-code filename Wix generates — same
`<Display Name>.<ID>.js` convention as every other page in this project;
don't rename it after the fact for the same reason covered in the Producer
Event Setup conversation).

### Elements

| ID | Type | Notes |
|---|---|---|
| `#textTitle` | Text | Static: "Report an Issue" |
| `#radioRole` | Radio button group | Values: `contestant`, `producer` |
| `#inputName` | Text input | Only shown/required if `reporterNameOverride` is needed — see code below for the show/hide logic |
| `#textAreaDescription` | Text area | "What happened?" |
| `#uploadButtonScreenshot` | Upload Button | Optional. Wix's native element — uploads straight to Wix Media Manager, no custom storage needed |
| `#btnSubmit` | Button | |
| `#textStatus` | Text | Hidden by default — shows either an error or the "thanks, got it" confirmation |
| `#btnClose` | Button | Standard Lightbox close (`wixWindow.lightbox.close()`) |

### Page code

Paste into this Lightbox's code panel (the file Wix generates once you add
any code to it):

```js
import wixWindow from 'wix-window';
import wixLocationFrontend from 'wix-location-frontend';
import { currentMember } from 'wix-members-frontend';
import { submitIssueReport } from 'backend/issueReports';

$w.onReady(async function () {
  $w('#textStatus').hide();

  // Best-effort: if a member's already logged in and has a resolvable
  // display name, skip asking for one. If this project's actual member
  // profile shape differs (e.g. Draw Pro identity isn't a Wix Member at
  // all for entrants/producers), this just falls through to showing the
  // name field - never blocks submission either way.
  let hasResolvableName = false;
  try {
    const member = await currentMember.getMember();
    hasResolvableName = !!(member && member.contactDetails && member.contactDetails.firstName);
  } catch (e) {
    hasResolvableName = false;
  }
  if (hasResolvableName) {
    $w('#inputName').collapse();
  }

  let screenshotUrl = null;

  $w('#uploadButtonScreenshot').onChange(() => {
    if ($w('#uploadButtonScreenshot').value.length > 0) {
      $w('#uploadButtonScreenshot').startUpload()
        .then((uploadedFile) => {
          // uploadedFile.url per Wix's UploadButton reference - if a future
          // Velo API version returns the URL somewhere else on this object,
          // check https://www.wix.com/velo/reference/$w/uploadbutton first.
          screenshotUrl = uploadedFile.url;
        })
        .catch(() => {
          $w('#textStatus').text = 'Could not upload screenshot - you can still submit without it.';
          $w('#textStatus').show();
        });
    }
  });

  $w('#btnSubmit').onClick(async () => {
    const description = $w('#textAreaDescription').value.trim();
    const role = $w('#radioRole').value;
    const nameOverride = $w('#inputName').value ? $w('#inputName').value.trim() : '';

    if (!description) {
      $w('#textStatus').text = 'Please describe what happened.';
      $w('#textStatus').show();
      return;
    }
    if (!role) {
      $w('#textStatus').text = 'Please select contestant or producer.';
      $w('#textStatus').show();
      return;
    }
    if (!hasResolvableName && !nameOverride) {
      $w('#textStatus').text = 'Please enter your name.';
      $w('#textStatus').show();
      return;
    }

    $w('#btnSubmit').disable();
    try {
      await submitIssueReport({
        role: role,
        description: description,
        pageUrl: wixLocationFrontend.url,
        reporterNameOverride: hasResolvableName ? undefined : nameOverride,
        screenshotUrl: screenshotUrl || undefined
      });
      $w('#textStatus').text = "Thanks - we've got your report and will look into it.";
      $w('#textStatus').show();
      setTimeout(() => wixWindow.lightbox.close(), 1800);
    } catch (err) {
      $w('#textStatus').text = err.message || 'Could not submit report - try again.';
      $w('#textStatus').show();
      $w('#btnSubmit').enable();
    }
  });

  $w('#btnClose').onClick(() => wixWindow.lightbox.close());
});
```

---

## Step 3 — Add the trigger link to the site's global Footer

Editor → scroll to the Footer (or open it via the Pages panel's Footer
section — it's shared across every page by default, which is exactly what
makes this "every page" without per-page work). Add a text link or small
button: **"Report an Issue"**.

Wire its click handler (Footer has its own page-code file, separate from
any individual page):

```js
import wixWindow from 'wix-window';

$w.onReady(function () {
  $w('#linkReportIssue').onClick(() => {
    wixWindow.openLightbox('Report an Issue');
  });
});
```

`openLightbox()` takes the Lightbox's **name** (what you typed in Step 2),
not its element ID.

---

## Verifying it actually appears everywhere

Once the Footer link is wired, visit the landing page, a Draw Pro page, and
a Coaching page and confirm the link shows up identically on all three
without having touched any of those individual pages — that's the whole
point of using the Footer instead of adding a button per page.
