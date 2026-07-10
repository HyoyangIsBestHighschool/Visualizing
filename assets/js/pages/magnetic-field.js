// ============================================================
// 자석에 의한 자기장 시뮬레이션 로직
// - #sim-stage : 자석 + 회전 코일 + 전류계(캔버스) + 전류-시간 그래프
// - #sim-controls : 회전 속도 / 자석 세기 슬라이더, 재생/초기화 버튼
//
// 물리 모델(단순화):
//   자속  Φ(θ) = B·A·cos(θ)
//   기전력 ε   = -dΦ/dt = B·A·ω·sin(θ)
//   전류  I   ∝ (자석 세기) × (각속도 ω) × sin(θ)
// → 코일이 회전하지 않으면(ω = 0) 자기장 속에 있어도 전류는 0.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const sceneCanvas = document.getElementById('mfSceneCanvas');
  const graphCanvas = document.getElementById('mfGraphCanvas');
  if (!sceneCanvas || !graphCanvas) return; // 이 페이지가 아니면 종료

  const sceneCtx = sceneCanvas.getContext('2d');
  const graphCtx = graphCanvas.getContext('2d');

  const speedInput = document.getElementById('mfSpeed');
  const speedValueEl = document.getElementById('mfSpeedValue');
  const strengthInput = document.getElementById('mfStrength');
  const strengthValueEl = document.getElementById('mfStrengthValue');
  const playBtn = document.getElementById('mfPlayBtn');
  const resetBtn = document.getElementById('mfResetBtn');

  const angleReadout = document.getElementById('mfAngleReadout');
  const currentReadout = document.getElementById('mfCurrentReadout');
  const dirReadout = document.getElementById('mfDirReadout');

  // ---------- 상태 ----------
  const state = {
    theta: 0,               // 코일 회전각 (rad)
    speedDeg: parseFloat(speedInput.value),  // 슬라이더 값 (deg/s)
    strength: parseFloat(strengthInput.value), // 자석 세기 배율
    playing: true,
    dragging: false,
    dragAngularVelocity: 0,  // 드래그 중 계산된 순간 각속도 (rad/s)
    lastPointerX: 0,
    lastPointerT: 0,
    current: 0,
    elapsed: 0,              // 그래프용 누적 시간 (s)
  };

  const CURRENT_SCALE = 0.5;   // I = strength * omega(rad/s) * sin(theta) * SCALE
  const GRAPH_WINDOW = 8;      // 그래프에 보여줄 시간 범위 (s)
  const GRAPH_MAX_CURRENT = 4; // 그래프 y축 고정 범위 (A)
  const history = []; // {t, current}

  // ---------- CSS 변수 읽기 (색상은 style.css 토큰을 그대로 재사용) ----------
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

  // ---------- 캔버스 반응형 리사이즈 (devicePixelRatio 대응) ----------
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

  // ---------- 전류 계산 ----------
  function computeCurrent(omegaRad) {
    return state.strength * omegaRad * Math.sin(state.theta) * CURRENT_SCALE;
  }

  // ---------- 씬(자석 + 코일 + 전류계) 그리기 ----------
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

    // --- 자기장 선 (N -> S, 왼쪽에서 오른쪽) ---
    const fieldLineCount = 5;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.strokeStyle = colors.physics;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(t * 20) % 12; // 은은하게 흐르는 느낌
    for (let i = 0; i < fieldLineCount; i++) {
      const ly = cy - magnetH / 2 + (magnetH / (fieldLineCount - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(leftX + magnetW, ly);
      ctx.lineTo(rightX, ly);
      ctx.stroke();
      // 화살촉
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

    // --- 자석 (왼쪽: N이 코일을 향함 / 오른쪽: S가 코일을 향함) ---
    function drawMagnet(x, poleNearLabel, poleFarLabel, poleNearOnRight) {
      ctx.save();
      ctx.fillStyle = colors.panelRaised;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, cy - magnetH / 2, magnetW, magnetH, 6);
      ctx.fill();
      ctx.stroke();

      // 코일 쪽을 향한 극(N)에 포인트 컬러
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
    drawMagnet(leftX, 'N', 'S', true);   // 오른쪽 끝이 N (코일 쪽)
    drawMagnet(rightX, 'S', 'N', false); // 왼쪽 끝이 S (코일 쪽)

    // --- 회전축(점선) ---
    ctx.save();
    ctx.strokeStyle = colors.border;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - magnetH / 2 - 6);
    ctx.lineTo(cx, cy + magnetH / 2 + 6);
    ctx.stroke();
    ctx.restore();

    // --- 회전하는 코일 ---
    const coilW = Math.min(gap * 0.7, w * 0.16);
    const coilH = magnetH * 0.62;
    let scaleX = Math.cos(state.theta);
    if (Math.abs(scaleX) < 0.04) scaleX = scaleX < 0 ? -0.04 : 0.04; // 완전히 안 보이지 않게 최소 두께 유지

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, 1);
    ctx.fillStyle = colors.physics;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(-coilW / 2, -coilH / 2, coilW, coilH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.physics;
    ctx.lineWidth = 3 / Math.max(0.2, Math.abs(scaleX)); // 찌그러져도 선 굵기 유지
    ctx.strokeRect(-coilW / 2, -coilH / 2, coilW, coilH);
    // 감긴 도선처럼 보이도록 안쪽 선 두 줄
    ctx.lineWidth = 1.5 / Math.max(0.2, Math.abs(scaleX));
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-coilW / 2 + 6, -coilH / 2);
    ctx.lineTo(-coilW / 2 + 6, coilH / 2);
    ctx.moveTo(coilW / 2 - 6, -coilH / 2);
    ctx.lineTo(coilW / 2 - 6, coilH / 2);
    ctx.stroke();
    ctx.restore();

    // --- 슬립링(고정 접점) ---
    const ringY = cy + coilH / 2 + 10;
    const ringDX = 9;
    [cx - ringDX, cx + ringDX].forEach((rx) => {
      ctx.beginPath();
      ctx.fillStyle = colors.inkMuted;
      ctx.arc(rx, ringY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // --- 전류계로 가는 도선 ---
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

    // 눈금
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

    // 바늘
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

  // ---------- 전류-시간 그래프 ----------
  function drawGraph() {
    const { w, h } = graphSize;
    const ctx = graphCtx;
    ctx.clearRect(0, 0, w, h);

    const midY = h / 2;
    // 0 기준선
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // 세로 그리드
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

    // 현재 위치 점
    ctx.fillStyle = colors.physics;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 읽기 값 갱신 ----------
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

  // ---------- 애니메이션 루프 ----------
  let lastTs = null;
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000); // 큰 dt 방지(탭 전환 등)
    lastTs = ts;

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
    // 오래된 기록 정리
    const cutoff = state.elapsed - GRAPH_WINDOW - 1;
    while (history.length && history[0].t < cutoff) history.shift();

    drawScene();
    drawGraph();
    updateReadouts(omegaRad);

    requestAnimationFrame(tick);
  }

  // ---------- 드래그로 코일 직접 회전 ----------
  let wasPlayingBeforeDrag = true;

  function pointerX(evt) {
    return (evt.touches ? evt.touches[0].clientX : evt.clientX);
  }

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
    const dTheta = (dx / sceneSize.w) * Math.PI * 2; // 캔버스 전체 폭 드래그 = 1바퀴
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

  // ---------- 컨트롤 이벤트 ----------
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

  // ---------- 초기화 ----------
  speedValueEl.textContent = `${state.speedDeg}°/s`;
  strengthValueEl.textContent = `${state.strength.toFixed(1)}×`;
  resizeAll();
  requestAnimationFrame(tick);
});
