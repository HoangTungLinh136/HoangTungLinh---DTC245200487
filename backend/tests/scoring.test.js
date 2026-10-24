const test = require('node:test');
const assert = require('node:assert');
const { calculateNormalizedScore } = require('../src/services/scoringService');

test('BD-08 Scoring: calculateNormalizedScore rounding to 2 decimal places', () => {
  // Test perfect score
  assert.strictEqual(calculateNormalizedScore(5, 5), 10.00);

  // Test zero score
  assert.strictEqual(calculateNormalizedScore(0, 5), 0.00);

  // Test 1 out of 3 questions: 10/3 = 3.3333... -> 3.33
  // Formula: floor((2000 * 100 + 300) / (2 * 300)) / 100
  // floor((200000 + 300) / 600) / 100 = floor(200300 / 600) / 100 = floor(333.833) / 100 = 3.33
  const score1of3 = calculateNormalizedScore(1, 3);
  assert.strictEqual(score1of3, 3.33);

  // Test 2 out of 3 questions: 20/3 = 6.6666... -> 6.67
  // Formula: floor((2000 * 200 + 300) / 600) / 100 = floor(400300 / 600) / 100 = floor(667.16) / 100 = 6.67
  const score2of3 = calculateNormalizedScore(2, 3);
  assert.strictEqual(score2of3, 6.67);

  // Test custom weights: raw 2.5 out of 4.0 -> (2.5 / 4.0) * 10 = 6.25
  const scoreCustom = calculateNormalizedScore(2.5, 4.0);
  assert.strictEqual(scoreCustom, 6.25);

  // Test edge case zero max score
  assert.strictEqual(calculateNormalizedScore(0, 0), 0.00);
});

test('BD-04 Multiple Choice: All-or-Nothing exact set matching', () => {
  // Correct choices: [10, 11, 12]
  const correctChoiceIds = [10, 11, 12].sort((a, b) => a - b);

  function evaluate(studentChoices) {
    const sorted = [...studentChoices].sort((a, b) => a - b);
    if (sorted.length !== correctChoiceIds.length) return false;
    return sorted.every((val, idx) => val === correctChoiceIds[idx]);
  }

  // Exact match -> TRUE
  assert.strictEqual(evaluate([10, 11, 12]), true);
  assert.strictEqual(evaluate([12, 10, 11]), true); // order independent

  // Subset (partial) -> FALSE (All-or-Nothing rule)
  assert.strictEqual(evaluate([10, 11]), false);

  // Superset (extra incorrect choice) -> FALSE
  assert.strictEqual(evaluate([10, 11, 12, 13]), false);

  // Disjoint -> FALSE
  assert.strictEqual(evaluate([14, 15]), false);

  // Empty -> FALSE
  assert.strictEqual(evaluate([]), false);
});
