const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

test('ARC-01 & DAT-01 Concurrency & Durability Acceptance Suite (13 Scenarios)', (t) => {
  const scriptPath = path.resolve(__dirname, 'test_arc01_dat01_runtime.js');
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }

  assert.strictEqual(
    result.status,
    0,
    `test_arc01_dat01_runtime.js failed with exit code ${result.status}`
  );

  assert.ok(
    /TEST SUITE SUMMARY: \d+ PASSED, 0 FAILED/.test(result.stdout),
    'Expected all tests in acceptance suite to pass with 0 failures'
  );
});
