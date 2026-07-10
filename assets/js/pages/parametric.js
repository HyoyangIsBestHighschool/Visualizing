// 매개변수와 곡선 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결하세요.
// 이 파일이 이 시뮬레이션의 담당 영역입니다.

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------------------------------
  // 0. 상수 & 색상 (style.css의 CSS 변수 값을 그대로 읽어와 재사용)
  // ------------------------------------------------------------
  const T_MAX = 2 * Math.PI;
  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const COLOR = {
    ink: cssVar('--ink') || '#eaf0fb',
    inkMuted: cssVar('--ink-muted') || '#8ca0c4',
    borderStrong: cssVar('--border') || '#23324f',
    math: cssVar('--accent-math') || '#5eead4',
    physics: cssVar('--accent-physics') || '#f2b84b',
  };

  // ------------------------------------------------------------
  // 1. 후보 함수 정의 (라벨, 계산식, 도함수, 정의역 체크)
  // ------------------------------------------------------------
  const FUNCTIONS = {
    linear: {
      label: 'f(t) = t',
      f: (t) => t,
      df: (t) => 1,
    },
    quadratic: {
      label: 'f(t) = t² − 2t',
      f: (t) => t * t - 2 * t,
      df: (t) => 2 * t - 2,
    },
    cos: {
      label: 'f(t) = cos(t)',
      f: (t) => Math.cos(t),
      df: (t) => -Math.sin(t),
    },
    sin2t: {
      label: 'f(t) = sin(2t)',
      f: (t) => Math.sin(2 * t),
      df: (t) => 2 * Math.cos(2 * t),
    },
    exp: {
      label: 'f(t) = e^(0.5t)',
      f: (t) => Math.exp(0.5 * t),
      df: (t) => 0.5 * Math.exp(0.5 * t),
    },
    ln: {
      label: 'f(t) = ln(t + 1)',
      f: (t) => (t > -1 ? Math.log(t + 1) : NaN),
      df: (t) => (t > -1 ? 1 / (t + 1) : NaN),
    },
  };
  const FN_KEYS = Object.keys(FUNCTIONS);

  // ------------------------------------------------------------
  // 2. DOM 참조
  // ------------------------------------------------------------
  const stage = document.getElementById('sim-stage');
  const canvas = document.getElementById('pc-canvas');
  const ctx = canvas.getContext('2d');

  const selX = document.getElementById('pc-fn-x');
  const selY = document.getElementById('pc-fn-y');
  const tSlider = document.getElementById('pc-t-slider');
  const tValueLabel = document.getElementById('pc-t-value');
  const readout = document.getElementById('pc-readout');
  const btnPlay = document.getElementById('pc-btn-play');
  const btnPause = document.getElementById('pc-btn-pause');
  const btnReset = document.getElementById('pc-btn-reset');

  if (!stage || !canvas || !selX || !selY || !tSlider) return;

  // 드롭다운 채우기 (기본값: x(t)=cos(t), y(t)=sin(2t) — 리사주 곡선 느낌으로 시작)
  FN_KEYS.forEach((key) => {
    const optX = document.createElement('option');
    optX.value = key;
    optX.textContent = FUNCTIONS[key].label;
    selX.appendChild(optX);

    const optY = document.createElement('option');
    optY.value = key;
    optY.textContent = FUNCTIONS[key].label;
    selY.appendChild(optY);
  });
  selX.value = 'cos';
  selY.value = 'sin2t';

  // ------------------------------------------------------------
  // 3. 상태
  // ------------------------------------------------------------
  let t = parseFloat(tSlider.value);
  let bounds = null;       // 현재 함수 조합에 대한 좌표 범위
  let scale = 1;            // 화면 px / 좌표 단위 (x, y 동일 배율 유지)
  let originPx = { x: 0, y: 0 };
  let playing = false;
  let lastFrameTime = null;
  const T_PER_SECOND = 1.1; // 재생 속도

  function currentFns() {
    return { fx: FUNCTIONS[selX.value], fy: FUNCTIONS[selY.value] };
  }

  // ------------------------------------------------------------
  // 4. 좌표 범위 계산 (함수 조합이 바뀔 때만 다시 계산)
  // ------------------------------------------------------------
  function recomputeBounds() {
    const { fx, fy } = currentFns();
    const N = 400;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i <= N; i++) {
      const ti = (i / N) * T_MAX;
      const x = fx.f(ti);
      const y = fy.f(ti);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) { minX = -1; maxX = 1; }
    if (!Number.isFinite(minY)) { minY = -1; maxY = 1; }
    // 원점을 항상 포함시켜 축이 보이도록 함
    minX = Math.min(minX, 0); maxX = Math.max(maxX, 0);
    minY = Math.min(minY, 0); maxY = Math.max(maxY, 0);
    // 여백
    const padX = (maxX - minX) * 0.18 || 1;
    const padY = (maxY - minY) * 0.18 || 1;
    bounds = {
      minX: minX - padX, maxX: maxX + padX,
      minY: minY - padY, maxY: maxY + padY,
    };
  }

  // ------------------------------------------------------------
  // 5. 캔버스 크기 & 좌표 변환
  // ------------------------------------------------------------
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateProjection(rect.width, rect.height);
    draw();
  }

  function updateProjection(w, h) {
    if (!bounds) recomputeBounds();
    const padPx = 28;
    const usableW = Math.max(10, w - padPx * 2);
    const usableH = Math.max(10, h - padPx * 2);
    const scaleX = usableW / (bounds.maxX - bounds.minX);
    const scaleY = usableH / (bounds.maxY - bounds.minY);
    scale = Math.min(scaleX, scaleY);
    const plotW = (bounds.maxX - bounds.minX) * scale;
    const plotH = (bounds.maxY - bounds.minY) * scale;
    const offsetX = (w - plotW) / 2;
    const offsetY = (h - plotH) / 2;
    originPx = {
      x: offsetX - bounds.minX * scale,
      y: h - offsetY + bounds.minY * scale,
    };
  }

  function toPx(x, y) {
    return {
      px: originPx.x + x * scale,
      py: originPx.y - y * scale,
    };
  }

  // ------------------------------------------------------------
  // 6. 그리기
  // ------------------------------------------------------------
  function draw() {
    const rect = stage.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const { fx, fy } = currentFns();

    // 6-1. 축
    ctx.strokeStyle = COLOR.borderStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const yAxisTop = toPx(0, bounds.maxY);
    const yAxisBot = toPx(0, bounds.minY);
    ctx.moveTo(yAxisTop.px, yAxisTop.py);
    ctx.lineTo(yAxisBot.px, yAxisBot.py);
    const xAxisL = toPx(bounds.minX, 0);
    const xAxisR = toPx(bounds.maxX, 0);
    ctx.moveTo(xAxisL.px, xAxisL.py);
    ctx.lineTo(xAxisR.px, xAxisR.py);
    ctx.stroke();

    // 6-2. x = y 보조선 (점선)
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COLOR.inkMuted;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    const lo = Math.max(bounds.minX, bounds.minY);
    const hi = Math.min(bounds.maxX, bounds.maxY);
    if (lo < hi) {
      const p1 = toPx(lo, lo);
      const p2 = toPx(hi, hi);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    }
    ctx.restore();

    // 6-3. 전체 궤적 (연한 선)
    ctx.beginPath();
    let started = false;
    const N = 500;
    for (let i = 0; i <= N; i++) {
      const ti = (i / N) * T_MAX;
      const x = fx.f(ti), y = fy.f(ti);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { started = false; continue; }
      const p = toPx(x, y);
      if (!started) { ctx.moveTo(p.px, p.py); started = true; }
      else ctx.lineTo(p.px, p.py);
    }
    ctx.strokeStyle = COLOR.math;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 6-4. 현재 점 P, 접선, 미분 화살표
    const x = fx.f(t), y = fy.f(t);
    const dxdt = fx.df(t), dydt = fy.df(t);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      const P = toPx(x, y);

      // 접선 (충분히 길게)
      if (Number.isFinite(dxdt) && Number.isFinite(dydt) && (Math.abs(dxdt) > 1e-9 || Math.abs(dydt) > 1e-9)) {
        const len = Math.hypot(w, h);
        const mag = Math.hypot(dxdt, dydt) || 1;
        const ux = dxdt / mag, uy = dydt / mag;
        const dxPx = ux * scale, dyPx = -uy * scale;
        const dirLen = Math.hypot(dxPx, dyPx) || 1;
        const ex = (dxPx / dirLen) * len, ey = (dyPx / dirLen) * len;
        ctx.beginPath();
        ctx.moveTo(P.px - ex, P.py - ey);
        ctx.lineTo(P.px + ex, P.py + ey);
        ctx.strokeStyle = COLOR.ink;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // dx/dt, dy/dt 화살표 (픽셀 길이는 시각적 명료성을 위해 스케일·상한 적용)
      const arrowPx = (v) => {
        if (!Number.isFinite(v)) return 0;
        const raw = v * 20;
        return Math.max(-70, Math.min(70, raw));
      };
      drawArrow(P.px, P.py, P.px + arrowPx(dxdt), P.py, COLOR.physics, 'dx/dt');
      drawArrow(P.px, P.py, P.px, P.py - arrowPx(dydt), COLOR.math, 'dy/dt');

      // 점 P
      ctx.beginPath();
      ctx.arc(P.px, P.py, 6, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.physics;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.ink;
      ctx.stroke();

      ctx.font = '12px ' + (cssVar('--font-mono') || 'monospace');
      ctx.fillStyle = COLOR.ink;
      ctx.fillText('P(t)', P.px + 10, P.py - 10);
    }

    updateReadout(x, y, dxdt, dydt);
  }

  function drawArrow(x0, y0, x1, y1, color, label) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const angle = Math.atan2(y1 - y0, x1 - x0);
    const headLen = 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.font = '10px ' + (cssVar('--font-mono') || 'monospace');
    ctx.fillText(label, x1 + 4, y1 + (y1 <= y0 ? -4 : 12));
  }

  // ------------------------------------------------------------
  // 7. 수치 읽기 패널
  // ------------------------------------------------------------
  function fmt(v, digits = 3) {
    if (!Number.isFinite(v)) return '정의되지 않음';
    return v.toFixed(digits);
  }

  function updateReadout(x, y, dxdt, dydt) {
    let slopeText;
    if (!Number.isFinite(dxdt) || !Number.isFinite(dydt)) {
      slopeText = '정의되지 않음 (정의역 밖)';
    } else if (Math.abs(dxdt) < 1e-6) {
      slopeText = Math.abs(dydt) < 1e-6 ? '정의되지 않음 (0/0)' : '∞ (수직접선)';
    } else {
      slopeText = fmt(dydt / dxdt);
    }

    readout.innerHTML =
      `t = ${fmt(t)}\n` +
      `<span class="pc-x">x(t) = ${fmt(x)}</span>   ` +
      `<span class="pc-y">y(t) = ${fmt(y)}</span>\n` +
      `dx/dt = ${fmt(dxdt)}\n` +
      `dy/dt = ${fmt(dydt)}\n` +
      `dy/dx = ${slopeText}`;
  }

  // ------------------------------------------------------------
  // 8. 이벤트 연결
  // ------------------------------------------------------------
  function onFnChange() {
    recomputeBounds();
    const rect = stage.getBoundingClientRect();
    updateProjection(rect.width, rect.height);
    draw();
  }
  selX.addEventListener('change', onFnChange);
  selY.addEventListener('change', onFnChange);

  tSlider.addEventListener('input', () => {
    t = parseFloat(tSlider.value);
    tValueLabel.textContent = `t = ${t.toFixed(3)}`;
    draw();
  });

  btnPlay.addEventListener('click', () => {
    if (playing) return;
    playing = true;
    lastFrameTime = null;
    requestAnimationFrame(step);
  });
  btnPause.addEventListener('click', () => { playing = false; });
  btnReset.addEventListener('click', () => {
    playing = false;
    t = 0;
    tSlider.value = '0';
    tValueLabel.textContent = 't = 0.000';
    draw();
  });

  function step(now) {
    if (!playing) return;
    if (lastFrameTime == null) lastFrameTime = now;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    t += dt * T_PER_SECOND;
    if (t > T_MAX) t -= T_MAX;
    tSlider.value = String(t);
    tValueLabel.textContent = `t = ${t.toFixed(3)}`;
    draw();
    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resizeCanvas);
  if (window.ResizeObserver) {
    new ResizeObserver(() => resizeCanvas()).observe(stage);
  }

  // ------------------------------------------------------------
  // 9. 초기화
  // ------------------------------------------------------------
  recomputeBounds();
  resizeCanvas();
});
