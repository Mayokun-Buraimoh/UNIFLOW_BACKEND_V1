#!/usr/bin/env node
/**
 * Check Google Sign-In configuration (local .env and optional live API).
 *
 * Usage (from backend/):
 *   npm run check:google
 *   API_BASE_URL=https://your-api.onrender.com/api npm run check:google
 *
 * Optional — paste an id_token from TestFlight logs (do not commit tokens):
 *   CHECK_GOOGLE_ID_TOKEN="eyJ..." npm run check:google
 */

import 'dotenv/config';

function maskId(s) {
  if (!s || typeof s !== 'string') return '(unset)';
  const t = s.trim();
  if (!t) return '(unset)';
  if (t.length <= 16) return `(${t.length} chars)`;
  return `${t.slice(0, 12)}…${t.slice(-8)} (${t.length} chars)`;
}

function decodeJwtPayload(token) {
  const parts = String(token).trim().split('.');
  if (parts.length !== 3) return null;
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
  return JSON.parse(json);
}

const web = (process.env.GOOGLE_CLIENT_ID || '').trim();
const ios = (process.env.GOOGLE_IOS_CLIENT_ID || '').trim();
const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const callback = (process.env.GOOGLE_CALLBACK_URL || '').trim();
const frontendRedirect = (
  (process.env.FRONTEND_GOOGLE_REDIRECT_URI || '').trim() ||
  (() => {
    const fu = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
    return fu ? `${fu}/auth/google/callback` : '';
  })() ||
  '(defaults to http://localhost:5173/auth/google/callback if unset)'
).trim();

const audiences = [...new Set([web, ios].filter(Boolean))];

if (web && ios && web === ios) {
  console.warn('⚠ GOOGLE_IOS_CLIENT_ID equals GOOGLE_CLIENT_ID — usually iOS should be the separate iOS OAuth client from Google Console.\n');
}

console.log('=== Google auth config (backend .env) ===\n');
console.log(`GOOGLE_CLIENT_ID (web):     ${maskId(web)}`);
console.log(`GOOGLE_IOS_CLIENT_ID:       ${maskId(ios)}`);
console.log(`GOOGLE_CLIENT_SECRET:       ${secret ? '(set)' : '(MISSING — web OAuth + verify need this)'}`);
console.log(`GOOGLE_CALLBACK_URL:        ${callback || '(unset — derived from request on non-Render)'}`);
console.log(`FRONTEND_GOOGLE_REDIRECT:   ${frontendRedirect}`);
console.log(`\nJWT audiences server accepts for POST /auth/google: [${audiences.map(maskId).join(', ')}]`);
if (!audiences.length) {
  console.log('\n✗ At least one of GOOGLE_CLIENT_ID or GOOGLE_IOS_CLIENT_ID must be set for native sign-in.');
}

if (!web) {
  console.log('\n⚠ GOOGLE_CLIENT_ID empty — iOS should use this as serverClientId so id_token aud matches web.');
}
if (!secret) {
  console.log('\n✗ GOOGLE_CLIENT_SECRET missing — verifyIdToken path uses web client + secret; native sign-in will fail.');
}

const debugTok = process.env.CHECK_GOOGLE_ID_TOKEN;
if (debugTok) {
  console.log('\n=== CHECK_GOOGLE_ID_TOKEN (decoded locally, not verified) ===\n');
  try {
    const p = decodeJwtPayload(debugTok);
    if (!p) throw new Error('not a JWT');
    const aud = p.aud;
    const audList = Array.isArray(aud) ? aud : aud ? [aud] : [];
    console.log('  aud:', audList.length ? audList.join(', ') : '(missing)');
    console.log('  iss:', p.iss);
    console.log('  email:', p.email ?? '(not in token — normal for some flows)');
    console.log('  sub:', typeof p.sub === 'string' ? `${p.sub.slice(0, 8)}…` : p.sub);
    const match = audList.some((a) => audiences.includes(a));
    console.log(`\n  aud matches server audiences: ${match ? 'yes' : 'NO — fix GOOGLE_IOS_CLIENT_ID / serverClientId / web client in Google Console'}`);
  } catch (e) {
    console.log('  Could not decode token:', e.message || e);
  }
}

const base = (process.env.API_BASE_URL || '').replace(/\/$/, '');
if (base) {
  console.log(`\n=== Live GET ${base}/auth/google/config ===\n`);
  try {
    const res = await fetch(`${base}/auth/google/config`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
    const liveWeb = data?.google?.webClientId;
    const liveIos = data?.google?.iosClientId;
    if (web && liveWeb && web !== liveWeb) {
      console.log('\n⚠ Local .env GOOGLE_CLIENT_ID differs from live API response — deploy / Render env may be stale.');
    }
    if (!liveWeb && !liveIos) {
      console.log('\n✗ Live API returned no client IDs — set GOOGLE_CLIENT_ID (and optionally GOOGLE_IOS_CLIENT_ID) on the server.');
    }
  } catch (e) {
    console.log('Fetch failed:', e.message || e);
  }
} else {
  console.log('\n(Tip) Set API_BASE_URL=https://your-host/api to compare with live GET /auth/google/config');
}

console.log('\n=== TestFlight checklist ===');
console.log('1. Ionic app API base URL must point to production (not localhost).');
console.log('2. Google Cloud → iOS OAuth client: bundle ID must match the TestFlight app exactly.');
console.log('3. Native: use web client id as serverClientId so id_token aud is GOOGLE_CLIENT_ID, or set GOOGLE_IOS_CLIENT_ID on API if aud is the iOS client.');
console.log('4. Production host must have GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (and optional GOOGLE_IOS_CLIENT_ID).');
console.log('');
