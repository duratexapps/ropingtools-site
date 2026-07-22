// velo/pages/course-page.js
//
// Page Code for whichever Wix page hosts the HTML iframe embed of
// public/course-embed.html. This is NOT a .jsw file — it's frontend Page
// Code, which runs in the real Wix page's browser context (unlike the
// sandboxed iframe) and therefore has access to `import`-ing backend/*.jsw
// modules with the visitor's actual Wix session attached.
//
// Once this site's real Wix-provisioned repo exists (via Git Integration &
// Wix CLI), move this file to that repo's src/pages/<actual-page-id>.js —
// the filename/location here is illustrative, Wix assigns real page code
// files by page ID once the page exists in the Editor.
//
// $w.onReady wiring, the exact iframe element ID (assumed here as
// '#courseEmbed'), and confirming postMessage delivery into/out of a Wix
// HTML embed element all need to be verified against the live editor —
// this file is written from the documented Velo API surface, not tested
// against a real site yet.

import { authentication, currentMember } from 'wix-members-frontend';
import { analyzeRoping } from 'backend/aiCoach.jsw';
import { recordQuizResult } from 'backend/progress.jsw';
import { submitFeedback } from 'backend/feedback.jsw';
import { acknowledgeRisk, hasAcknowledgedCurrentVersion } from 'backend/legalAcknowledgments.jsw';
import { getChapterContent } from 'backend/content.jsw';

// Must match the production origin used in public/course-embed.html's
// PARENT_ORIGIN constant once that's locked down — keep these two in sync.
const TRUSTED_EMBED_MESSAGE_SOURCE = 'ropingtools-course';

$w.onReady(function () {
  const iframeEl = $w('#courseEmbed'); // TODO: confirm actual element ID in the Wix Editor

  iframeEl.onMessage((event) => {
    const msg = event.data;
    if (!msg || msg.source !== TRUSTED_EMBED_MESSAGE_SOURCE || !msg.reqId) return;

    handleAction(msg.action, msg.payload)
      .then((result) => {
        iframeEl.postMessage({ source: 'ropingtools-parent', reqId: msg.reqId, result: result });
      })
      .catch((err) => {
        iframeEl.postMessage({ source: 'ropingtools-parent', reqId: msg.reqId, error: err.message || String(err) });
      });
  });
});

async function handleAction(action, payload) {
  switch (action) {
    case 'analyzeRoping':
      return analyzeRoping(payload);
    case 'recordQuizResult':
      return recordQuizResult(payload);
    case 'submitFeedback':
      return submitFeedback(payload);
    case 'acknowledgeRisk':
      return acknowledgeRisk(payload);
    case 'hasAcknowledgedCurrentVersion':
      return hasAcknowledgedCurrentVersion(payload);
    case 'getChapterContent':
      return getChapterContent(payload);
    case 'checkIsLoggedIn':
      return checkIsLoggedIn();
    case 'promptLogin':
      return promptLoginAndWait();
    default:
      throw new Error('Unknown bridge action: ' + action);
  }
}

/* ------------------------------------------------------------------ */
/* Login gate - added 2026-07-22 so every risk-disclaimer acknowledgment
 * is guaranteed to be tied to a real, identified member. Previously the
 * free preview chapter (and the disclaimer modal itself) never required
 * login at all, so acknowledgeRisk() silently failed for anyone not
 * already signed in - see ARCHITECTURE.md's "Course disclaimer had no
 * real log for anonymous visitors" entry for the full reasoning. Content
 * (including the free chapter) now waits behind this gate; the
 * disclaimer modal only ever shows to someone already logged in. */
/* ------------------------------------------------------------------ */

// wix-members-frontend's currentMember.getMember() resolves null when
// nobody's logged in (unlike the backend version in legalAcknowledgments.jsw,
// which throws) - worth double-checking against Wix's current reference if
// this ever behaves unexpectedly: https://www.wix.com/velo/reference/wix-members-frontend/currentmember
async function checkIsLoggedIn() {
  try {
    const member = await currentMember.getMember();
    return !!member;
  } catch (e) {
    return false;
  }
}

// promptLogin() opens Wix's own hosted login lightbox, which already
// includes a "Sign up" path - no separate custom signup form needed.
// Resolves once the visitor is actually logged in; rejects if they close
// it without completing (caller should just leave the gate up in that case).
async function promptLoginAndWait() {
  await authentication.promptLogin({ mode: 'login' });
  return checkIsLoggedIn();
}
