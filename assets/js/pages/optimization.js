// ============================================================
// 최적화 시뮬레이션 로직
// - #optModeSwitch : ① 울타리 직사각형 / ② 원기둥 캔 / ③ 상자 만들기 전환 탭
//
// 세 상황 모두 구조가 같습니다:
//   1) 고정 조건(둘레 L / 부피 V / 판지 한 변 a)을 슬라이더로 설정
//   2) 변수 x를 슬라이더로 움직이면
//   3) 도형이 다시 그려지고
//   4) 넓이(부피/표면적) 함수 f(x) 그래프와 도함수 f′(x) 그래프에
//      현재 x 위치(세로선)와 극값 위치(점선)가 함께 표시됩니다.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initModeSwitch();
  initFenceScenario();
  initCylinderScenario();
  initBoxScenario();
});

// ------------------------------------------------------------
// 공통 유틸
// ------------------------------------------------------------
const rootStyle = getComputedStyle(document.documentElement);
function cssVar(name, fallback) {
  const v = rootStyle.getPropertyValue(name).trim();
  return v || fallback;
}
const COLORS = {
  math: cssVar('--accent-math', '#5eead4'),
  mathDim: cssVar('--accent-math-dim', '#2c7d72'),
  ink: cssVar('--ink', '#eaf0fb'),
  inkMuted: cssVar('--ink-muted', '#8ca0c4'),
  border: cssVar('--border', '#23324f'),
  panelRaised: cssVar('--panel-raised', '#16223c'),
  bgGrid: cssVar('--bg-grid', '#16213a'),
  fontMono: cssVar('--font-mono', 'monospace').split(',')[0].replace(/['"]/g, '').trim(),
};

function fitCanvas(canvas, cssHeightOverride) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || canvas.parentElement.clientWidth || 640;
  const h = cssHeightOverride || cssWidth * 0.34;
  canvas.style.height = h + 'px';
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: cssWidth, h };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 함수 그래프(간단한 좌표평면 + 곡선 + 현재 x 위치 + 극값 위치)를 그리는 공용 함수.
// f: x -> y 함수, xMin/xMax: x 표시 범위, extremumX: 극값이 나타나는 x (점선 표시용, null이면 생략)
function drawFunctionGraph(ctx, size, f, xMin, xMax, currentX, extremumX, options) {
  const { w, h } = size;
  ctx.clearRect(0, 0, w, h);

  const padL = 8, padR = 8, padT = 10, padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // y값 범위 계산 (샘플링)
  const SAMPLES = 60;
  let yMin = Infinity, yMax = -Infinity;
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = xMin + ((xMax - xMin) * i) / SAMPLES;
    const y = f(x);
    pts.push([x, y]);
    if (Number.isFinite(y)) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }
  if (options && options.zeroBaseline) yMin = Math.min(yMin, 0);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad; yMax += yPad;

  function toPx(x) { return padL + ((x - xMin) / (xMax - xMin)) * plotW; }
  function toPy(y) { return padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH; }

  // 배경 그리드
  ctx.strokeStyle = COLORS.bgGrid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gx = padL + (plotW / 4) * i;
    ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH); ctx.stroke();
  }

  // 0 기준선 (y=0이 범위 안에 있으면)
  if (yMin < 0 && yMax > 0) {
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(padL, toPy(0));
    ctx.lineTo(padL + plotW, toPy(0));
    ctx.stroke();
  }

  // x축
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // 극값 위치 점선
  if (extremumX != null && extremumX >= xMin && extremumX <= xMax) {
    ctx.save();
    ctx.strokeStyle = COLORS.inkMuted;
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    const ex = toPx(extremumX);
    ctx.beginPath();
    ctx.moveTo(ex, padT);
    ctx.lineTo(ex, padT + plotH);
    ctx.stroke();
    ctx.restore();
  }

  // 함수 곡선
  ctx.strokeStyle = COLORS.math;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = toPx(x), py = toPy(Number.isFinite(y) ? y : 0);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // 현재 x 위치 (세로선 + 점)
  if (currentX != null) {
    const cx = toPx(currentX);
    const cy = toPy(f(currentX));
    ctx.save();
    ctx.strokeStyle = COLORS.math;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, padT);
    ctx.lineTo(cx, padT + plotH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COLORS.math;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------
// 상황 전환 탭
// ------------------------------------------------------------
function initModeSwitch() {
  const switchEl = document.getElementById('optModeSwitch');
  if (!switchEl) return;

  const stages = {
    fence: document.getElementById('optStageFence'),
    cylinder: document.getElementById('optStageCylinder'),
    box: document.getElementById('optStageBox'),
  };
  const controls = {
    fence: document.getElementById('optControlsFence'),
    cylinder: document.getElementById('optControlsCylinder'),
    box: document.getElementById('optControlsBox'),
  };
  const buttons = Array.from(switchEl.querySelectorAll('[data-mode]'));

  function setMode(mode) {
    Object.keys(stages).forEach((key) => {
      const active = key === mode;
      stages[key].style.display = active ? '' : 'none';
      controls[key].style.display = active ? '' : 'none';
    });
    buttons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    // 탭을 전환하면 방금 보이게 된 캔버스를 다시 그려야 크기가 올바르게 맞춰집니다.
    window.dispatchEvent(new Event('resize'));
    if (window.__optRedraw && window.__optRedraw[mode]) window.__optRedraw[mode]();
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  window.__optRedraw = window.__optRedraw || {};
  setMode('fence');
}

// ------------------------------------------------------------
// ① 울타리 직사각형
//    A(x) = x(L/2 - x),  A'(x) = L/2 - 2x,  최댓값: x = L/4
// ------------------------------------------------------------
function initFenceScenario() {
  const shapeCanvas = document.getElementById('optFenceShapeCanvas');
  if (!shapeCanvas) return;
  const graphFCanvas = document.getElementById('optFenceGraphF');
  const graphFpCanvas = document.getElementById('optFenceGraphFPrime');

  const shapeCtx = shapeCanvas.getContext('2d');
  const graphFCtx = graphFCanvas.getContext('2d');
  const graphFpCtx = graphFpCanvas.getContext('2d');

  const LInput = document.getElementById('optFenceL');
  const LValueEl = document.getElementById('optFenceLValue');
  const xInput = document.getElementById('optFenceX');
  const xValueEl = document.getElementById('optFenceXValue');
  const maxBtn = document.getElementById('optFenceMaxBtn');
  const resetBtn = document.getElementById('optFenceResetBtn');

  const xReadout = document.getElementById('optFenceXReadout');
  const areaReadout = document.getElementById('optFenceAreaReadout');
  const derivReadout = document.getElementById('optFenceDerivReadout');

  const state = { L: parseFloat(LInput.value), x: parseFloat(xInput.value) };

  const area = (x) => x * (state.L / 2 - x);
  const deriv = (x) => state.L / 2 - 2 * x;

  function clampX() {
    const half = state.L / 2;
    xInput.min = (half * 0.02).toFixed(2);
    xInput.max = (half * 0.98).toFixed(2);
    if (state.x < half * 0.02) state.x = half * 0.02;
    if (state.x > half * 0.98) state.x = half * 0.98;
  }

  let shapeSize, graphFSize, graphFpSize;

  function resizeAll() {
    shapeSize = fitCanvas(shapeCanvas, shapeCanvas.parentElement.clientWidth * 0.34);
    graphFSize = fitCanvas(graphFCanvas, 130);
    graphFpSize = fitCanvas(graphFpCanvas, 130);
    draw();
  }

  function drawShape() {
    const { w, h } = shapeSize;
    const ctx = shapeCtx;
    ctx.clearRect(0, 0, w, h);

    const half = state.L / 2;
    const rectW = state.x;
    const rectH = half - state.x;
    const maxDim = half;
    const scale = Math.min((w - 60) / maxDim, (h - 40) / maxDim);

    const drawW = rectW * scale;
    const drawH = rectH * scale;
    const originX = (w - drawW) / 2;
    const originY = (h - drawH) / 2;

    ctx.save();
    ctx.fillStyle = COLORS.math;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(originX, originY, drawW, drawH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.math;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(originX, originY, drawW, drawH);
    ctx.restore();

    ctx.fillStyle = COLORS.inkMuted;
    ctx.font = `500 12px ${COLORS.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`x = ${state.x.toFixed(1)}`, originX + drawW / 2, originY + drawH + 18);
    ctx.save();
    ctx.translate(originX - 14, originY + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${rectH.toFixed(1)}`, 0, 0);
    ctx.restore();
  }

  function draw() {
    clampX();
    xInput.value = state.x;
    LValueEl.textContent = state.L;
    xValueEl.textContent = state.x.toFixed(1);

    const a = area(state.x);
    const d = deriv(state.x);
    xReadout.textContent = state.x.toFixed(2);
    areaReadout.textContent = a.toFixed(2);
    derivReadout.textContent = d.toFixed(2);

    drawShape();
    const half = state.L / 2;
    drawFunctionGraph(graphFCtx, graphFSize, area, 0, half, state.x, half / 2, { zeroBaseline: true });
    drawFunctionGraph(graphFpCtx, graphFpSize, deriv, 0, half, state.x, half / 2, {});
  }

  window.__optRedraw = window.__optRedraw || {};
  window.__optRedraw.fence = draw;

  if (window.ResizeObserver) {
    new ResizeObserver(() => resizeAll()).observe(shapeCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAll);
  }

  LInput.addEventListener('input', () => {
    state.L = parseFloat(LInput.value);
    draw();
  });
  xInput.addEventListener('input', () => {
    state.x = parseFloat(xInput.value);
    draw();
  });
  maxBtn.addEventListener('click', () => {
    state.x = state.L / 4;
    draw();
  });
  resetBtn.addEventListener('click', () => {
    state.L = parseFloat(LInput.defaultValue);
    state.x = parseFloat(xInput.defaultValue);
    LInput.value = state.L;
    draw();
  });

  resizeAll();
}

// ------------------------------------------------------------
// ② 원기둥 캔
//    h = V / (π r^2),  S(r) = 2π r^2 + 2V/r,  S'(r) = 4π r - 2V/r^2
//    최소값: r = (V / (2π))^(1/3)
// ------------------------------------------------------------
function initCylinderScenario() {
  const shapeCanvas = document.getElementById('optCylinderShapeCanvas');
  if (!shapeCanvas) return;
  const graphFCanvas = document.getElementById('optCylinderGraphF');
  const graphFpCanvas = document.getElementById('optCylinderGraphFPrime');

  const shapeCtx = shapeCanvas.getContext('2d');
  const graphFCtx = graphFCanvas.getContext('2d');
  const graphFpCtx = graphFpCanvas.getContext('2d');

  const VInput = document.getElementById('optCylinderV');
  const VValueEl = document.getElementById('optCylinderVValue');
  const rInput = document.getElementById('optCylinderR');
  const rValueEl = document.getElementById('optCylinderRValue');
  const minBtn = document.getElementById('optCylinderMinBtn');
  const resetBtn = document.getElementById('optCylinderResetBtn');

  const rReadout = document.getElementById('optCylinderRReadout');
  const sReadout = document.getElementById('optCylinderSReadout');
  const derivReadout = document.getElementById('optCylinderDerivReadout');

  const state = { V: parseFloat(VInput.value), r: parseFloat(rInput.value) };

  const heightOf = (r) => state.V / (Math.PI * r * r);
  const surface = (r) => 2 * Math.PI * r * r + (2 * state.V) / r;
  const deriv = (r) => 4 * Math.PI * r - (2 * state.V) / (r * r);
  const optimalR = () => Math.cbrt(state.V / (2 * Math.PI));

  let shapeSize, graphFSize, graphFpSize;

  function resizeAll() {
    shapeSize = fitCanvas(shapeCanvas, shapeCanvas.parentElement.clientWidth * 0.34);
    graphFSize = fitCanvas(graphFCanvas, 130);
    graphFpSize = fitCanvas(graphFpCanvas, 130);
    draw();
  }

  function drawShape() {
    const { w, h } = shapeSize;
    const ctx = shapeCtx;
    ctx.clearRect(0, 0, w, h);

    const r = state.r;
    const height = Math.min(heightOf(r), 40); // 화면 밖으로 너무 길어지지 않게 표시용으로만 제한
    const scale = Math.min((w - 80) / (2 * 10), (h - 50) / 40); // 대략적인 스케일(반지름 최대 10, 높이 상한 40 기준)

    const drawR = r * scale;
    const drawH = Math.min(heightOf(r), 40) * scale;
    const cx = w / 2;
    const baseY = h - 24;
    const topY = baseY - drawH;
    const ellipseRY = Math.max(6, drawR * 0.28);

    ctx.save();
    // 몸통
    ctx.fillStyle = COLORS.math;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(cx - drawR, topY, drawR * 2, drawH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.math;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - drawR, topY);
    ctx.lineTo(cx - drawR, baseY);
    ctx.moveTo(cx + drawR, topY);
    ctx.lineTo(cx + drawR, baseY);
    ctx.stroke();

    // 밑면 타원
    ctx.beginPath();
    ctx.ellipse(cx, baseY, drawR, ellipseRY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 윗면 타원
    ctx.beginPath();
    ctx.ellipse(cx, topY, drawR, ellipseRY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, topY, drawR, ellipseRY, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.fillStyle = COLORS.inkMuted;
    ctx.font = `500 12px ${COLORS.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`r = ${r.toFixed(1)}`, cx, baseY + 20);
    if (heightOf(r) > 40) {
      ctx.fillText('(높이는 화면 표시용으로 축소됨)', cx, baseY + 36);
    }
  }

  function draw() {
    rValueEl.textContent = state.r.toFixed(1);
    VValueEl.textContent = state.V;

    const s = surface(state.r);
    const d = deriv(state.r);
    rReadout.textContent = state.r.toFixed(2);
    sReadout.textContent = s.toFixed(2);
    derivReadout.textContent = d.toFixed(2);

    drawShape();
    const rMax = parseFloat(rInput.max);
    const optR = optimalR();
    drawFunctionGraph(graphFCtx, graphFSize, surface, 0.3, rMax, state.r, optR, {});
    drawFunctionGraph(graphFpCtx, graphFpSize, deriv, 0.3, rMax, state.r, optR, {});
  }

  window.__optRedraw = window.__optRedraw || {};
  window.__optRedraw.cylinder = draw;

  if (window.ResizeObserver) {
    new ResizeObserver(() => resizeAll()).observe(shapeCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAll);
  }

  VInput.addEventListener('input', () => {
    state.V = parseFloat(VInput.value);
    draw();
  });
  rInput.addEventListener('input', () => {
    state.r = parseFloat(rInput.value);
    draw();
  });
  minBtn.addEventListener('click', () => {
    const rMax = parseFloat(rInput.max);
    const rMin = parseFloat(rInput.min);
    state.r = Math.max(rMin, Math.min(rMax, optimalR()));
    rInput.value = state.r;
    draw();
  });
  resetBtn.addEventListener('click', () => {
    state.V = parseFloat(VInput.defaultValue);
    state.r = parseFloat(rInput.defaultValue);
    VInput.value = state.V;
    rInput.value = state.r;
    draw();
  });

  resizeAll();
}

// ------------------------------------------------------------
// ③ 상자 만들기
//    V(x) = x(a - 2x)^2,  V'(x) = 12x^2 - 8ax + a^2
//    최댓값: x = a/6
// ------------------------------------------------------------
function initBoxScenario() {
  const shapeCanvas = document.getElementById('optBoxShapeCanvas');
  if (!shapeCanvas) return;
  const graphFCanvas = document.getElementById('optBoxGraphF');
  const graphFpCanvas = document.getElementById('optBoxGraphFPrime');

  const shapeCtx = shapeCanvas.getContext('2d');
  const graphFCtx = graphFCanvas.getContext('2d');
  const graphFpCtx = graphFpCanvas.getContext('2d');

  const aInput = document.getElementById('optBoxA');
  const aValueEl = document.getElementById('optBoxAValue');
  const xInput = document.getElementById('optBoxX');
  const xValueEl = document.getElementById('optBoxXValue');
  const maxBtn = document.getElementById('optBoxMaxBtn');
  const resetBtn = document.getElementById('optBoxResetBtn');

  const xReadout = document.getElementById('optBoxXReadout');
  const vReadout = document.getElementById('optBoxVReadout');
  const derivReadout = document.getElementById('optBoxDerivReadout');

  const state = { a: parseFloat(aInput.value), x: parseFloat(xInput.value) };

  const volume = (x) => x * Math.pow(state.a - 2 * x, 2);
  const deriv = (x) => 12 * x * x - 8 * state.a * x + state.a * state.a;

  function clampX() {
    const half = state.a / 2;
    xInput.min = (half * 0.02).toFixed(2);
    xInput.max = (half * 0.98).toFixed(2);
    if (state.x < half * 0.02) state.x = half * 0.02;
    if (state.x > half * 0.98) state.x = half * 0.98;
  }

  let shapeSize, graphFSize, graphFpSize;

  function resizeAll() {
    shapeSize = fitCanvas(shapeCanvas, shapeCanvas.parentElement.clientWidth * 0.34);
    graphFSize = fitCanvas(graphFCanvas, 130);
    graphFpSize = fitCanvas(graphFpCanvas, 130);
    draw();
  }

  function drawShape() {
    const { w, h } = shapeSize;
    const ctx = shapeCtx;
    ctx.clearRect(0, 0, w, h);

    const a = state.a;
    const x = state.x;
    const scale = Math.min((w - 60) / a, (h - 40) / a);
    const drawA = a * scale;
    const drawX = x * scale;

    const originX = (w - drawA) / 2;
    const originY = (h - drawA) / 2;

    ctx.save();
    // 판지 전체 (얇은 테두리)
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(originX, originY, drawA, drawA);
    ctx.setLineDash([]);

    // 잘라낼 네 모서리 정사각형(어둡게 표시)
    ctx.fillStyle = COLORS.bgGrid;
    ctx.fillRect(originX, originY, drawX, drawX);
    ctx.fillRect(originX + drawA - drawX, originY, drawX, drawX);
    ctx.fillRect(originX, originY + drawA - drawX, drawX, drawX);
    ctx.fillRect(originX + drawA - drawX, originY + drawA - drawX, drawX, drawX);

    // 접었을 때 바닥이 되는 안쪽 사각형(강조)
    ctx.fillStyle = COLORS.math;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(originX + drawX, originY + drawX, drawA - 2 * drawX, drawA - 2 * drawX);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.math;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(originX + drawX, originY + drawX, drawA - 2 * drawX, drawA - 2 * drawX);

    // 접는 선(점선)
    ctx.strokeStyle = COLORS.inkMuted;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX + drawX, originY);
    ctx.lineTo(originX + drawX, originY + drawA);
    ctx.moveTo(originX + drawA - drawX, originY);
    ctx.lineTo(originX + drawA - drawX, originY + drawA);
    ctx.moveTo(originX, originY + drawX);
    ctx.lineTo(originX + drawA, originY + drawX);
    ctx.moveTo(originX, originY + drawA - drawX);
    ctx.lineTo(originX + drawA, originY + drawA - drawX);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = COLORS.inkMuted;
    ctx.font = `500 12px ${COLORS.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`x = ${x.toFixed(1)}`, originX + drawX / 2, originY - 8);
  }

  function draw() {
    clampX();
    xInput.value = state.x;
    aValueEl.textContent = state.a;
    xValueEl.textContent = state.x.toFixed(1);

    const v = volume(state.x);
    const d = deriv(state.x);
    xReadout.textContent = state.x.toFixed(2);
    vReadout.textContent = v.toFixed(2);
    derivReadout.textContent = d.toFixed(2);

    drawShape();
    const half = state.a / 2;
    drawFunctionGraph(graphFCtx, graphFSize, volume, 0, half, state.x, state.a / 6, { zeroBaseline: true });
    drawFunctionGraph(graphFpCtx, graphFpSize, deriv, 0, half, state.x, state.a / 6, {});
  }

  window.__optRedraw = window.__optRedraw || {};
  window.__optRedraw.box = draw;

  if (window.ResizeObserver) {
    new ResizeObserver(() => resizeAll()).observe(shapeCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAll);
  }

  aInput.addEventListener('input', () => {
    state.a = parseFloat(aInput.value);
    draw();
  });
  xInput.addEventListener('input', () => {
    state.x = parseFloat(xInput.value);
    draw();
  });
  maxBtn.addEventListener('click', () => {
    state.x = state.a / 6;
    draw();
  });
  resetBtn.addEventListener('click', () => {
    state.a = parseFloat(aInput.defaultValue);
    state.x = parseFloat(xInput.defaultValue);
    aInput.value = state.a;
    draw();
  });

  resizeAll();
}
