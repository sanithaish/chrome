/**
 * Advanced Chrome Extension Calculator
 * Safe Expression Evaluator & Extension Logic
 */

// Global State
const state = {
  expression: '',
  result: '0',
  lastEvaluatedExpr: '',
  isCalculated: false,
  memory: 0,
  angleMode: 'DEG', // 'DEG' or 'RAD'
  calculatorMode: 'basic', // 'basic' or 'scientific'
  theme: 'system', // 'light', 'dark', 'system'
  history: [],
  historyFilter: 'all',
  historySearch: ''
};

// ==========================================
// 1. SAFE MATH PARSER & ENGINE (No eval)
// ==========================================

class MathEngine {
  /**
   * Main evaluation function
   * @param {string} expr 
   * @param {string} angleMode 'DEG' or 'RAD'
   * @returns {number|string} evaluated number or error string
   */
  static evaluate(expr, angleMode = 'DEG') {
    if (!expr || expr.trim() === '') return 0;

    try {
      // 1. Preprocess expression (replacing symbols and percentage logic)
      let normalized = MathEngine.normalizeExpression(expr);
      
      // 2. Tokenize string
      const tokens = MathEngine.tokenize(normalized);
      if (tokens.length === 0) return 0;

      // 3. Validate operator sequence (e.g., prevent "2 ++ 3")
      MathEngine.validateTokens(tokens);

      // 4. Insert implicit multiplication (e.g. 2(3) -> 2*(3), 3π -> 3*π, 5sin(30) -> 5*sin(30))
      const expandedTokens = MathEngine.insertImplicitMultiplication(tokens);

      // 5. Convert infix tokens to Postfix (Shunting-yard algorithm)
      const postfix = MathEngine.toPostfix(expandedTokens);

      // 6. Evaluate Postfix stack
      const result = MathEngine.evaluatePostfix(postfix, angleMode);

      if (typeof result === 'number') {
        if (!isFinite(result)) {
          if (isNaN(result)) return 'Invalid Expression';
          return 'Overflow';
        }
        return MathEngine.formatNumber(result);
      }
      return result;
    } catch (err) {
      return err.message || 'Invalid Expression';
    }
  }

  static normalizeExpression(expr) {
    let clean = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/√\(/g, 'sqrt(')
      .replace(/√([0-9.πe]+)/g, 'sqrt($1)')
      .replace(/\^2/g, '^2');

    // Preprocess Percentage logic for calculator behaviors:
    // Pattern 1: A + B% => A + (A * (B / 100))
    // Pattern 2: A - B% => A - (A * (B / 100))
    clean = clean.replace(/([0-9.]+)\s*([+-])\s*([0-9.]+)%/g, '$1 $2 ($1 * ($3 / 100))');

    // Pattern 3: Standalone number%: N% => (N / 100)
    clean = clean.replace(/([0-9.]+)%/g, '($1 / 100)');

    return clean;
  }

  static tokenize(expr) {
    const tokens = [];
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      // Whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Numbers (including decimals)
      if (/[0-9.]/.test(char)) {
        let numStr = '';
        let hasDecimal = false;
        while (i < expr.length && /[0-9.]/.test(expr[i])) {
          if (expr[i] === '.') {
            if (hasDecimal) throw new Error('Invalid Expression');
            hasDecimal = true;
          }
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Identifiers / Scientific functions & constants
      if (/[a-zA-Zπe]/.test(char)) {
        let idStr = '';
        while (i < expr.length && /[a-zA-Zπe]/.test(expr[i])) {
          idStr += expr[i];
          i++;
        }

        if (idStr === 'π') {
          tokens.push({ type: 'NUMBER', value: Math.PI });
        } else if (idStr === 'e') {
          tokens.push({ type: 'NUMBER', value: Math.E });
        } else if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'cbrt', 'exp', 'pow10', 'sinh', 'cosh', 'tanh'].includes(idStr)) {
          tokens.push({ type: 'FUNCTION', value: idStr });
        } else {

          throw new Error('Invalid Expression');
        }
        continue;
      }

      // Parentheses
      if (char === '(' || char === ')') {
        tokens.push({ type: 'PAREN', value: char });
        i++;
        continue;
      }

      // Operators
      if (['+', '-', '*', '/', '%', '^', '!'].includes(char)) {
        // Handle unary minus / plus
        if ((char === '-' || char === '+') && (tokens.length === 0 || tokens[tokens.length - 1].type === 'OPERATOR' || tokens[tokens.length - 1].value === '(')) {
          if (char === '-') {
            tokens.push({ type: 'UNARY_MINUS', value: 'u-' });
          } else if (char === '+') {
            tokens.push({ type: 'UNARY_PLUS', value: 'u+' });
          }
        } else {
          tokens.push({ type: 'OPERATOR', value: char });
        }
        i++;
        continue;
      }

      throw new Error('Invalid Expression');
    }

    return tokens;
  }

  static validateTokens(tokens) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const curr = tokens[i];
      const next = tokens[i + 1];

      // Two consecutive operators (e.g. 2 ++ 3 or 5 * / 2) are invalid
      if (curr.type === 'OPERATOR' && (next.type === 'OPERATOR' || next.type === 'UNARY_PLUS') && curr.value !== '!') {
        throw new Error('Invalid Expression');
      }
    }
  }

  static insertImplicitMultiplication(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; i++) {
      const curr = tokens[i];
      const next = tokens[i + 1];

      result.push(curr);

      if (!next) continue;

      const isCurrOperand = curr.type === 'NUMBER' || curr.value === ')' || curr.value === '!';
      const isNextOperand = next.type === 'NUMBER' || next.type === 'FUNCTION' || next.value === '(';

      if (isCurrOperand && isNextOperand) {
        result.push({ type: 'OPERATOR', value: '*' });
      }
    }
    return result;
  }

  static getPrecedence(op) {
    switch (op) {
      case 'u-': case 'u+': return 5;
      case '!': return 5;
      case '^': return 4;
      case '*': case '/': case '%': return 3;
      case '+': case '-': return 2;
      default: return 0;
    }
  }

  static isRightAssociative(op) {
    return op === '^' || op === 'u-' || op === 'u+';
  }

  static toPostfix(tokens) {
    const output = [];
    const stack = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'NUMBER') {
        output.push(token);
      } else if (token.type === 'FUNCTION') {
        stack.push(token);
      } else if (token.value === '(') {
        stack.push(token);
      } else if (token.value === ')') {
        let foundOpen = false;
        while (stack.length > 0) {
          const top = stack.pop();
          if (top.value === '(') {
            foundOpen = true;
            break;
          }
          output.push(top);
        }
        if (!foundOpen) throw new Error('Unmatched Parentheses');

        if (stack.length > 0 && stack[stack.length - 1].type === 'FUNCTION') {
          output.push(stack.pop());
        }
      } else if (token.type === 'OPERATOR' || token.type === 'UNARY_MINUS' || token.type === 'UNARY_PLUS') {
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.value === '(') break;

          const p1 = MathEngine.getPrecedence(token.value);
          const p2 = MathEngine.getPrecedence(top.value);

          if (p2 > p1 || (p2 === p1 && !MathEngine.isRightAssociative(token.value))) {
            output.push(stack.pop());
          } else {
            break;
          }
        }
        stack.push(token);
      }
    }

    while (stack.length > 0) {
      const top = stack.pop();
      if (top.value === '(' || top.value === ')') {
        throw new Error('Unmatched Parentheses');
      }
      output.push(top);
    }

    return output;
  }

  static evaluatePostfix(postfix, angleMode) {
    const stack = [];

    for (let token of postfix) {
      if (token.type === 'NUMBER') {
        stack.push(token.value);
      } else if (token.type === 'UNARY_MINUS') {
        if (stack.length < 1) throw new Error('Invalid Expression');
        const val = stack.pop();
        stack.push(-val);
      } else if (token.type === 'UNARY_PLUS') {
        if (stack.length < 1) throw new Error('Invalid Expression');
        const val = stack.pop();
        stack.push(+val);
      } else if (token.type === 'OPERATOR') {
        if (token.value === '!') {
          if (stack.length < 1) throw new Error('Invalid Expression');
          const n = stack.pop();
          if (n < 0 || !Number.isInteger(n)) throw new Error('Domain Error');
          stack.push(MathEngine.factorial(n));
          continue;
        }

        if (stack.length < 2) throw new Error('Invalid Expression');
        const b = stack.pop();
        const a = stack.pop();

        switch (token.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Cannot divide by zero');
            stack.push(a / b);
            break;
          case '%':
            stack.push(a * (b / 100));
            break;
          case '^': stack.push(Math.pow(a, b)); break;
          default: throw new Error('Invalid Expression');
        }
      } else if (token.type === 'FUNCTION') {
        if (stack.length < 1) throw new Error('Invalid Expression');
        const x = stack.pop();

        const rad = angleMode === 'DEG' ? (x * Math.PI) / 180 : x;

        switch (token.value) {
          case 'sin': stack.push(Math.sin(rad)); break;
          case 'cos': stack.push(Math.cos(rad)); break;
          case 'tan':
            if (angleMode === 'DEG' && Math.abs(x % 180) === 90) throw new Error('Domain Error');
            stack.push(Math.tan(rad));
            break;
          case 'asin':
            if (x < -1 || x > 1) throw new Error('Domain Error');
            const resAsin = Math.asin(x);
            stack.push(angleMode === 'DEG' ? (resAsin * 180) / Math.PI : resAsin);
            break;
          case 'acos':
            if (x < -1 || x > 1) throw new Error('Domain Error');
            const resAcos = Math.acos(x);
            stack.push(angleMode === 'DEG' ? (resAcos * 180) / Math.PI : resAcos);
            break;
          case 'atan':
            const resAtan = Math.atan(x);
            stack.push(angleMode === 'DEG' ? (resAtan * 180) / Math.PI : resAtan);
            break;
          case 'log':
            if (x <= 0) throw new Error('Domain Error');
            stack.push(Math.log10(x));
            break;
          case 'ln':
            if (x <= 0) throw new Error('Domain Error');
            stack.push(Math.log(x));
            break;
          case 'sqrt':
            if (x < 0) throw new Error('Domain Error');
            stack.push(Math.sqrt(x));
            break;
          case 'cbrt':
            stack.push(Math.cbrt(x));
            break;
          case 'exp':
            stack.push(Math.exp(x));
            break;
          case 'pow10':
            stack.push(Math.pow(10, x));
            break;
          case 'sinh':
            stack.push(Math.sinh(x));
            break;
          case 'cosh':
            stack.push(Math.cosh(x));
            break;
          case 'tanh':
            stack.push(Math.tanh(x));
            break;
          default: throw new Error('Invalid Expression');

        }
      }
    }

    if (stack.length !== 1) throw new Error('Invalid Expression');
    return stack[0];
  }

  static factorial(n) {
    if (n > 170) return Infinity; // Overflow boundary
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  static formatNumber(num) {
    if (isNaN(num)) return 'Invalid Expression';
    if (!isFinite(num)) return 'Overflow';

    // Eliminate small JS floating point precision issues (e.g. 0.1 + 0.2 = 0.30000000000000004)
    const fixedPrecision = parseFloat(num.toFixed(10));
    
    // Format large numbers or scientific notation if needed
    if (Math.abs(fixedPrecision) >= 1e14 || (Math.abs(fixedPrecision) < 1e-7 && fixedPrecision !== 0)) {
      return fixedPrecision.toExponential(6).replace('e+', 'e');
    }

    return fixedPrecision.toLocaleString('en-US', { maximumFractionDigits: 10 });
  }
}


// Export for Node testing environment if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MathEngine };
}

// ==========================================
// 2. EXTENSION DOM & INTERACTION ENGINE
// ==========================================

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {

  // DOM Element Handles
  const body = document.body;
  const exprDisplay = document.getElementById('expression-display');
  const resDisplay = document.getElementById('result-display');
  const copyResultBtn = document.getElementById('copy-result-btn');
  const copyExprBtn = document.getElementById('copy-expr-btn');
  const copyResultFooterBtn = document.getElementById('copy-result-footer-btn');
  const toast = document.getElementById('toast');

  const themeToggleBtn = document.getElementById('theme-toggle');
  const historyToggleBtn = document.getElementById('history-toggle');
  const closeHistoryBtn = document.getElementById('close-history-btn');
  const historyDrawer = document.getElementById('history-drawer');
  const historyBadge = document.getElementById('history-badge');
  const historyList = document.getElementById('history-list');
  const historySearchInput = document.getElementById('history-search-input');
  const filterTabs = document.querySelectorAll('.filter-tab');

  const modeBasicBtn = document.getElementById('mode-basic-btn');
  const modeSciBtn = document.getElementById('mode-sci-btn');
  const scientificGrid = document.getElementById('scientific-grid');
  const angleModeBtn = document.getElementById('angle-mode-btn');
  const memoryIndicator = document.getElementById('memory-indicator');

  const copyAllHistoryBtn = document.getElementById('copy-all-history-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file-input');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  const confirmModal = document.getElementById('confirm-modal');
  const cancelClearBtn = document.getElementById('cancel-clear-btn');
  const confirmClearBtn = document.getElementById('confirm-clear-btn');

  // Load Persisted Storage
  loadStorage();

  // Attach Event Listeners
  attachKeypadListeners();
  attachHeaderListeners();
  attachHistoryListeners();
  attachKeyboardSupport();

  // Storage Persistence Helper
  function loadStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['theme', 'calculatorMode', 'memory', 'history', 'angleMode'], (res) => {
        if (res.theme) state.theme = res.theme;
        if (res.calculatorMode) state.calculatorMode = res.calculatorMode;
        if (typeof res.memory === 'number') state.memory = res.memory;
        if (Array.isArray(res.history)) state.history = res.history;
        if (res.angleMode) state.angleMode = res.angleMode;

        applyTheme(state.theme);
        applyCalculatorMode(state.calculatorMode);
        updateMemoryDisplay();
        updateAngleDisplay();
        renderHistory();
      });
    } else {
      // LocalStorage fallback for non-extension browser testing
      state.theme = localStorage.getItem('calc_theme') || 'system';
      state.calculatorMode = localStorage.getItem('calc_mode') || 'basic';
      state.memory = parseFloat(localStorage.getItem('calc_memory')) || 0;
      state.history = JSON.parse(localStorage.getItem('calc_history') || '[]');
      state.angleMode = localStorage.getItem('calc_angle') || 'DEG';

      applyTheme(state.theme);
      applyCalculatorMode(state.calculatorMode);
      updateMemoryDisplay();
      updateAngleDisplay();
      renderHistory();
    }
  }

  function saveStorage(keys) {
    const dataToSave = {};
    if (!keys || keys.includes('theme')) dataToSave.theme = state.theme;
    if (!keys || keys.includes('calculatorMode')) dataToSave.calculatorMode = state.calculatorMode;
    if (!keys || keys.includes('memory')) dataToSave.memory = state.memory;
    if (!keys || keys.includes('history')) dataToSave.history = state.history;
    if (!keys || keys.includes('angleMode')) dataToSave.angleMode = state.angleMode;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(dataToSave);
    } else {
      if (dataToSave.theme) localStorage.setItem('calc_theme', dataToSave.theme);
      if (dataToSave.calculatorMode) localStorage.setItem('calc_mode', dataToSave.calculatorMode);
      if (typeof dataToSave.memory === 'number') localStorage.setItem('calc_memory', dataToSave.memory);
      if (dataToSave.history) localStorage.setItem('calc_history', JSON.stringify(dataToSave.history));
      if (dataToSave.angleMode) localStorage.setItem('calc_angle', dataToSave.angleMode);
    }
  }

  // UI Theme & Mode Switchers
  function applyTheme(theme) {
    state.theme = theme;
    body.setAttribute('data-theme', theme);
    saveStorage(['theme']);
  }

  function applyCalculatorMode(mode) {
    state.calculatorMode = mode;
    body.setAttribute('data-mode', mode);
    if (mode === 'scientific') {
      scientificGrid.removeAttribute('hidden');
      angleModeBtn.removeAttribute('hidden');
      modeSciBtn.classList.add('active');
      modeSciBtn.setAttribute('aria-selected', 'true');
      modeBasicBtn.classList.remove('active');
      modeBasicBtn.setAttribute('aria-selected', 'false');
    } else {
      scientificGrid.setAttribute('hidden', 'true');
      angleModeBtn.setAttribute('hidden', 'true');
      modeBasicBtn.classList.add('active');
      modeBasicBtn.setAttribute('aria-selected', 'true');
      modeSciBtn.classList.remove('active');
      modeSciBtn.setAttribute('aria-selected', 'false');
    }
    saveStorage(['calculatorMode']);
  }

  function updateMemoryDisplay() {
    if (state.memory !== 0) {
      memoryIndicator.removeAttribute('hidden');
    } else {
      memoryIndicator.setAttribute('hidden', 'true');
    }
  }

  function updateAngleDisplay() {
    angleModeBtn.textContent = state.angleMode;
    const sciAngleBtn = document.getElementById('sci-angle-btn');
    if (sciAngleBtn) {
      sciAngleBtn.textContent = state.angleMode === 'DEG' ? 'Deg' : 'Rad';
    }
  }


  // Calculator Input Logic
  function handleInput(type, value) {
    if (state.isCalculated && type === 'digit') {
      // Start fresh expression on digit after calculation
      state.expression = '';
      state.isCalculated = false;
    } else if (state.isCalculated && (type === 'operator' || type === 'reciprocal' || type === 'factorial')) {
      state.isCalculated = false;
    }

    switch (type) {
      case 'digit':
        state.expression += value;
        break;
      case 'decimal':
        if (!state.expression || /[+\-×÷(%^]$/.test(state.expression)) {
          state.expression += '0.';
        } else {
          state.expression += '.';
        }
        break;
      case 'operator':
        if (value === '^2') {
          state.expression += '^2';
        } else if (value === '^3') {
          state.expression += '^3';
        } else {
          state.expression += value;
        }
        break;
      case 'func':
        state.expression += value + '(';
        break;
      case 'rand':
        state.expression += String(parseFloat(Math.random().toFixed(4)));
        break;
      case '2nd':
        state.is2nd = !state.is2nd;
        const btn2nd = document.getElementById('btn-2nd');
        const btnSin = document.getElementById('btn-sin');
        const btnCos = document.getElementById('btn-cos');
        const btnTan = document.getElementById('btn-tan');
        if (state.is2nd) {
          if (btn2nd) btn2nd.classList.add('active');
          if (btnSin) { btnSin.setAttribute('data-value', 'asin'); btnSin.textContent = 'sin⁻¹'; }
          if (btnCos) { btnCos.setAttribute('data-value', 'acos'); btnCos.textContent = 'cos⁻¹'; }
          if (btnTan) { btnTan.setAttribute('data-value', 'atan'); btnTan.textContent = 'tan⁻¹'; }
        } else {
          if (btn2nd) btn2nd.classList.remove('active');
          if (btnSin) { btnSin.setAttribute('data-value', 'sin'); btnSin.textContent = 'sin'; }
          if (btnCos) { btnCos.setAttribute('data-value', 'cos'); btnCos.textContent = 'cos'; }
          if (btnTan) { btnTan.setAttribute('data-value', 'tan'); btnTan.textContent = 'tan'; }
        }
        return;
      case 'toggle-angle':
        state.angleMode = state.angleMode === 'DEG' ? 'RAD' : 'DEG';
        updateAngleDisplay();
        saveStorage(['angleMode']);
        showToast(`Angle Mode: ${state.angleMode}`);
        return;

      case 'constant':
        state.expression += value;
        break;
      case 'paren':
        state.expression += value;
        break;
      case 'reciprocal':
        state.expression = `1/(${state.expression || state.result})`;
        break;
      case 'factorial':
        state.expression += '!';
        break;
      case 'negate':
        if (!state.expression && state.result !== '0') {
          state.expression = `-(${state.result})`;
        } else if (state.expression.startsWith('-(') && state.expression.endsWith(')')) {
          state.expression = state.expression.slice(2, -1);
        } else {
          state.expression = `-(${state.expression})`;
        }
        break;
      case 'backspace':
        if (state.expression.length > 0) {
          state.expression = state.expression.slice(0, -1);
        }
        break;
      case 'clear':
        state.expression = '';
        state.result = '0';
        state.isCalculated = false;
        break;
      case 'equals':
        evaluateAndSave();
        return;
    }

    updateDisplay();
  }

  function evaluateAndSave() {
    if (!state.expression.trim()) return;

    const rawResult = MathEngine.evaluate(state.expression, state.angleMode);
    state.result = String(rawResult);
    state.lastEvaluatedExpr = state.expression;
    state.isCalculated = true;

    // Check if result is a valid calculated number before adding to history
    if (!['Invalid Expression', 'Cannot divide by zero', 'Domain Error', 'Unmatched Parentheses', 'Overflow'].includes(state.result)) {
      addHistoryItem(state.expression, state.result);
    }

    updateDisplay();
  }

  function updateDisplay() {
    exprDisplay.textContent = state.expression;
    resDisplay.textContent = state.result;

    // Scroll to rightmost position for display
    exprDisplay.scrollLeft = exprDisplay.scrollWidth;
    resDisplay.scrollLeft = resDisplay.scrollWidth;
  }

  // Memory Operations
  function handleMemory(action) {
    const currentNum = parseFloat(state.result.replace(/,/g, '')) || 0;

    switch (action) {
      case 'mc':
        state.memory = 0;
        showToast('Memory Cleared');
        break;
      case 'mr':
        state.expression += String(state.memory);
        state.isCalculated = false;
        updateDisplay();
        showToast(`Memory Recalled (${state.memory})`);
        break;
      case 'm-plus':
        state.memory += currentNum;
        showToast(`Added to Memory (${state.memory})`);
        break;
      case 'm-minus':
        state.memory -= currentNum;
        showToast(`Subtracted from Memory (${state.memory})`);
        break;
    }

    updateMemoryDisplay();
    saveStorage(['memory']);
  }

  // Attach Keypad Button Listeners
  function attachKeypadListeners() {
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const value = btn.getAttribute('data-value');

        if (['mc', 'mr', 'm-plus', 'm-minus'].includes(action)) {
          handleMemory(action);
        } else {
          handleInput(action, value);
        }
      });
    });
  }

  // Header & Controls Listeners
  function attachHeaderListeners() {
    themeToggleBtn.addEventListener('click', () => {
      const themes = ['system', 'light', 'dark'];
      const nextTheme = themes[(themes.indexOf(state.theme) + 1) % themes.length];
      applyTheme(nextTheme);
      showToast(`Theme: ${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)}`);
    });

    modeBasicBtn.addEventListener('click', () => applyCalculatorMode('basic'));
    modeSciBtn.addEventListener('click', () => applyCalculatorMode('scientific'));

    angleModeBtn.addEventListener('click', () => {
      state.angleMode = state.angleMode === 'DEG' ? 'RAD' : 'DEG';
      updateAngleDisplay();
      saveStorage(['angleMode']);
      showToast(`Angle Mode: ${state.angleMode}`);
    });

    historyToggleBtn.addEventListener('click', () => {
      historyDrawer.removeAttribute('hidden');
      historyDrawer.setAttribute('aria-hidden', 'false');
    });

    closeHistoryBtn.addEventListener('click', () => {
      historyDrawer.setAttribute('hidden', 'true');
      historyDrawer.setAttribute('aria-hidden', 'true');
    });

    copyResultBtn.addEventListener('click', () => copyToClipboard(state.result));
    if (copyResultFooterBtn) {
      copyResultFooterBtn.addEventListener('click', () => copyToClipboard(state.result));
    }
    if (copyExprBtn) {
      copyExprBtn.addEventListener('click', () => {
        const fullText = state.lastEvaluatedExpr ? `${state.lastEvaluatedExpr} = ${state.result}` : state.result;
        copyToClipboard(fullText);
      });
    }

  }

  // History Management & UI
  function addHistoryItem(expression, result) {
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      expression: expression,
      result: result,
      timestamp: Date.now(),
      pinned: false
    };

    // Prepend new item
    state.history.unshift(newItem);

    // Limit history to 300 entries max
    if (state.history.length > 300) {
      state.history = state.history.slice(0, 300);
    }

    saveStorage(['history']);
    renderHistory();
  }

  function renderHistory() {
    // Update Badge
    if (state.history.length > 0) {
      historyBadge.textContent = state.history.length;
      historyBadge.removeAttribute('hidden');
    } else {
      historyBadge.setAttribute('hidden', 'true');
    }

    let filtered = [...state.history];

    // Apply Search Filter
    if (state.historySearch.trim() !== '') {
      const q = state.historySearch.toLowerCase();
      filtered = filtered.filter(item => 
        item.expression.toLowerCase().includes(q) || item.result.toLowerCase().includes(q)
      );
    }

    // Apply Date / Pinned Filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - (now.getDay() * 86400000);

    if (state.historyFilter === 'today') {
      filtered = filtered.filter(item => item.timestamp >= startOfToday);
    } else if (state.historyFilter === 'yesterday') {
      filtered = filtered.filter(item => item.timestamp >= startOfYesterday && item.timestamp < startOfToday);
    } else if (state.historyFilter === 'week') {
      filtered = filtered.filter(item => item.timestamp >= startOfWeek);
    } else if (state.historyFilter === 'pinned') {
      filtered = filtered.filter(item => item.pinned);
    }

    historyList.innerHTML = '';

    if (filtered.length === 0) {
      historyList.innerHTML = `<div class="history-empty">No calculation history found</div>`;
      return;
    }

    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = `history-item ${item.pinned ? 'pinned' : ''}`;

      const dateStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      div.innerHTML = `
        <div class="history-item-top">
          <span class="history-item-expr">${escapeHTML(item.expression)}</span>
          <span class="history-item-time">${dateStr}</span>
        </div>
        <div class="history-item-res">= ${escapeHTML(item.result)}</div>
        <div class="history-item-bottom">
          <span>${new Date(item.timestamp).toLocaleDateString()}</span>
          <div class="history-item-actions">
            <button class="history-action-btn pin-btn" title="${item.pinned ? 'Unpin' : 'Pin'}">${item.pinned ? '⭐' : '☆'}</button>
            <button class="history-action-btn copy-item-btn" title="Copy">📋</button>
            <button class="history-action-btn delete-item-btn" title="Delete">🗑</button>
          </div>
        </div>
      `;

      // Load item into calculator when main card is clicked
      div.addEventListener('click', (e) => {
        if (e.target.closest('.history-action-btn')) return; // Ignore button clicks
        state.expression = item.expression;
        state.result = item.result;
        state.isCalculated = true;
        updateDisplay();
        historyDrawer.setAttribute('hidden', 'true');
        showToast('Loaded calculation');
      });

      // Pin button
      div.querySelector('.pin-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        item.pinned = !item.pinned;
        saveStorage(['history']);
        renderHistory();
      });

      // Copy item button
      div.querySelector('.copy-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(`${item.expression} = ${item.result}`);
      });

      // Delete item button
      div.querySelector('.delete-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.history = state.history.filter(h => h.id !== item.id);
        saveStorage(['history']);
        renderHistory();
      });

      historyList.appendChild(div);
    });
  }

  function attachHistoryListeners() {
    historySearchInput.addEventListener('input', (e) => {
      state.historySearch = e.target.value;
      renderHistory();
    });

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.historyFilter = tab.getAttribute('data-filter');
        renderHistory();
      });
    });

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        confirmModal.removeAttribute('hidden');
      });
    }

    if (cancelClearBtn) {
      cancelClearBtn.addEventListener('click', () => {
        confirmModal.setAttribute('hidden', 'true');
      });
    }

    if (confirmClearBtn) {
      confirmClearBtn.addEventListener('click', () => {
        state.history = [];
        saveStorage(['history']);
        renderHistory();
        confirmModal.setAttribute('hidden', 'true');
        showToast('History cleared');
      });
    }
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        confirmModal.setAttribute('hidden', 'true');
      }
    });
  }


  // Keyboard Navigation & Event Listener
  function attachKeyboardSupport() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement === historySearchInput) return; // Allow typing in search box

      if (e.key >= '0' && e.key <= '9') {
        handleInput('digit', e.key);
      } else if (e.key === '.') {
        handleInput('decimal', '.');
      } else if (e.key === '+') {
        handleInput('operator', '+');
      } else if (e.key === '-') {
        handleInput('operator', '−');
      } else if (e.key === '*') {
        handleInput('operator', '×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleInput('operator', '÷');
      } else if (e.key === '%') {
        handleInput('operator', '%');
      } else if (e.key === '(' || e.key === ')') {
        handleInput('paren', e.key);
      } else if (e.key === '^') {
        handleInput('operator', '^');
      } else if (e.key === '!') {
        handleInput('factorial', '!');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleInput('equals', '=');
      } else if (e.key === 'Backspace') {
        handleInput('backspace', '');
      } else if (e.key === 'Escape') {
        if (!confirmModal.hasAttribute('hidden')) {
          confirmModal.setAttribute('hidden', 'true');
        } else if (!historyDrawer.hasAttribute('hidden')) {
          historyDrawer.setAttribute('hidden', 'true');
        } else {
          handleInput('clear', '');
        }
      }
 else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        // Ctrl+C / Cmd+C copy result
        copyToClipboard(state.result);
      }
    });
  }

  // Utilities
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }

  function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied!');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied!');
    });
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
}
