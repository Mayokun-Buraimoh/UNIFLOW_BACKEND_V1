/**
 * Lightweight unit checks for Ruby Phase B helpers (no DB).
 * Run: npx ts-node scripts/test-ruby-tools.ts
 */
import assert from 'assert';
import { buildReviewDueDates } from '../src/services/examPrepService';
import { calculatePlanProgress } from '../src/services/planService';
import { parseNavigateResult, resolveRubyTabScreen } from '../src/services/rubyAppTools';

function testResolveRubyTabScreen() {
  const settings = resolveRubyTabScreen('settings');
  assert.strictEqual(settings.ok, true);
  if (settings.ok) {
    assert.strictEqual(settings.path, '/settings');
    assert.strictEqual(settings.mode, 'root');
  }

  const chatbot = resolveRubyTabScreen('CHATBOT');
  assert.strictEqual(chatbot.ok, true);
  if (chatbot.ok) {
    assert.strictEqual(chatbot.path, '/chatbot');
    assert.strictEqual(chatbot.mode, 'forward');
  }

  const bad = resolveRubyTabScreen('not-a-screen');
  assert.strictEqual(bad.ok, false);
}

function testParseNavigateResult() {
  const ok = parseNavigateResult(JSON.stringify({ ok: true, path: '/plans/uuid', mode: 'root' }));
  assert.deepStrictEqual(ok, { path: '/plans/uuid', mode: 'root' });

  const forward = parseNavigateResult(JSON.stringify({ ok: true, path: '/chatbot', mode: 'forward' }));
  assert.deepStrictEqual(forward, { path: '/chatbot', mode: 'forward' });

  assert.strictEqual(parseNavigateResult('not json'), null);
  assert.strictEqual(parseNavigateResult(JSON.stringify({ ok: false })), null);
}

function testCalculatePlanProgress() {
  assert.strictEqual(calculatePlanProgress([], []), 0);
  assert.strictEqual(
    calculatePlanProgress(
      [{ id: '1', title: 'a', completed: true }],
      [{ id: '2', title: 'b', completed: false }]
    ),
    50
  );
  assert.strictEqual(
    calculatePlanProgress(
      [{ id: '1', title: 'a', completed: true }],
      [{ id: '2', title: 'b', completed: true }]
    ),
    100
  );
}

function testBuildReviewDueDates() {
  assert.deepStrictEqual(buildReviewDueDates('2026-06-08', '2026-06-02'), [
    '2026-06-05',
    '2026-06-06',
    '2026-06-07',
  ]);
  assert.deepStrictEqual(buildReviewDueDates('2026-06-08', '2026-06-07'), ['2026-06-07']);
  assert.deepStrictEqual(buildReviewDueDates('2026-06-07', '2026-06-08'), []);
}

testResolveRubyTabScreen();
testParseNavigateResult();
testCalculatePlanProgress();
testBuildReviewDueDates();
console.log('ruby tools unit checks passed');
