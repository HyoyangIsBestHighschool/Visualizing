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
// [② 움직이는 자석] (구현 예정)
//   - #indStageMovingMagnet : 정지한 코일에 자석이 가까워지고 멀어지는 장면
//   - #indControlsMovingMagnet : 자석 속도 / 자석-코일 거리 컨트롤
//   담당자는 이 파일의 "② 움직이는 자석" 섹션에 이어서 구현하면 됩니다.
//   id는 indMove* 접두사를 권장합니다 (예: indMoveSceneCanvas).
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initModeSwitch();
  initRotateScenario();
  // TODO: initMovingMagnetScenario(); — ② 구현 시 여기서 초기화 함수를 호출하세요.
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
// ② 움직이는 자석 (구현 예정)
// 담당자는 여기에 initMovingMagnetScenario() 함수를 작성하고,
// 위쪽 DOMContentLoaded 안의 TODO 주석에서 호출을 활성화하세요.
// 참고할 element id: indStageMovingMagnet, indControlsMovingMagnet
// ------------------------------------------------------------
// function initMovingMagnetScenario() {
//   // TODO: 정지한 코일 + 움직이는 자석 시뮬레이션 구현
// }
