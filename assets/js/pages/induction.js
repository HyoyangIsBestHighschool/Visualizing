// ============================================================
// 전자기 유도 시뮬레이션 로직
// - #indModeSwitch : ① 회전하는 코일 / ② 움직이는 자석 상황 전환 탭
//
// [① 회전하는 코일] (구현됨)
//   - #indStageRotate : 자석 + 회전 코일 + 전류계(캔버스) + 전류-시간 그래프
//   - #indControlsRotate : 회전 속도 / 자석 세기 슬라이더, 재생/초기화 버튼
//   물리 모델(단순화):
//     자속  Φ(θ) = B·A·cos(θ)
//     기전력 ε   = -dΦ/dt = B·A·ω·sin(θ)
//     전류  I   ∝ (자석 세기) × (각속도 ω) × sin(θ)
//   → 코일이 회전하지 않으면(ω = 0) 자기장 속에 있어도 전류는 0.
//
// [② 움직이는 자석] (구현됨)
//   - #indStageMovingMagnet : 고정된 원형 코일(솔레노이드) 내부를 자석이 통과하는 장면
//   - #indControlsMovingMagnet : 자석 이동 속도 / 자석 세기 / 코일 감은 횟수 컨트롤
//   물리 모델(단순화, 쌍극자 자기장 근사):
//     자기장   B(x) = 세기 / (1 + (x/k)²)^1.5   (x: 자석-코일 중심 거리, k: 감쇠 폭)
//     자속     Φ(x) = N·B(x)
//     기전력   ε = -dΦ/dt = -N·(dB/dx)·v         (v: 자석의 순간 속도, 부호 있음)
//   → 자석이 멈춰 있으면(v = 0) 코일 바로 옆에 있어도 전류는 0.
//   → 코일에 가까워질 때와 멀어질 때 dB/dx의 부호가 반대라 전류 방향도 반대가 됨.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initModeSwitch();
  initRotateScenario();
  initMovingMagnetScenario();
});

// ------------------------------------------------------------
// 상황 전환 탭 (① ↔ ②)
// ------------------------------------------------------------
function initModeSwitch() {
  const switchEl = document.getElementById('indModeSwitch');
  if (!switchEl) return;

  const stageRotate = document.getElementById('indStageRotate');
  const stageMoving = document.getElementById('indStageMovingMagnet');
  const controlsRotate = document.getElementById('indControlsRotate');
  const controlsMoving = document.getElementById('indControlsMovingMagnet');
  const buttons = Array.from(switchEl.querySelectorAll('[data-mode]'));

  function setMode(mode) {
    const isRotate = mode === 'rotate';
    stageRotate.style.display = isRotate ? '' : 'none';
    stageMoving.style.display = isRotate ? 'none' : '';
    controlsRotate.style.display = isRotate ? '' : 'none';
    controlsMoving.style.display = isRotate ? 'none' : '';

    buttons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    window.__indCurrentMode = mode; // 회전 시나리오 루프가 자신이 보이는지 확인할 때 참조
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  setMode('rotate');
}

// ------------------------------------------------------------
// ① 회전하는 코일 (구현됨)
// ------------------------------------------------------------
function initRotateScenario() {
  const sceneCanvas = document.getElementById('indRotateSceneCanvas');
  const graphCanvas = document.getElementById('indRotateGraphCanvas');
  if (!sceneCanvas || !graphCanvas) return; // 이 페이지가 아니면 종료

  const sceneCtx = sceneCanvas.getContext('2d');
  const graphCtx = graphCanvas.getContext('2d');

  const speedInput = document.getElementById('indRotateSpeed');
  const speedValueEl = document.getElementById('indRotateSpeedValue');
  const strengthInput = document.getElementById('indRotateStrength');
  const strengthValueEl = document.getElementById('indRotateStrengthValue');
  const playBtn = document.getElementById('indRotatePlayBtn');
  const resetBtn = document.getElementById('indRotateResetBtn');

  const angleReadout = document.getElementById('indRotateAngleReadout');
  const currentReadout = document.getElementById('indRotateCurrentReadout');
  const dirReadout = document.getElementById('indRotateDirReadout');

  // ---------- 상태 ----------
  const state = {
    theta: 0,
    speedDeg: parseFloat(speedInput.value),
    strength: parseFloat(strengthInput.value),
    playing: true,
    dragging: false,
    dragAngularVelocity: 0,
    lastPointerX: 0,
    lastPointerT: 0,
    current: 0,
    elapsed: 0,
  };

  const CURRENT_SCALE = 0.5;
  const GRAPH_WINDOW = 8;
  const GRAPH_MAX_CURRENT = 4;
  const history = [];

  const rootStyle = getComputedStyle(document.documentElement);
  const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
  const colors = {
    physics: cssVar('--accent-physics') || '#f2b84b',
    physicsDim: cssVar('--accent-physics-dim') || '#8a6a2c',
    ink: cssVar('--ink') || '#eaf0fb',
    inkMuted: cssVar('--ink-muted') || '#8ca0c4',
    border: cssVar('--border') || '#23324f',
    panelRaised: cssVar('--panel-raised') || '#16223c',
    bgGrid: cssVar('--bg-grid') || '#16213a',
    fontMono: (cssVar('--font-mono') || 'monospace').split(',')[0].replace(/['"]/g, '').trim(),
  };

  function fitCanvas(canvas, cssHeight) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = rect.width || canvas.parentElement.clientWidth || 640;
    const h = cssHeight || cssWidth * (canvas === sceneCanvas ? 0.5 : 0.19);
    canvas.style.height = h + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssWidth, h };
  }

  let sceneSize = { w: 640, h: 320 };
  let graphSize = { w: 640, h: 120 };

  function resizeAll() {
    sceneSize = fitCanvas(sceneCanvas);
    graphSize = fitCanvas(graphCanvas, 120);
    drawScene();
    drawGraph();
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resizeAll());
    ro.observe(sceneCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAll);
  }

  function computeCurrent(omegaRad) {
    return state.strength * omegaRad * Math.sin(state.theta) * CURRENT_SCALE;
  }

  function drawScene() {
    const { w, h } = sceneSize;
    const ctx = sceneCtx;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.42;
    const magnetW = Math.max(28, w * 0.09);
    const magnetH = h * 0.62;
    const gap = w * 0.5;
    const leftX = cx - gap / 2 - magnetW;
    const rightX = cx + gap / 2;

    const fieldLineCount = 5;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.strokeStyle = colors.physics;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(t * 20) % 12;
    for (let i = 0; i < fieldLineCount; i++) {
      const ly = cy - magnetH / 2 + (magnetH / (fieldLineCount - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(leftX + magnetW, ly);
      ctx.lineTo(rightX, ly);
      ctx.stroke();
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      const ax = rightX - 8;
      ctx.moveTo(ax, ly - 4);
      ctx.lineTo(rightX, ly);
      ctx.lineTo(ax, ly + 4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    function drawMagnet(x, poleNearLabel, poleFarLabel, poleNearOnRight) {
      ctx.save();
      ctx.fillStyle = colors.panelRaised;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, cy - magnetH / 2, magnetW, magnetH, 6);
      ctx.fill();
      ctx.stroke();

      const capW = magnetW * 0.45;
      const capX = poleNearOnRight ? x + magnetW - capW : x;
      ctx.fillStyle = colors.physics;
      roundRect(ctx, capX, cy - magnetH / 2, capW, magnetH, 6);
      ctx.fill();

      ctx.fillStyle = '#06231f';
      ctx.font = `700 ${Math.max(12, magnetW * 0.4)}px ${colors.fontMono}, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(poleNearOnRight ? poleFarLabel : poleNearLabel, x + (poleNearOnRight ? magnetW * 0.28 : magnetW * 0.72), cy);
      ctx.fillStyle = colors.ink;
      ctx.fillText(poleNearOnRight ? poleNearLabel : poleFarLabel, capX + capW / 2, cy);
      ctx.restore();
    }
    drawMagnet(leftX, 'N', 'S', true);
    drawMagnet(rightX, 'S', 'N', false);

    ctx.save();
    ctx.strokeStyle = colors.border;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - magnetH / 2 - 6);
    ctx.lineTo(cx, cy + magnetH / 2 + 6);
    ctx.stroke();
    ctx.restore();

    const coilW = Math.min(gap * 0.7, w * 0.16);
    const coilH = magnetH * 0.62;
    let scaleX = Math.cos(state.theta);
    if (Math.abs(scaleX) < 0.04) scaleX = scaleX < 0 ? -0.04 : 0.04;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, 1);
    ctx.fillStyle = colors.physics;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(-coilW / 2, -coilH / 2, coilW, coilH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 3 / Math.max(0.2, Math.abs(scaleX));
    ctx.strokeRect(-coilW / 2, -coilH / 2, coilW, coilH);
    ctx.lineWidth = 1.5 / Math.max(0.2, Math.abs(scaleX));
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-coilW / 2 + 6, -coilH / 2);
    ctx.lineTo(-coilW / 2 + 6, coilH / 2);
    ctx.moveTo(coilW / 2 - 6, -coilH / 2);
    ctx.lineTo(coilW / 2 - 6, coilH / 2);
    ctx.stroke();
    ctx.restore();

    const ringY = cy + coilH / 2 + 10;
    const ringDX = 9;
    [cx - ringDX, cx + ringDX].forEach((rx) => {
      ctx.beginPath();
      ctx.fillStyle = colors.inkMuted;
      ctx.arc(rx, ringY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const meterX = cx;
    const meterY = h * 0.82;
    const meterR = Math.max(26, h * 0.1);

    ctx.save();
    ctx.strokeStyle = colors.inkMuted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - ringDX, ringY);
    ctx.bezierCurveTo(cx - ringDX, ringY + 24, meterX - meterR * 0.7, meterY - meterR * 0.9, meterX - meterR * 0.6, meterY - meterR * 0.15);
    ctx.moveTo(cx + ringDX, ringY);
    ctx.bezierCurveTo(cx + ringDX, ringY + 24, meterX + meterR * 0.7, meterY - meterR * 0.9, meterX + meterR * 0.6, meterY - meterR * 0.15);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(meterX, meterY, meterR, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = colors.panelRaised;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = colors.inkMuted;
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + (Math.PI / 2) + (i / 3) * (Math.PI / 2.4);
      const x1 = meterX + Math.cos(a) * meterR * 0.82;
      const y1 = meterY + Math.sin(a) * meterR * 0.82;
      const x2 = meterX + Math.cos(a) * meterR * 0.95;
      const y2 = meterY + Math.sin(a) * meterR * 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const maxDeflect = Math.PI / 2.4;
    const norm = Math.max(-1, Math.min(1, state.current / GRAPH_MAX_CURRENT));
    const needleAngle = Math.PI + Math.PI / 2 + norm * maxDeflect;
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(meterX, meterY);
    ctx.lineTo(meterX + Math.cos(needleAngle) * meterR * 0.78, meterY + Math.sin(needleAngle) * meterR * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = colors.inkMuted;
    ctx.arc(meterX, meterY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.inkMuted;
    ctx.font = `600 11px ${colors.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('A', meterX, meterY - meterR * 0.35);
    ctx.restore();
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

  function drawGraph() {
    const { w, h } = graphSize;
    const ctx = graphCtx;
    ctx.clearRect(0, 0, w, h);

    const midY = h / 2;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    ctx.strokeStyle = colors.bgGrid;
    for (let i = 1; i < 8; i++) {
      const gx = (w / 8) * i;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    if (history.length < 2) return;

    const tNow = state.elapsed;
    const tMin = tNow - GRAPH_WINDOW;

    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    let lastX = 0, lastY = midY;
    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      if (p.t < tMin) continue;
      const x = ((p.t - tMin) / GRAPH_WINDOW) * w;
      const y = midY - (p.current / GRAPH_MAX_CURRENT) * (midY - 6);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
      lastX = x; lastY = y;
    }
    ctx.stroke();

    ctx.fillStyle = colors.physics;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateReadouts(omegaRad) {
    const deg = (((state.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI);
    angleReadout.textContent = `${deg.toFixed(0)}°`;
    currentReadout.textContent = `${state.current.toFixed(2)} A`;

    let dir = '정지';
    if (Math.abs(omegaRad) > 0.001) {
      dir = omegaRad > 0 ? '시계 방향' : '반시계 방향';
    }
    dirReadout.textContent = dir;
  }

  // 다른 상황(② 움직이는 자석)이 보이는 동안에는 계산을 건너뛰어 자원을 아낍니다.
  let lastTs = null;
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const isVisible = window.__indCurrentMode !== 'moving-magnet';
    if (isVisible) {
      let omegaRad = 0;
      if (state.dragging) {
        omegaRad = state.dragAngularVelocity;
      } else if (state.playing) {
        omegaRad = state.speedDeg * (Math.PI / 180);
        state.theta += omegaRad * dt;
      }

      state.current = computeCurrent(omegaRad);
      state.elapsed += dt;

      history.push({ t: state.elapsed, current: state.current });
      const cutoff = state.elapsed - GRAPH_WINDOW - 1;
      while (history.length && history[0].t < cutoff) history.shift();

      drawScene();
      drawGraph();
      updateReadouts(omegaRad);
    }

    requestAnimationFrame(tick);
  }

  let wasPlayingBeforeDrag = true;

  sceneCanvas.addEventListener('pointerdown', (evt) => {
    state.dragging = true;
    wasPlayingBeforeDrag = state.playing;
    state.playing = false;
    state.lastPointerX = evt.clientX;
    state.lastPointerT = performance.now() / 1000;
    sceneCanvas.setPointerCapture(evt.pointerId);
  });

  sceneCanvas.addEventListener('pointermove', (evt) => {
    if (!state.dragging) return;
    const now = performance.now() / 1000;
    const dt = Math.max(0.001, now - state.lastPointerT);
    const dx = evt.clientX - state.lastPointerX;
    const dTheta = (dx / sceneSize.w) * Math.PI * 2;
    state.theta += dTheta;
    state.dragAngularVelocity = dTheta / dt;
    state.lastPointerX = evt.clientX;
    state.lastPointerT = now;
  });

  function endDrag(evt) {
    if (!state.dragging) return;
    state.dragging = false;
    state.dragAngularVelocity = 0;
    state.playing = wasPlayingBeforeDrag;
    playBtn.textContent = state.playing ? '일시정지' : '재생';
    playBtn.classList.toggle('is-playing', state.playing);
  }
  sceneCanvas.addEventListener('pointerup', endDrag);
  sceneCanvas.addEventListener('pointercancel', endDrag);
  sceneCanvas.addEventListener('pointerleave', (evt) => {
    if (evt.buttons === 0) endDrag(evt);
  });

  speedInput.addEventListener('input', () => {
    state.speedDeg = parseFloat(speedInput.value);
    speedValueEl.textContent = `${state.speedDeg}°/s`;
  });

  strengthInput.addEventListener('input', () => {
    state.strength = parseFloat(strengthInput.value);
    strengthValueEl.textContent = `${state.strength.toFixed(1)}×`;
  });

  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? '일시정지' : '재생';
    playBtn.classList.toggle('is-playing', state.playing);
  });

  resetBtn.addEventListener('click', () => {
    state.theta = 0;
    state.elapsed = 0;
    state.current = 0;
    history.length = 0;
    state.playing = true;
    playBtn.textContent = '일시정지';
    playBtn.classList.add('is-playing');
  });

  speedValueEl.textContent = `${state.speedDeg}°/s`;
  strengthValueEl.textContent = `${state.strength.toFixed(1)}×`;
  resizeAll();
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// ② 움직이는 자석 (구현됨)
// ------------------------------------------------------------
function initMovingMagnetScenario() {
  const sceneCanvas = document.getElementById('indMoveSceneCanvas');
  const graphCanvas = document.getElementById('indMoveGraphCanvas');
  if (!sceneCanvas || !graphCanvas) return; // 이 페이지가 아니면 종료

  const sceneCtx = sceneCanvas.getContext('2d');
  const graphCtx = graphCanvas.getContext('2d');

  const speedInput = document.getElementById('indMoveSpeed');
  const speedValueEl = document.getElementById('indMoveSpeedValue');
  const strengthInput = document.getElementById('indMoveStrength');
  const strengthValueEl = document.getElementById('indMoveStrengthValue');
  const turnsInput = document.getElementById('indMoveTurns');
  const turnsValueEl = document.getElementById('indMoveTurnsValue');
  const playBtn = document.getElementById('indMovePlayBtn');
  const resetBtn = document.getElementById('indMoveResetBtn');

  const posReadout = document.getElementById('indMovePosReadout');
  const currentReadout = document.getElementById('indMoveCurrentReadout');
  const dirReadout = document.getElementById('indMoveDirReadout');

  // ---------- 상태 ----------
  // pos: 코일 중심(0)을 기준으로 한 자석의 위치. 트랙 범위는 -TRACK_HALF ~ +TRACK_HALF.
  const TRACK_HALF = 10; // 임의 단위
  const FALLOFF_K = 2.2; // 자기장이 얼마나 빨리 약해지는지 (작을수록 급격히 약해짐)

  const state = {
    pos: -TRACK_HALF * 0.6,
    dir: 1, // 자동 재생 시 이동 방향 (+1: 오른쪽/코일 쪽, -1: 왼쪽)
    speed: parseFloat(speedInput.value), // 단위/s (항상 양수, 방향은 dir이 결정)
    strength: parseFloat(strengthInput.value),
    turns: parseFloat(turnsInput.value),
    playing: true,
    dragging: false,
    dragVelocity: 0,
    lastPointerX: 0,
    lastPointerT: 0,
    current: 0,
    elapsed: 0,
  };

  const CURRENT_SCALE = 0.35;
  const GRAPH_WINDOW = 8;
  const GRAPH_MAX_CURRENT = 4;
  const history = [];

  const rootStyle = getComputedStyle(document.documentElement);
  const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
  const colors = {
    physics: cssVar('--accent-physics') || '#f2b84b',
    physicsDim: cssVar('--accent-physics-dim') || '#8a6a2c',
    ink: cssVar('--ink') || '#eaf0fb',
    inkMuted: cssVar('--ink-muted') || '#8ca0c4',
    border: cssVar('--border') || '#23324f',
    panelRaised: cssVar('--panel-raised') || '#16223c',
    bgGrid: cssVar('--bg-grid') || '#16213a',
    fontMono: (cssVar('--font-mono') || 'monospace').split(',')[0].replace(/['"]/g, '').trim(),
  };

  function fitCanvas(canvas, cssHeight) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = rect.width || canvas.parentElement.clientWidth || 640;
    const h = cssHeight || cssWidth * (canvas === sceneCanvas ? 0.42 : 0.19);
    canvas.style.height = h + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssWidth, h };
  }

  let sceneSize = { w: 640, h: 260 };
  let graphSize = { w: 640, h: 120 };

  function resizeAll() {
    sceneSize = fitCanvas(sceneCanvas);
    graphSize = fitCanvas(graphCanvas, 120);
    drawScene();
    drawGraph();
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resizeAll());
    ro.observe(sceneCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAll);
  }

  // ---------- 물리 모델 ----------
  // 쌍극자 자기장을 단순화한 완만한 종형(bell-shape) 감쇠 함수.
  function fieldB(x) {
    return state.strength / Math.pow(1 + (x / FALLOFF_K) * (x / FALLOFF_K), 1.5);
  }
  // dB/dx (해석적 미분)
  function fieldBDeriv(x) {
    const denom = Math.pow(1 + (x / FALLOFF_K) * (x / FALLOFF_K), 2.5);
    return (-3 * state.strength * x) / (FALLOFF_K * FALLOFF_K * denom);
  }
  function computeCurrent(velocity) {
    return -state.turns * fieldBDeriv(state.pos) * velocity * CURRENT_SCALE;
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

  // ---------- 씬(트랙 + 자석 + 코일 + 전류계) 그리기 ----------
  function drawScene() {
    const { w, h } = sceneSize;
    const ctx = sceneCtx;
    ctx.clearRect(0, 0, w, h);

    const trackY = h * 0.38;
    const trackPad = 40;
    const trackW = w - trackPad * 2;
    const pxPerUnit = trackW / (TRACK_HALF * 2);
    const centerX = w / 2;

    function toPx(unitX) { return centerX + unitX * pxPerUnit; }

    // --- 트랙 ---
    ctx.save();
    ctx.strokeStyle = colors.border;
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(trackPad, trackY);
    ctx.lineTo(w - trackPad, trackY);
    ctx.stroke();
    ctx.restore();

    // --- 자기장 세기를 은은한 배경 띠로 표현 ---
    const B_now = fieldB(state.pos);
    ctx.save();
    const glowR = Math.max(18, 60 * Math.min(1, B_now / Math.max(0.01, state.strength)));
    const grad = ctx.createRadialGradient(toPx(0), trackY, 4, toPx(0), trackY, glowR);
    grad.addColorStop(0, colors.physics + '33');
    grad.addColorStop(1, colors.physics + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(toPx(0) - glowR, trackY - glowR, glowR * 2, glowR * 2);
    ctx.restore();

    // --- 자석 (이동) ---
    // 코일보다 먼저 크기를 정합니다: 코일 고리 반지름이 자석 두께보다 커야
    // "자석이 고리 내부를 통과"하는 것처럼 보입니다.
    const magnetW = Math.max(70, w * 0.16);
    const magnetH = h * 0.14;
    const magnetX = toPx(state.pos) - magnetW / 2;
    const magnetY = trackY - magnetH / 2;

    // --- 코일 (고정, 트랙 중앙 — 자석이 통과하는 솔레노이드) ---
    const loopCount = Math.max(3, Math.min(10, Math.round(state.turns)));
    const loopRy = magnetH / 2 + 12;       // 고리 반지름(세로) — 자석보다 넉넉하게
    const loopRx = 7;                       // 고리 두께(가로, 옆에서 본 두께)
    const coilSpan = Math.min(120, 16 * loopCount); // 고리들이 늘어선 전체 폭
    const loopStep = loopCount > 1 ? coilSpan / (loopCount - 1) : 0;
    const coilStartX = centerX - coilSpan / 2;
    const loopXs = [];
    for (let i = 0; i < loopCount; i++) loopXs.push(coilStartX + loopStep * i);

    // 고리의 뒤쪽 절반(자석보다 먼저 그려서 "뒤에 가려지는" 느낌)
    ctx.save();
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    loopXs.forEach((lx) => {
      ctx.beginPath();
      ctx.ellipse(lx, trackY, loopRx, loopRy, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();

    // 자석 본체 (고리 뒤쪽 절반 다음, 앞쪽 절반보다는 먼저 그려서 통과하는 것처럼 보이게 함)
    ctx.save();
    ctx.fillStyle = colors.panelRaised;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    roundRect(ctx, magnetX, magnetY, magnetW, magnetH, 6);
    ctx.fill();
    ctx.stroke();

    // N극이 코일(오른쪽 이동 방향)을 향하도록 오른쪽 절반을 포인트 컬러로 표시
    const capW = magnetW * 0.4;
    ctx.fillStyle = colors.physics;
    roundRect(ctx, magnetX + magnetW - capW, magnetY, capW, magnetH, 6);
    ctx.fill();

    ctx.fillStyle = colors.ink;
    ctx.font = `700 ${Math.max(11, magnetH * 0.5)}px ${colors.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', magnetX + magnetW * 0.22, magnetY + magnetH / 2);
    ctx.fillStyle = '#06231f';
    ctx.fillText('N', magnetX + magnetW - capW / 2, magnetY + magnetH / 2);
    ctx.restore();

    // 고리의 앞쪽 절반 (자석 위에 그려서 "자석이 고리 내부를 통과"하는 것처럼 보이게 함)
    ctx.save();
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 1.6;
    loopXs.forEach((lx) => {
      ctx.beginPath();
      ctx.ellipse(lx, trackY, loopRx, loopRy, 0, 0, Math.PI);
      ctx.stroke();
    });
    ctx.restore();

    ctx.fillStyle = colors.inkMuted;
    ctx.font = `600 11px ${colors.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`N=${Math.round(state.turns)}(감은 횟수)`, centerX, trackY + loopRy + 22);

    // --- 코일 -> 전류계 도선 ---
    const coilBottomY = trackY + loopRy;
    const wireLeftX = loopXs[0];
    const wireRightX = loopXs[loopXs.length - 1];
    const meterX = centerX;
    const meterY = h * 0.86;
    const meterR = Math.max(24, h * 0.11);

    ctx.save();
    ctx.strokeStyle = colors.inkMuted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wireLeftX, coilBottomY);
    ctx.bezierCurveTo(wireLeftX, coilBottomY + 24, meterX - meterR * 0.7, meterY - meterR * 0.9, meterX - meterR * 0.6, meterY - meterR * 0.15);
    ctx.moveTo(wireRightX, coilBottomY);
    ctx.bezierCurveTo(wireRightX, coilBottomY + 24, meterX + meterR * 0.7, meterY - meterR * 0.9, meterX + meterR * 0.6, meterY - meterR * 0.15);
    ctx.stroke();
    ctx.restore();

    // --- 전류계(아날로그 게이지) ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(meterX, meterY, meterR, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = colors.panelRaised;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = colors.inkMuted;
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + (Math.PI / 2) + (i / 3) * (Math.PI / 2.4);
      const x1 = meterX + Math.cos(a) * meterR * 0.82;
      const y1 = meterY + Math.sin(a) * meterR * 0.82;
      const x2 = meterX + Math.cos(a) * meterR * 0.95;
      const y2 = meterY + Math.sin(a) * meterR * 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const maxDeflect = Math.PI / 2.4;
    const norm = Math.max(-1, Math.min(1, state.current / GRAPH_MAX_CURRENT));
    const needleAngle = Math.PI + Math.PI / 2 + norm * maxDeflect;
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(meterX, meterY);
    ctx.lineTo(meterX + Math.cos(needleAngle) * meterR * 0.78, meterY + Math.sin(needleAngle) * meterR * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = colors.inkMuted;
    ctx.arc(meterX, meterY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.inkMuted;
    ctx.font = `600 11px ${colors.fontMono}, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('A', meterX, meterY - meterR * 0.35);
    ctx.restore();
  }

  // ---------- 전류-시간 그래프 (회전 코일 페이지와 동일한 방식) ----------
  function drawGraph() {
    const { w, h } = graphSize;
    const ctx = graphCtx;
    ctx.clearRect(0, 0, w, h);

    const midY = h / 2;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    ctx.strokeStyle = colors.bgGrid;
    for (let i = 1; i < 8; i++) {
      const gx = (w / 8) * i;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    if (history.length < 2) return;

    const tNow = state.elapsed;
    const tMin = tNow - GRAPH_WINDOW;

    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    let lastX = 0, lastY = midY;
    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      if (p.t < tMin) continue;
      const x = ((p.t - tMin) / GRAPH_WINDOW) * w;
      const y = midY - (p.current / GRAPH_MAX_CURRENT) * (midY - 6);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
      lastX = x; lastY = y;
    }
    ctx.stroke();

    ctx.fillStyle = colors.physics;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateReadouts(velocity) {
    posReadout.textContent = state.pos.toFixed(1);
    currentReadout.textContent = `${state.current.toFixed(2)} A`;

    let dir = '정지';
    if (Math.abs(velocity) > 0.01) {
      dir = velocity > 0 ? '코일 쪽(→)' : '코일 반대쪽(←)';
    }
    dirReadout.textContent = dir;
  }

  // ---------- 애니메이션 루프 ----------
  // 다른 상황(① 회전하는 코일)이 보이는 동안에는 계산을 건너뛰어 자원을 아낍니다.
  let lastTs = null;
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const isVisible = window.__indCurrentMode === 'moving-magnet';
    if (isVisible) {
      let velocity = 0;
      if (state.dragging) {
        velocity = state.dragVelocity;
      } else if (state.playing) {
        velocity = state.dir * state.speed;
        state.pos += velocity * dt;
        // 트랙 끝에 닿으면 방향을 반전 (자석이 왕복하며 가까워졌다 멀어짐을 반복)
        if (state.pos > TRACK_HALF) { state.pos = TRACK_HALF; state.dir = -1; }
        if (state.pos < -TRACK_HALF) { state.pos = -TRACK_HALF; state.dir = 1; }
      }

      state.current = computeCurrent(velocity);
      state.elapsed += dt;

      history.push({ t: state.elapsed, current: state.current });
      const cutoff = state.elapsed - GRAPH_WINDOW - 1;
      while (history.length && history[0].t < cutoff) history.shift();

      drawScene();
      drawGraph();
      updateReadouts(velocity);
    }

    requestAnimationFrame(tick);
  }

  // ---------- 드래그로 자석 직접 이동 ----------
  let wasPlayingBeforeDrag = true;

  sceneCanvas.addEventListener('pointerdown', (evt) => {
    state.dragging = true;
    wasPlayingBeforeDrag = state.playing;
    state.playing = false;
    state.lastPointerX = evt.clientX;
    state.lastPointerT = performance.now() / 1000;
    sceneCanvas.setPointerCapture(evt.pointerId);
  });

  sceneCanvas.addEventListener('pointermove', (evt) => {
    if (!state.dragging) return;
    const now = performance.now() / 1000;
    const dt = Math.max(0.001, now - state.lastPointerT);
    const dx = evt.clientX - state.lastPointerX;
    const trackPad = 40;
    const trackW = sceneSize.w - trackPad * 2;
    const pxPerUnit = trackW / (TRACK_HALF * 2);
    const dUnit = dx / pxPerUnit;
    state.pos = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, state.pos + dUnit));
    state.dragVelocity = dUnit / dt;
    state.lastPointerX = evt.clientX;
    state.lastPointerT = now;
  });

  function endDrag() {
    if (!state.dragging) return;
    state.dragging = false;
    state.dragVelocity = 0;
    state.playing = wasPlayingBeforeDrag;
    playBtn.textContent = state.playing ? '일시정지' : '재생';
    playBtn.classList.toggle('is-playing', state.playing);
  }
  sceneCanvas.addEventListener('pointerup', endDrag);
  sceneCanvas.addEventListener('pointercancel', endDrag);
  sceneCanvas.addEventListener('pointerleave', (evt) => {
    if (evt.buttons === 0) endDrag();
  });

  // ---------- 컨트롤 이벤트 ----------
  speedInput.addEventListener('input', () => {
    state.speed = parseFloat(speedInput.value);
    speedValueEl.textContent = `${state.speed}/s`;
  });

  strengthInput.addEventListener('input', () => {
    state.strength = parseFloat(strengthInput.value);
    strengthValueEl.textContent = `${state.strength.toFixed(1)}×`;
  });

  turnsInput.addEventListener('input', () => {
    state.turns = parseFloat(turnsInput.value);
    turnsValueEl.textContent = `${Math.round(state.turns)}회`;
  });

  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? '일시정지' : '재생';
    playBtn.classList.toggle('is-playing', state.playing);
  });

  resetBtn.addEventListener('click', () => {
    state.pos = -TRACK_HALF * 0.6;
    state.dir = 1;
    state.elapsed = 0;
    state.current = 0;
    history.length = 0;
    state.playing = true;
    playBtn.textContent = '일시정지';
    playBtn.classList.add('is-playing');
  });

  // ---------- 초기화 ----------
  speedValueEl.textContent = `${state.speed}/s`;
  strengthValueEl.textContent = `${state.strength.toFixed(1)}×`;
  turnsValueEl.textContent = `${Math.round(state.turns)}회`;
  resizeAll();
  requestAnimationFrame(tick);
}
