const { MathEngine } = require('./popup.js');

function runTests() {
  const tests = [
    // 1. Basic Arithmetic
    { expr: '1250 + 150', expected: '1,400' },
    { expr: '5000 ÷ 4', expected: '1,250' },
    { expr: '2 + 3 × 4', expected: '14' },
    { expr: '10 - 4 - 2', expected: '4' },
    { expr: '0.1 + 0.2', expected: '0.3' },
    { expr: '1250 + 15%', expected: '1,437.5' },

    // 2. Parentheses & Precedence
    { expr: '(2 + 3) × (4 + 5)', expected: '45' },
    { expr: '2(3 + 4)', expected: '14' },
    { expr: '(100 - 20) ÷ 4', expected: '20' },

    // 3. Scientific & Trigonometry
    { expr: 'sin(30)', angle: 'DEG', expected: '0.5' },
    { expr: 'cos(60)', angle: 'DEG', expected: '0.5' },
    { expr: 'tan(45)', angle: 'DEG', expected: '1' },
    { expr: 'sin(π/2)', angle: 'RAD', expected: '1' },
    { expr: 'log(100)', expected: '2' },
    { expr: 'ln(e)', expected: '1' },
    { expr: 'sqrt(16)', expected: '4' },
    { expr: '2^3', expected: '8' },
    { expr: '5!', expected: '120' },
    { expr: '1/(4)', expected: '0.25' },

    // 4. Error Handling
    { expr: '5 ÷ 0', expected: 'Cannot divide by zero' },
    { expr: 'sqrt(-4)', expected: 'Domain Error' },
    { expr: 'asin(2)', expected: 'Domain Error' },
    { expr: '((2 + 3)', expected: 'Unmatched Parentheses' },
    { expr: '2 ++ 3', expected: 'Invalid Expression' }
  ];

  let passed = 0;
  let failed = 0;

  console.log('=== RUNNING MATH ENGINE VERIFICATION TESTS ===\n');

  tests.forEach(({ expr, angle = 'DEG', expected }, idx) => {
    const actual = MathEngine.evaluate(expr, angle);
    const isPass = String(actual) === expected;

    if (isPass) {
      passed++;
      console.log(`[PASS] Test #${idx + 1}: "${expr}" [${angle}] => ${actual}`);
    } else {
      failed++;
      console.error(`[FAIL] Test #${idx + 1}: "${expr}" [${angle}] | Expected: "${expected}" | Got: "${actual}"`);
    }
  });

  console.log(`\nResults: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
