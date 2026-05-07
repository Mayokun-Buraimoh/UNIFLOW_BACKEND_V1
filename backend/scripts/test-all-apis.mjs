#!/usr/bin/env node
/**
 * Smoke-test all HTTP routes mounted in src/app.ts.
 * Usage: from UNIFLOW_BACKEND: npm run test:apis
 * Env: API_BASE_URL (default http://127.0.0.1:3000/api)
 *      PURGE_USER=1 — after tests, DELETE /api/users/me (destructive)
 *      FAIL_ON_MISSING_PUSH=1 — fail if POST /push-tokens/ returns 404 (old API binary)
 */

const BASE = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');

const tests = [];
let token = '';
let password = 'TestApis#2026!x';
const email = `apitest_${Date.now()}@example.com`;

function record(name, method, path, status, ok, note = '') {
  tests.push({ name, method, path, status, ok, note });
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} [${status}] ${method} ${path}${note ? ` — ${note}` : ''}`);
}

async function http(method, path, { headers = {}, body, json = true } = {}) {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const h = { ...headers };
  if (body !== undefined && json && typeof body === 'object' && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
  }
  const init = { method, headers: h };
  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { res, data, text };
}

function expect(res, allowed, name, method, path, note) {
  const ok = Array.isArray(allowed) ? allowed.includes(res.status) : res.status === allowed;
  record(name, method, path, res.status, ok, note);
  return ok;
}

async function main() {
  console.log(`API_BASE_URL=${BASE}\n`);

  // --- Public ---
  {
    const { res, data } = await http('GET', '/health');
    expect(res, 200, 'health', 'GET', '/health');
    if (!data?.status) console.warn('  (unexpected body)', data);
  }

  {
    const { res, data } = await http('POST', '/auth/register', {
      body: { name: 'API Tester', email, password },
    });
    expect(res, 201, 'auth register', 'POST', '/auth/register');
    if (data?.token) token = data.token;
    else console.error('  No token; aborting authenticated tests.');
  }

  if (!token) {
    console.error('\nStopping: registration failed (is the server the UNIFLOW_BACKEND from this repo?)');
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };

  {
    const { res, data } = await http('POST', '/auth/login', {
      body: { email, password },
    });
    expect(res, 200, 'auth login', 'POST', '/auth/login');
    if (data?.token) token = data.token;
  }

  {
    const { res } = await http('GET', '/auth/google', { redirect: 'manual' });
    const ok = [302, 301, 307, 200, 500].includes(res.status);
    record('auth google start', 'GET', '/auth/google', res.status, ok, '302/redirect or config');
  }

  {
    const { res } = await http('GET', '/auth/google/callback', { redirect: 'manual' });
    const ok = [302, 301, 307, 400, 401, 500, 200].includes(res.status);
    record('auth google callback (no code)', 'GET', '/auth/google/callback', res.status, ok);
  }

  {
    const { res, data } = await http('GET', '/auth/me', { headers: auth });
    expect(res, 200, 'auth me', 'GET', '/auth/me', data?.email ? '' : 'check body');
  }

  {
    const { res } = await http('POST', '/auth/change-password', {
      headers: auth,
      body: { currentPassword: password, newPassword: `${password}New` },
    });
    expect(res, 200, 'auth change-password', 'POST', '/auth/change-password');
    password = `${password}New`;
    const { data: d2 } = await http('POST', '/auth/login', {
      body: { email, password },
    });
    if (d2?.token) token = d2.token;
  }

  const auth2 = { Authorization: `Bearer ${token}` };

  // --- Users ---
  {
    const { res, data } = await http('GET', '/users/me', { headers: auth2 });
    expect(res, 200, 'users me', 'GET', '/users/me');
  }

  {
    const { res } = await http('PATCH', '/users/me', {
      headers: auth2,
      body: { name: 'API Tester Updated' },
    });
    expect(res, 200, 'users patch me', 'PATCH', '/users/me');
  }

  {
    const { res, data } = await http('GET', '/users/', { headers: auth2 });
    expect(res, 200, 'users list', 'GET', '/users/', Array.isArray(data) ? `${data.length} rows` : '');
  }

  // --- Profiles ---
  {
    const { res } = await http('GET', '/profiles/', { headers: auth2 });
    expect(res, 200, 'profiles get', 'GET', '/profiles/');
  }

  {
    const { res } = await http('PATCH', '/profiles/', {
      headers: auth2,
      body: { name: 'Prof Name' },
    });
    expect(res, [200, 204], 'profiles patch', 'PATCH', '/profiles/');
  }

  {
    const { res } = await http('PATCH', '/profiles/notifications', {
      headers: auth2,
      body: { notificationSettings: { push: true } },
    });
    expect(res, [200, 204], 'profiles notifications', 'PATCH', '/profiles/notifications');
  }

  {
    const { res } = await http('PATCH', '/profiles/study-goals', {
      headers: auth2,
      body: { studyGoals: { hours: 5 } },
    });
    expect(res, [200, 204], 'profiles study-goals', 'PATCH', '/profiles/study-goals');
  }

  {
    const { res } = await http('PATCH', '/profiles/preferences', {
      headers: auth2,
      body: { preferences: { theme: 'light' } },
    });
    expect(res, [200, 204], 'profiles preferences', 'PATCH', '/profiles/preferences');
  }

  // --- Tasks ---
  {
    const { res } = await http('GET', '/tasks/', { headers: auth2 });
    expect(res, 200, 'tasks list', 'GET', '/tasks/');
  }

  {
    const { res } = await http('GET', '/tasks/stats', { headers: auth2 });
    expect(res, 200, 'tasks stats', 'GET', '/tasks/stats');
  }

  let taskId = '';
  {
    const { res, data } = await http('POST', '/tasks/', {
      headers: auth2,
      body: {
        title: 'Smoke task',
        description: 'from test-all-apis',
        priority: 'low',
        status: 'pending',
      },
    });
    expect(res, 201, 'tasks create', 'POST', '/tasks/');
    if (data?.id) taskId = data.id;
  }

  if (taskId) {
    {
      const { res } = await http('GET', `/tasks/${taskId}`, { headers: auth2 });
      expect(res, 200, 'tasks get by id', 'GET', `/tasks/${taskId}`);
    }
    {
      const { res } = await http('PUT', `/tasks/${taskId}`, {
        headers: auth2,
        body: { title: 'Smoke task updated', priority: 'medium' },
      });
      expect(res, 200, 'tasks put', 'PUT', `/tasks/${taskId}`);
    }
    {
      const { res } = await http('PATCH', `/tasks/${taskId}/toggle`, { headers: auth2 });
      expect(res, [200, 204], 'tasks toggle', 'PATCH', `/tasks/${taskId}/toggle`);
    }
    {
      const { res } = await http('DELETE', `/tasks/${taskId}`, { headers: auth2 });
      expect(res, [200, 204], 'tasks delete', 'DELETE', `/tasks/${taskId}`);
    }
  }

  // --- Schedule ---
  {
    const { res } = await http('GET', '/schedule/', { headers: auth2 });
    expect(res, 200, 'schedule get', 'GET', '/schedule/');
  }

  {
    const { res } = await http('PUT', '/schedule/', {
      headers: auth2,
      body: {
        data: {
          Mon: ['09:00 Math'],
          Tue: [],
        },
      },
    });
    expect(res, [200, 201], 'schedule put', 'PUT', '/schedule/');
  }

  // --- Courses ---
  {
    const { res } = await http('GET', '/courses/', { headers: auth2 });
    expect(res, 200, 'courses list', 'GET', '/courses/');
  }

  let courseId = '';
  {
    const { res, data } = await http('POST', '/courses/', {
      headers: auth2,
      body: { code: 'TST101', name: 'API Test Course' },
    });
    expect(res, 201, 'courses create', 'POST', '/courses/');
    if (data?.id) courseId = data.id;
  }

  if (courseId) {
    {
      const { res } = await http('GET', `/courses/${courseId}`, { headers: auth2 });
      expect(res, 200, 'courses get', 'GET', `/courses/${courseId}`);
    }
    {
      const { res } = await http('PATCH', `/courses/${courseId}`, {
        headers: auth2,
        body: { name: 'API Test Course (patched)' },
      });
      expect(res, [200, 204], 'courses patch', 'PATCH', `/courses/${courseId}`);
    }

    {
      const { res } = await http('POST', '/courses/moodle/connect', {
        headers: auth2,
        body: { moodleUrl: 'https://moodle.example.edu' },
      });
      expect(res, 200, 'moodle connect (no token)', 'POST', '/courses/moodle/connect');
    }

    {
      const { res } = await http('GET', '/courses/moodle/connection', { headers: auth2 });
      expect(res, 200, 'moodle connection status', 'GET', '/courses/moodle/connection');
    }

    {
      const { res } = await http('POST', '/courses/moodle/sync', { headers: auth2 });
      const ok = [200, 500].includes(res.status);
      record('moodle sync', 'POST', '/courses/moodle/sync', res.status, ok, '500 expected without real token');
    }

    // Notes
    let noteId = '';
    {
      const { res, data } = await http('GET', `/courses/${courseId}/notes`, { headers: auth2 });
      expect(res, 200, 'course notes list', 'GET', `/courses/${courseId}/notes`);
    }
    {
      const { res, data } = await http('POST', `/courses/${courseId}/notes`, {
        headers: auth2,
        body: { title: 'N1', content: 'Hello note body' },
      });
      expect(res, 201, 'course notes create', 'POST', `/courses/${courseId}/notes`);
      if (data?.id) noteId = data.id;
    }
    if (noteId) {
      {
        const { res } = await http('PATCH', `/courses/${courseId}/notes/${noteId}`, {
          headers: auth2,
          body: { content: 'Updated body' },
        });
        expect(res, 200, 'course notes patch', 'PATCH', `/courses/.../notes/...`);
      }
      {
        const { res } = await http('DELETE', `/courses/${courseId}/notes/${noteId}`, {
          headers: auth2,
        });
        expect(res, [200, 204], 'course notes delete', 'DELETE', `/courses/.../notes/...`);
      }
    }

    // Files: minimal PDF (no LibreOffice conversion)
    let fileId = '';
    {
      const { res, data } = await http('GET', `/courses/${courseId}/files`, { headers: auth2 });
      expect(res, 200, 'course files list', 'GET', `/courses/${courseId}/files`);
    }
    {
      const pdfStr =
        '%PDF-1.1\n1 0 obj\n<<>>endobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1>>endobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 12 12]>>endobj\nxref\n0 4\ntrailer\n<< /Size 4 /Root 1 0 R>>\nstartxref\n120\n%%EOF\n';
      const pdf = Buffer.from(pdfStr, 'utf8');
      const blob = new Blob([pdf], { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('file', blob, 'smoke.pdf');

      const url = `${BASE}/courses/${courseId}/files`;
      const res = await fetch(url, { method: 'POST', headers: auth2, body: fd });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      const ok = res.status === 201;
      record('course files upload (pdf)', 'POST', `/courses/${courseId}/files`, res.status, ok);
      if (data?.id) fileId = data.id;
    }

    if (fileId) {
      {
        const { res } = await http('GET', `/courses/${courseId}/files/${fileId}`, { headers: auth2 });
        expect(res, 200, 'course file download', 'GET', `/courses/.../files/...`);
      }
      {
        const { res } = await http('DELETE', `/courses/${courseId}/files/${fileId}`, {
          headers: auth2,
        });
        expect(res, [200, 204], 'course file delete', 'DELETE', `/courses/.../files/...`);
      }
    }

    {
      const { res } = await http('DELETE', `/courses/${courseId}`, { headers: auth2 });
      expect(res, [200, 204], 'courses delete', 'DELETE', `/courses/${courseId}`);
    }
  }

  // --- Events ---
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  {
    const { res } = await http('GET', '/events/', { headers: auth2 });
    expect(res, 200, 'events list', 'GET', '/events/');
  }

  let eventId = '';
  {
    const { res, data } = await http('POST', '/events/', {
      headers: auth2,
      body: { title: 'API event', time: '10:00', date: dateStr, priority: 'low' },
    });
    expect(res, 201, 'events create', 'POST', '/events/');
    if (data?.id) eventId = data.id;
  }

  if (eventId) {
    {
      const { res } = await http('GET', `/events/?date=${encodeURIComponent(dateStr)}`, {
        headers: auth2,
      });
      expect(res, 200, 'events list by date', 'GET', '/events/?date=');
    }
    {
      const { res } = await http('GET', `/events/${eventId}`, { headers: auth2 });
      expect(res, 200, 'events get', 'GET', `/events/${eventId}`);
    }
    {
      const { res } = await http('PUT', `/events/${eventId}`, {
        headers: auth2,
        body: { title: 'API event updated' },
      });
      expect(res, 200, 'events put', 'PUT', `/events/${eventId}`);
    }
    {
      const { res } = await http('DELETE', `/events/${eventId}`, { headers: auth2 });
      expect(res, [200, 204], 'events delete', 'DELETE', `/events/${eventId}`);
    }
  }

  // --- Push tokens (require this repo’s app.ts with /api/push-tokens) ---
  const strictPush = process.env.FAIL_ON_MISSING_PUSH === '1';
  const pushTok = `test-fcm-${Date.now()}`;
  {
    const { res } = await http('POST', '/push-tokens/', {
      headers: auth2,
      body: { token: pushTok, platform: 'android' },
    });
    const ok = res.status === 201 || (!strictPush && res.status === 404);
    record(
      'push-tokens register',
      'POST',
      '/push-tokens/',
      res.status,
      ok,
      res.status === 404 ? 'SKIPPED: route missing — run API from this repo (UNIFLOW_BACKEND)' : ''
    );
  }

  {
    const { res } = await http('DELETE', '/push-tokens/', {
      headers: auth2,
      body: { token: pushTok },
      json: true,
    });
    const ok = res.status === 200 || (!strictPush && res.status === 404);
    record(
      'push-tokens delete',
      'DELETE',
      '/push-tokens/',
      res.status,
      ok,
      res.status === 404 ? 'SKIPPED: route missing' : ''
    );
  }

  if (process.env.PURGE_USER === '1') {
    const { res } = await http('DELETE', '/users/me', { headers: auth2 });
    record('users delete me (PURGE_USER=1)', 'DELETE', '/users/me', res.status, [200, 204].includes(res.status));
  }

  // Summary
  const failed = tests.filter((t) => !t.ok);
  console.log('\n--- Summary ---');
  console.log(`Total: ${tests.length}, passed: ${tests.length - failed.length}, failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  ${f.method} ${f.path} → ${f.status}`));
    process.exit(1);
  }
  console.log('All checked routes returned expected status codes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
