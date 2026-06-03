#!/usr/bin/env node
/**
 * Integration smoke test: Plans API + Ruby navigate_to ownership.
 * Usage: API_BASE_URL=http://127.0.0.1:3000/api node scripts/test-plans-phaseb.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const BASE = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const email = `phaseb_${Date.now()}@example.com`;
const password = 'PhaseB#Test2026!';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function http(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* text */
  }
  return { status: res.status, data, text };
}

async function main() {
  console.log(`Testing Phase B at ${BASE}\n`);

  // Health
  {
    const { status } = await http('GET', '/health');
    ok('GET /health', status === 200, `status=${status}`);
    if (status !== 200) {
      console.error('\nStart backend first: cd backend && npm run dev');
      process.exit(1);
    }
  }

  // Register + token
  let token = '';
  let userId = '';
  {
    const { status, data } = await http('POST', '/auth/register', {
      body: { name: 'Phase B Tester', email, password },
    });
    ok('POST /auth/register', status === 201 || status === 200, `status=${status}`);
    token = data?.token || data?.accessToken || '';
    userId = data?.user?.id || '';
    ok('auth token received', !!token);
    ok('user id received', !!userId, userId);
  }

  // Plans CRUD
  let planId = '';
  {
    const { status, data } = await http('GET', '/plans/', { token });
    ok('GET /plans/ (empty)', status === 200, `status=${status}`);
    ok('plans array', Array.isArray(data?.plans), JSON.stringify(data)?.slice(0, 80));
  }

  {
    const { status, data } = await http('POST', '/plans/', {
      token,
      body: { title: 'Finals Study Plan', isCustom: true },
    });
    ok('POST /plans/', status === 201 || status === 200, `status=${status}`);
    planId = data?.plan?.id || '';
    ok('plan id is uuid', /^[0-9a-f-]{36}$/i.test(planId), planId);
  }

  {
    const { status, data } = await http('GET', `/plans/${planId}`, { token });
    ok('GET /plans/:id', status === 200, `status=${status}`);
    ok('plan title', data?.plan?.title === 'Finals Study Plan');
  }

  {
    const { status, data } = await http('PATCH', `/plans/${planId}`, {
      token,
      body: {
        title: 'Finals Plan Renamed',
        targets: [{ id: 't1', title: 'Review notes', completed: false }],
      },
    });
    ok('PATCH /plans/:id', status === 200, `status=${status}`);
    ok('progress computed', typeof data?.plan?.progress === 'number');
  }

  {
    const { status } = await http('GET', '/plans/not-a-uuid', { token });
    ok('GET /plans/:id rejects bad uuid', status === 400, `status=${status}`);
  }

  // Second user cannot read first user's plan
  {
    const reg = await http('POST', '/auth/register', {
      body: { name: 'Other User', email: `other_${Date.now()}@example.com`, password },
    });
    const otherToken = reg.data?.token || reg.data?.accessToken || '';
    const { status } = await http('GET', `/plans/${planId}`, { token: otherToken });
    ok('plan ownership enforced', status === 404, `status=${status}`);
  }

  // Ruby navigate_to (pure + DB) via compiled dist
  try {
    const { resolveRubyTabScreen, rubyNavigateTo } = require('../dist/services/rubyAppTools.js');
    const tab = resolveRubyTabScreen('weekly_schedule');
    ok('resolveRubyTabScreen weekly_schedule', tab.ok && tab.path === '/weekly-schedule');

    const bad = resolveRubyTabScreen('unknown');
    ok('resolveRubyTabScreen unknown fails', !bad.ok);

    const navPlan = await rubyNavigateTo('00000000-0000-4000-8000-000000000001', {
      screen: 'plan',
      planId,
    });
    ok('rubyNavigateTo plan ownership (other user id)', !navPlan.ok);

    const navOwn = await rubyNavigateTo(userId, { screen: 'plan', planId });
    ok('rubyNavigateTo own plan', navOwn.ok && navOwn.path === `/plans/${planId}`, navOwn.path || navOwn.error);
  } catch (e) {
    ok('rubyAppTools dist import', false, String(e.message || e));
  }

  // Cleanup
  {
    const { status } = await http('DELETE', `/plans/${planId}`, { token });
    ok('DELETE /plans/:id', status === 200 || status === 204, `status=${status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
