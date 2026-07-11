// 접선을 이용한 어림수 계산 (테일러 근사 1~3차) 시뮬레이션 로직
// #sim-stage 안의 canvas에 그래프를 그리고, #sim-controls 안의 입력/버튼에 이벤트를 연결합니다.

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------------
   * 1. 안전한 함수 파서
   *    사용자가 입력한 문자열(예: "sin(x)", "x^2+1")을
   *    화이트리스트 검증 후 JS 함수로 컴파일합니다.
   * --------------------------------------------------------- */
  const FUNC_MAP = {
    asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
    sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
    sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
    log10: 'Math.log10', log: 'Math.log', ln: 'Math.log',
    exp: 'Math.exp', sqrt: 'Math.sqrt', abs: 'Math.abs', pow: 'Math.pow'
  };
  const CONST_MAP = { pi: 'Math.PI', e: 'Math.E' };

  function compileFunction(exprStr) {
    if (!exprStr || !exprStr.trim()) throw new Error('함수식을 입력해 주세요.');
    let expr = exprStr.trim();

    // 거듭제곱 표기 변환
    expr = expr.replace(/\^/g, '**');

    // 함수 이름 치환 (긴 이름부터 처리해 부분 일치 방지)
    Object.keys(FUNC_MAP)
      .sort((a, b) => b.length - a.length)
      .forEach((name) => {
        const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
        expr = expr.replace(re, FUNC_MAP[name] + '(');
      });

    // 상수 치환
    Object.keys(CONST_MAP).forEach((name) => {
      const re = new RegExp('\\b' + name + '\\b', 'g');
      expr = expr.replace(re, CONST_MAP[name]);
    });

    // 남은 문자열은 숫자, x, Math., 알파벳(Math 메서드용), 연산자, 괄호, 공백만 허용
    const safePattern = /^[0-9a-zA-Z_+\-*/%.,() \s]*$/;
    if (!safePattern.test(expr)) {
      throw new Error('허용되지 않은 문자가 포함되어 있습니다.');
    }
    // 위험한 키워드 재확인
    if (/[;{}\[\]]/.test(expr) || /\b(window|document|eval|function|=>|import)\b/.test(expr)) {
      throw new Error('허용되지 않은 표현식입니다.');
    }

    let fn;
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function('x', `"use strict"; return (${expr});`);
      const t = fn(1.234);
      if (typeof t !== 'number') throw new Error('함수 계산 결과가 숫자가 아닙니다.');
    } catch (e) {
      throw new Error('함수식을 해석할 수 없습니다: ' + e.message);
    }
    return fn;
  }

  /* ---------------------------------------------------------
   * 2. 수치미분 (중심차분)
   * --------------------------------------------------------- */
  function d1(f, x, h = 1e-4) {
    return (f(x + h) - f(x - h)) / (2 * h);
  }
  function d2(f, x, h = 1e-3) {
    return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
  }
  function d3(f, x, h = 1e-2) {
    return (f(x + 2 * h) - 2 * f(x + h) + 2 * f(x - h) - f(x - 2 * h)) / (2 * h * h * h);
  }

  /* ---------------------------------------------------------
   * 3. 상태 & DOM 참조
   * --------------------------------------------------------- */
  const fnInput = document.getElementById('fnInput');
  const aInput = document.getElementById('aInput');
  const xInput = document.getElementById('xInput');
  const xSlider = document.getElementById('xSlider');
  const xValueLabel = document.getElementById('xValueLabel');
  const orderToggle = document.getElementById('orderToggle');
  const btnDraw = document.getElementById('btnDraw');
  const btnReset = document.getElementById('btnReset');
  const errorBoxWrap = document.getElementById('errorBoxWrap');
  const errorBox = document.getElementById('errorBox');
  const resultContent = document.getElementById('resultContent');
  const canvas = document.getElementById('newtonCanvas');
  const ctx = canvas.getContext('2d');

  const DEFAULTS = { fn: 'sin(x)', a: 0, x: 0.5, order: 3 };
  let state = { order: DEFAULTS.order };

  function showError(msg) {
    if (!msg) {
      errorBoxWrap.style.display = 'none';
      errorBox.textContent = '';
      return;
    }
    errorBoxWrap.style.display = 'block';
    errorBox.textContent = msg;
  }

  /* ---------------------------------------------------------
   * 4. 캔버스 해상도 대응 (레티나 대비)
   * --------------------------------------------------------- */
  function resizeCanvas() {
    const cssWidth = canvas.parentElement.clientWidth;
    const cssHeight = Math.round(cssWidth * 0.75); // 4:3 비율
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssWidth, h: cssHeight };
  }

  /* ---------------------------------------------------------
   * 5. 메인 계산 + 렌더링
   * --------------------------------------------------------- */
  function compute() {
    const fnStr = fnInput.value;
    const a = parseFloat(aInput.value);
    const x = parseFloat(xInput.value);

    if (Number.isNaN(a) || Number.isNaN(x)) {
      showError('전개점 a와 목표값 x는 숫자여야 합니다.');
      return;
    }

    let f;
    try {
      f = compileFunction(fnStr);
    } catch (e) {
      showError(e.message);
      return;
    }

    let fa, fpa, fppa, fpppa, fx;
    try {
      fa = f(a);
      fpa = d1(f, a);
      fppa = d2(f, a);
      fpppa = d3(f, a);
      fx = f(x);
      [fa, fpa, fppa, fpppa, fx].forEach((v) => {
        if (!Number.isFinite(v)) throw new Error('정의역을 벗어났거나 계산할 수 없는 값입니다 (예: 음수의 제곱근/로그).');
      });
    } catch (e) {
      showError('a 또는 x 근처에서 함수를 계산할 수 없습니다: ' + e.message);
      return;
    }

    showError(null);

    const dx = x - a;
    const L1 = fa + fpa * dx;
    const L2 = L1 + (fppa / 2) * dx * dx;
    const L3 = L2 + (fpppa / 6) * dx * dx * dx;
    const approx = { 1: L1, 2: L2, 3: L3 };

    renderResults({ fa, fx, L1, L2, L3, a, x });
    renderCanvas({ f, a, x, order: state.order, approxAtX: approx });
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(6);
  }

  function renderResults({ fa, fx, L1, L2, L3, a, x }) {
    const items = [
      { label: `실제값 f(${trimNum(x)})`, value: fmt(fx), key: 'actual' },
      { label: '1차 근사 L(x)', value: fmt(L1), key: 1 },
      { label: '2차 근사 Q(x)', value: fmt(L2), key: 2 },
      { label: '3차 근사 C(x)', value: fmt(L3), key: 3 },
      { label: `선택 차수(${state.order}차) 오차`, value: fmt(Math.abs(fx - { 1: L1, 2: L2, 3: L3 }[state.order])), key: 'error' }
    ];

    resultContent.innerHTML = items.map((it) => {
      const highlight = it.key === state.order || it.key === 'error' ? 'highlight' : '';
      return `<div class="result-item ${highlight}">
        <p class="r-label">${it.label}</p>
        <p class="r-value">${it.value}</p>
      </div>`;
    }).join('');
  }

  function trimNum(v) {
    return Number.isFinite(v) ? (Math.round(v * 1000) / 1000).toString() : v;
  }

  /* ---------------------------------------------------------
   * 6. 캔버스에 그래프 + 근사 곡선 그리기
   * --------------------------------------------------------- */
  function renderCanvas({ f, a, x, order, approxAtX }) {
    const { w, h } = resizeCanvas();
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(document.documentElement);
    const colAccent = styles.getPropertyValue('--accent-math').trim() || '#5eead4';
    const colInk = styles.getPropertyValue('--ink').trim() || '#eaf0fb';
    const colMuted = styles.getPropertyValue('--ink-muted').trim() || '#8ca0c4';
    const colBorder = styles.getPropertyValue('--border').trim() || '#23324f';

    // 표시 구간 결정 (a, x를 포함하도록 여유를 두고)
    const center = (a + x) / 2;
    const spread = Math.max(Math.abs(x - a), 1) * 2.2;
    const xMin = center - spread;
    const xMax = center + spread;

    const N = 400;
    const samplesF = [];
    const samplesApprox = [];
    for (let i = 0; i <= N; i++) {
      const xi = xMin + ((xMax - xMin) * i) / N;
      const yiF = safeEval(f, xi);
      samplesF.push([xi, yiF]);
      const dxp = xi - a;
      let yiA;
      if (order === 1) yiA = safeVal(approxLinear(a, dxp));
      else if (order === 2) yiA = safeVal(approxQuad(a, dxp));
      else yiA = safeVal(approxCubic(a, dxp));
      samplesApprox.push([xi, yiA]);
    }

    function approxLinear(a0, dxp) {
      return getBaseCoeffs()[0] + getBaseCoeffs()[1] * dxp;
    }
    function approxQuad(a0, dxp) {
      const c = getBaseCoeffs();
      return c[0] + c[1] * dxp + (c[2] / 2) * dxp * dxp;
    }
    function approxCubic(a0, dxp) {
      const c = getBaseCoeffs();
      return c[0] + c[1] * dxp + (c[2] / 2) * dxp * dxp + (c[3] / 6) * dxp * dxp * dxp;
    }
    let _cached = null;
    function getBaseCoeffs() {
      if (_cached) return _cached;
      _cached = [f(a), d1(f, a), d2(f, a), d3(f, a)];
      return _cached;
    }

    function safeEval(fn, xi) {
      try {
        const v = fn(xi);
        return Number.isFinite(v) ? v : null;
      } catch (e) {
        return null;
      }
    }
    function safeVal(v) {
      return Number.isFinite(v) ? v : null;
    }

    // y 범위 계산 (두 곡선 모두 고려, 이상치 제거)
    let yVals = samplesF.concat(samplesApprox).map((p) => p[1]).filter((v) => v !== null);
    if (yVals.length === 0) yVals = [-1, 1];
    let yMin = Math.min(...yVals);
    let yMax = Math.max(...yVals);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.15;
    yMin -= yPad; yMax += yPad;

    const padding = 36;
    const plotW = w - padding * 2;
    const plotH = h - padding * 2;

    const toPx = (xi) => padding + ((xi - xMin) / (xMax - xMin)) * plotW;
    const toPy = (yi) => padding + plotH - ((yi - yMin) / (yMax - yMin)) * plotH;

    // 배경 축
    ctx.lineWidth = 1;
    ctx.strokeStyle = colBorder;
    ctx.beginPath();
    ctx.rect(padding, padding, plotW, plotH);
    ctx.stroke();

    // x=0, y=0 축 (범위 안에 있을 때만)
    ctx.strokeStyle = colMuted;
    ctx.globalAlpha = 0.5;
    if (xMin < 0 && xMax > 0) {
      ctx.beginPath();
      ctx.moveTo(toPx(0), padding);
      ctx.lineTo(toPx(0), padding + plotH);
      ctx.stroke();
    }
    if (yMin < 0 && yMax > 0) {
      ctx.beginPath();
      ctx.moveTo(padding, toPy(0));
      ctx.lineTo(padding + plotW, toPy(0));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 실제 함수 곡선
    drawCurve(samplesF, colAccent, 2.5, false);

    // 근사 곡선 (점선)
    drawCurve(samplesApprox, colInk, 2, true);

    function drawCurve(samples, color, width, dashed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dashed ? [6, 5] : []);
      ctx.beginPath();
      let started = false;
      samples.forEach(([xi, yi]) => {
        if (yi === null || !Number.isFinite(yi) || Math.abs(toPy(yi)) > 1e5) {
          started = false;
          return;
        }
        const px = toPx(xi);
        const py = toPy(yi);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 전개점 a 표시
    const faVal = safeEval(f, a);
    if (faVal !== null) {
      drawPoint(toPx(a), toPy(faVal), colAccent, 'a');
    }

    // 목표값 x 표시 + 근사값으로의 점선
    const fxVal = safeEval(f, x);
    const approxVal = approxAtX[order];
    if (fxVal !== null) {
      drawPoint(toPx(x), toPy(fxVal), colMuted, 'x');
    }
    if (Number.isFinite(approxVal)) {
      const px = toPx(x);
      const py = toPy(approxVal);
      ctx.fillStyle = colInk;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      // 세로 보조선
      ctx.strokeStyle = colMuted;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, padding + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    function drawPoint(px, py, color, label) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px monospace';
      ctx.fillStyle = colMuted;
      ctx.fillText(label, px + 7, py - 7);
    }
  }

  /* ---------------------------------------------------------
   * 7. 이벤트 연결
   * --------------------------------------------------------- */
  function syncXFromSlider() {
    xInput.value = xSlider.value;
    xValueLabel.textContent = parseFloat(xSlider.value).toFixed(2);
    compute();
  }
  function syncXFromInput() {
    const v = parseFloat(xInput.value);
    if (!Number.isNaN(v)) {
      const clamped = Math.min(Math.max(v, parseFloat(xSlider.min)), parseFloat(xSlider.max));
      xSlider.value = clamped;
      xValueLabel.textContent = v.toFixed(2);
    }
    compute();
  }

  xSlider.addEventListener('input', syncXFromSlider);
  xInput.addEventListener('change', syncXFromInput);
  aInput.addEventListener('change', compute);
  fnInput.addEventListener('change', compute);

  btnDraw.addEventListener('click', compute);
  btnReset.addEventListener('click', () => {
    fnInput.value = DEFAULTS.fn;
    aInput.value = DEFAULTS.a;
    xInput.value = DEFAULTS.x;
    xSlider.value = DEFAULTS.x;
    xValueLabel.textContent = DEFAULTS.x.toFixed(2);
    state.order = DEFAULTS.order;
    [...orderToggle.querySelectorAll('.order-btn')].forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.order) === state.order);
    });
    compute();
  });

  orderToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.order-btn');
    if (!btn) return;
    state.order = Number(btn.dataset.order);
    [...orderToggle.querySelectorAll('.order-btn')].forEach((b) => b.classList.toggle('active', b === btn));
    compute();
  });

  window.addEventListener('resize', () => compute());

  // 초기 렌더
  xValueLabel.textContent = parseFloat(xInput.value).toFixed(2);
  compute();
});
