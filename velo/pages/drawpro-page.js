// velo/pages/drawpro-page.js
//
// Page Code for the /drawpro page hosting the HTML embed of
// public/drawpro/index.html. Same postMessage-bridge pattern as
// velo/pages/course-page.js — see that file's comments and
// docs/ARCHITECTURE.md for the full explanation.
//
// Move into the real repo's src/pages/<actual-page-id>.js once the /drawpro
// page + HTML embed element exist in the Editor (same process as the
// Course page — Wix assigns the real filename, can't be created from the
// IDE ahead of time).

import { joinDrawProWaitlist } from 'backend/drawPro.jsw';

const TRUSTED_EMBED_MESSAGE_SOURCE = 'ropingtools-drawpro';

$w.onReady(function () {
  const iframeEl = $w('#drawProEmbed'); // TODO: confirm actual element ID in the Wix Editor — give the embed element this ID when you create it

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
    case 'joinDrawProWaitlist':
      return joinDrawProWaitlist(payload);
    default:
      throw new Error('Unknown bridge action: ' + action);
  }
}
