// backend/http-functions.js
//
// Wix HTTP Functions — plain REST endpoints reachable at
// https://www.ropingtools.com/_functions/<name>, callable via a normal
// fetch() from client-side JS anywhere, including from inside a sandboxed
// HTML embed iframe.
//
// Added as a replacement for the $w('#id').onMessage()/postMessage bridge
// pattern (see velo/pages/*.js and docs/ARCHITECTURE.md), after live testing
// showed $w('#drawProEmbed') consistently returns an empty array in Preview
// on the "Custom Embeds"/"Embed a Widget" element — the classic HTML
// Component messaging API Wix's own docs describe doesn't appear to apply
// to whatever component type this Editor version actually creates.
//
// PERMISSIONS NOTE: wix-auth's elevate() does not appear to work in this
// HTTP Function context (tested multiple ways, all failed — see
// backend/drawPro.jsw's comment for the full story). Collections called
// from here need their own permissions opened for the specific operation
// needed (e.g. "Add" for Everyone), rather than relying on elevate() to
// bypass an Admin-only lock from backend code.
//
// CORS: headers are set explicitly and permissively (Access-Control-Allow-
// Origin: *) since it's genuinely unclear whether the HTML embed iframe is
// same-origin with www.ropingtools.com or served from a different Wix asset
// domain (filesusr.com was observed in one network trace). Setting these
// headers is harmless even if the request turns out to be same-origin.
// Tighten to the exact production origin once that's confirmed, same as the
// PARENT_ORIGIN lockdown already done in the embed files.

import { ok, badRequest, serverError } from 'wix-http-functions';
import { joinDrawProWaitlist } from 'backend/drawPro.jsw';
import { currentMember } from 'wix-members-backend';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

/* ------------------------------------------------------------------ */
/* TEMPORARY DIAGNOSTIC — /_functions/whoAmI                           */
/* Reports whether an HTTP Function can identify the calling member.  */
/* Remove once the course-backend member-identity question is settled. */
/* Unlike the other endpoints, this reflects the request's actual      */
/* Origin header (rather than '*') and allows credentials, since a     */
/* credentialed fetch() is required to test whether session cookies    */
/* reach an HTTP Function at all — browsers refuse to send credentials */
/* to a wildcard-origin CORS response.                                 */
/* ------------------------------------------------------------------ */

function corsHeadersForRequest(request) {
  const origin = (request.headers && request.headers.origin) || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

export async function options_whoAmI(request) {
  return ok({ headers: corsHeadersForRequest(request) });
}

export async function get_whoAmI(request) {
  const headers = corsHeadersForRequest(request);
  try {
    const member = await currentMember.getMember();
    return ok({
      headers,
      body: {
        identified: true,
        memberId: member ? member._id : null,
        loginEmail: member && member.loginEmail ? member.loginEmail : null
      }
    });
  } catch (err) {
    return ok({
      headers,
      body: {
        identified: false,
        error: err && err.message ? err.message : String(err)
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* /_functions/joinDrawProWaitlist                                     */
/* ------------------------------------------------------------------ */

export async function options_joinDrawProWaitlist(request) {
  // CORS preflight — browsers send this automatically before the real POST
  // for cross-origin requests with a JSON content-type. No body needed.
  return ok({ headers: CORS_HEADERS });
}

export async function post_joinDrawProWaitlist(request) {
  try {
    const payload = await request.body.json();
    const result = await joinDrawProWaitlist(payload);
    return ok({
      headers: CORS_HEADERS,
      body: result
    });
  } catch (err) {
    // Validation errors (bad email, etc.) come from joinDrawProWaitlist as
    // thrown Errors with a user-facing message — surface those as 400s
    // rather than masking them as generic 500s.
    const message = err && err.message ? err.message : 'Something went wrong.';
    const isValidationError = /doesn't look valid|required|invalid/i.test(message);
    const responder = isValidationError ? badRequest : serverError;
    return responder({
      headers: CORS_HEADERS,
      body: { error: message }
    });
  }
}
