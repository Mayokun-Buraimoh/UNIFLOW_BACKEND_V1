#!/usr/bin/env node
/**
 * Quick production readiness probe (no local LibreOffice check).
 * Usage: API_BASE_URL=https://your-api.onrender.com/api node scripts/check-production-remote.mjs
 */

const BASE = (process.env.API_BASE_URL || 'https://uniflow-backend-v1.onrender.com/api').replace(/\/$/, '');

async function main() {
  console.log(`Probing ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  console.log(health.ok ? '✓' : '✗', 'GET /health', health.status);

  const gcfg = await fetch(`${BASE}/auth/google/config`);
  const gjson = await gcfg.json().catch(() => ({}));
  const hasGoogle = Boolean(gjson?.google?.webClientId);
  console.log(hasGoogle ? '✓' : '✗', 'GET /auth/google/config', gcfg.status);

  const email = `probe_${Date.now()}@example.com`;
  const password = 'ProbeCheck#2026!x';
  let r = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Probe' }),
  });
  if (!r.ok && r.status !== 409) {
    console.log('✗', 'POST /auth/register', r.status);
    process.exit(1);
  }
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { token } = await r.json();
  if (!token) {
    console.log('✗', 'POST /auth/login — no token');
    process.exit(1);
  }
  console.log('✓', 'auth register/login');

  const h = { Authorization: `Bearer ${token}` };
  r = await fetch(`${BASE}/courses/`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: `P${Date.now() % 10000}`, name: 'Probe Course' }),
  });
  const course = await r.json();
  const courseId = course?.id;
  if (!courseId) {
    console.log('✗', 'POST /courses/', r.status, course);
    process.exit(1);
  }

  const fd = new FormData();
  fd.append('file', new Blob(['line1\nline2\n'], { type: 'text/plain' }), 'probe.txt');
  r = await fetch(`${BASE}/courses/${courseId}/files`, { method: 'POST', headers: h, body: fd });
  const conv = await r.json().catch(() => ({}));
  const libreOk = r.status === 201 && conv?.mimeType === 'application/pdf';
  console.log(libreOk ? '✓' : '✗', 'LibreOffice (txt→pdf)', r.status, conv?.error || '');

  const pdfStr = '%PDF-1.1\n1 0 obj\n<<>>endobj\ntrailer\n<<>>\n%%EOF\n';
  const fd2 = new FormData();
  fd2.append('file', new Blob([pdfStr], { type: 'application/pdf' }), 'probe.pdf');
  r = await fetch(`${BASE}/courses/${courseId}/files`, { method: 'POST', headers: h, body: fd2 });
  const pdfUp = await r.json().catch(() => ({}));
  const cloudOk = Boolean(pdfUp?.cloudinaryUrl);
  console.log(r.status === 201 ? '✓' : '✗', 'PDF upload', r.status);
  console.log(cloudOk ? '✓' : '✗', 'CLOUDINARY_URL (cloudinaryUrl in response)', cloudOk ? 'set' : 'missing — set CLOUDINARY_URL on Render');

  console.log('\nDone. Fix any ✗ before expecting localhost parity on hosted API.');
  if (!libreOk || !cloudOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
