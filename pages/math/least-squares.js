// 최소제곱법 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결합니다.
// 이 파일이 이 시뮬레이션의 담당 영역입니다.

document.addEventListener('DOMContentLoaded', () => {

  // ---------- 요소 참조 ----------
  const dataCanvas = document.getElementById('ls-data-canvas');
  const curveCanvas = document.getElementById('ls-curve-canvas');
  const dataCtx = dataCanvas.getContext('2d');
  const curveCtx = curveCanvas.getContext('2d');

  const slopeInput = document.getElementById('ls-slope');
  const interceptInput = document.getElementById('ls-intercept');
  const slopeValueLabel = document.getElementById('ls-slope-value');
  const interceptValueLabel = document.getElementById('ls-intercept-value');

  const eqLabel = document.getElementById('ls-eq');
  const rssLabel = document.getElementById('ls-rss');
  const derivLabel = document.getElementById('ls-deriv');

  const btnRegen = document.getElementById('ls-btn-regen');
  const btnOptimize = document.getElementById('ls-btn-optimize');
  const btnReset = document.getElementById('ls-btn-reset');

  // ---------- 스타일 토큰 (style.css의 CSS 변수를 그대로 읽어서 사용) ----------
  const style = getComputedStyle(document.documentElement);
  const colAccent = style.getPropertyValue('--accent-math').trim() || '#5eead4';
  const colAccentDim = style.getPropertyValue('--accent-math-dim').trim() || '#2c7d72';
  const colInk = style.getPropertyValue('--ink').trim() || '#eaf0fb';
  const colInkMuted = style.getPropertyValue('--ink-muted').trim() || '#8ca0c4';
  const colBorder = style.getPropertyValue('--border').trim() || '#23324f';

  // ---------- 상태 ----------
  let points = [];      // {x, y} 실제 데이터 (수학 좌표계)
  let a = 1;             // 현재 기울기
  let b = 0;             // 현재 절편
  let animId = null;      // 자동 최적화 애니메이션 프레임 id
  let xDomain = [0, 10]; // 데이터 x 범위 (표시용 여백 포함)
  let yDomain = [0, 10]; // 데이터 y 범위 (표시용 여백 포함)

  // ---------- 데이터 생성 ----------
  function generateData() {
    const trueA = 0.6 + Math.random() * 0.9;   // 0.6 ~ 1.5
    const trueB = -1 + Math.random() * 3;       // -1 ~ 2
    const n = 11 + Math.floor(Math.random() * 4); // 11~14개
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 10;
      const noise = (Math.random() - 0.5) * 3.2;
      const y = trueA * x + trueB + noise;
      pts.push({ x, y });
    }
    points = pts;

    // 도메인 계산 (여백 포함)
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xPad = Math.max((xMax - xMin) * 0.18, 0.6);
    const yPad = Math.max((yMax - yMin) * 0.25, 0.8);
    xDomain = [xMin - xPad, xMax + xPad];
    yDomain = [yMin - yPad, yMax + yPad];

    // 초기 직선을 대략 데이터 중앙을 지나는 완만한 직선으로 설정
    const ybar = ys.reduce((s, v) => s + v, 0) / ys.length;
    a = 0.3;
    b = ybar - a * (xDomain[0] + xDomain[1]) / 2;
    syncSlidersFromState();
  }

  function syncSlidersFromState() {
    // 슬라이더 범위를 데이터에 맞게 조정
    slopeInput.min = -1;
    slopeInput.max = 3;
    interceptInput.min = Math.floor(yDomain[0] - 6);
    interceptInput.max = Math.ceil(yDomain[1] + 6);
    slopeInput.value = a;
    interceptInput.value = b;
    updateValueLabels();
  }

  function updateValueLabels() {
    slopeValueLabel.textContent = a.toFixed(2);
    interceptValueLabel.textContent = b.toFixed(2);
  }

  // ---------- 최소제곱 통계량 ----------
  function computeStats() {
    const n = points.length;
    const xbar = points.reduce((s, p) => s + p.x, 0) / n;
    const ybar = points.reduce((s, p) => s + p.y, 0) / n;
    let sxx = 0, sxy = 0;
    points.forEach(p => {
      sxx += (p.x - xbar) * (p.x - xbar);
      sxy += (p.x - xbar) * (p.y - ybar);
    });
    const aStar = sxy / sxx;
    const bStar = ybar - aStar * xbar;
    return { xbar, ybar, sxx, sxy, aStar, bStar };
  }

  function rss(aVal, bVal) {
    return points.reduce((s, p) => {
      const r = p.y - (aVal * p.x + bVal);
      return s + r * r;
    }, 0);
  }

  function drssda(aVal, bVal) {
    // ∂S/∂a = -2 Σ xᵢ (yᵢ - (a xᵢ + b))
    let s = 0;
    points.forEach(p => {
      const r = p.y - (aVal * p.x + bVal);
      s += p.x * r;
    });
    return -2 * s;
  }

  // ---------- 캔버스 준비 (고해상도 대응) ----------
  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  // ---------- 데이터 평면 그리기 ----------
  function drawDataPlane() {
    const { w, h } = fitCanvas(dataCanvas);
    dataCtx.clearRect(0, 0, w, h);

    const padL = 34, padR = 14, padT = 14, padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const toPx = (x) => padL + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
    const toPy = (y) => padT + plotH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

    // 축
    dataCtx.strokeStyle = colBorder;
    dataCtx.lineWidth = 1;
    dataCtx.beginPath();
    dataCtx.moveTo(padL, padT);
    dataCtx.lineTo(padL, padT + plotH);
    dataCtx.lineTo(padL + plotW, padT + plotH);
    dataCtx.stroke();

    dataCtx.fillStyle = colInkMuted;
    dataCtx.font = '9px "IBM Plex Mono", monospace';
    dataCtx.fillText('x', padL + plotW - 6, padT + plotH + 18);
    dataCtx.fillText('y', padL - 22, padT + 8);

    // 오차 정사각형 (잔차²) — 먼저 그려서 선/점 아래 깔리도록
    points.forEach(p => {
      const predY = a * p.x + b;
      const residual = p.y - predY;
      const sidePx = Math.min(Math.abs(toPy(0) - toPy(residual)), plotH); // 잔차 크기를 픽셀 변으로 환산
      const x1 = toPx(p.x);
      const yTop = Math.min(toPy(p.y), toPy(predY));
      dataCtx.fillStyle = colAccent + '33'; // 반투명 채움
      dataCtx.strokeStyle = colAccentDim;
      dataCtx.lineWidth = 1;
      dataCtx.fillRect(x1 - sidePx, yTop, sidePx, sidePx);
      dataCtx.strokeRect(x1 - sidePx, yTop, sidePx, sidePx);
    });

    // 회귀 직선
    const xL = xDomain[0], xR = xDomain[1];
    dataCtx.strokeStyle = colAccent;
    dataCtx.lineWidth = 2.5;
    dataCtx.beginPath();
    dataCtx.moveTo(toPx(xL), toPy(a * xL + b));
    dataCtx.lineTo(toPx(xR), toPy(a * xR + b));
    dataCtx.stroke();

    // 데이터 점 + 잔차 세로선
    points.forEach(p => {
      const predY = a * p.x + b;
      dataCtx.strokeStyle = colInkMuted;
      dataCtx.lineWidth = 1;
      dataCtx.beginPath();
      dataCtx.moveTo(toPx(p.x), toPy(p.y));
      dataCtx.lineTo(toPx(p.x), toPy(predY));
      dataCtx.stroke();

      dataCtx.fillStyle = colInk;
      dataCtx.beginPath();
      dataCtx.arc(toPx(p.x), toPy(p.y), 3.2, 0, Math.PI * 2);
      dataCtx.fill();
    });
  }

  // ---------- 오차 곡선 평면 그리기 ----------
  function drawCurvePlane() {
    const { w, h } = fitCanvas(curveCanvas);
    curveCtx.clearRect(0, 0, w, h);

    const padL = 34, padR = 14, padT = 14, padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // a 범위: 슬라이더 범위를 그대로 사용
    const aMin = parseFloat(slopeInput.min);
    const aMax = parseFloat(slopeInput.max);

    // 현재 b로 고정했을 때 RSS(a)의 최댓값을 추정해 y축 범위 결정
    let maxRss = 0;
    const samples = 60;
    for (let i = 0; i <= samples; i++) {
      const av = aMin + (aMax - aMin) * (i / samples);
      maxRss = Math.max(maxRss, rss(av, b));
    }
    maxRss = Math.max(maxRss, 1);

    const toPx = (aVal) => padL + ((aVal - aMin) / (aMax - aMin)) * plotW;
    const toPy = (sVal) => padT + plotH - (Math.max(0, sVal) / maxRss) * plotH;

    // 축
    curveCtx.strokeStyle = colBorder;
    curveCtx.lineWidth = 1;
    curveCtx.beginPath();
    curveCtx.moveTo(padL, padT);
    curveCtx.lineTo(padL, padT + plotH);
    curveCtx.lineTo(padL + plotW, padT + plotH);
    curveCtx.stroke();

    curveCtx.fillStyle = colInkMuted;
    curveCtx.font = '9px "IBM Plex Mono", monospace';
    curveCtx.fillText('a', padL + plotW - 6, padT + plotH + 18);
    curveCtx.fillText('RSS', padL - 30, padT + 8);

    // 2차 곡선
    curveCtx.strokeStyle = colAccent;
    curveCtx.lineWidth = 2.2;
    curveCtx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const av = aMin + (aMax - aMin) * (i / samples);
      const sv = rss(av, b);
      const px = toPx(av), py = toPy(sv);
      if (i === 0) curveCtx.moveTo(px, py);
      else curveCtx.lineTo(px, py);
    }
    curveCtx.stroke();

    // 현재 점 P
    const curRss = rss(a, b);
    const px = toPx(a);
    const py = toPy(curRss);

    // 접선 (미분값 표시)
    const slope = drssda(a, b); // dRSS/da, 곡선의 실제 픽셀 기울기와는 스케일이 다르므로 시각적 길이로 정규화
    const dAforLine = (aMax - aMin) * 0.14;
    const p1a = a - dAforLine, p2a = a + dAforLine;
    const p1s = curRss - slope * dAforLine;
    const p2s = curRss + slope * dAforLine;

    curveCtx.strokeStyle = colInk;
    curveCtx.lineWidth = 1.4;
    curveCtx.setLineDash([4, 3]);
    curveCtx.beginPath();
    curveCtx.moveTo(toPx(p1a), toPy(p1s));
    curveCtx.lineTo(toPx(p2a), toPy(p2s));
    curveCtx.stroke();
    curveCtx.setLineDash([]);

    curveCtx.fillStyle = colInk;
    curveCtx.beginPath();
    curveCtx.arc(px, py, 4, 0, Math.PI * 2);
    curveCtx.fill();
    curveCtx.strokeStyle = colAccent;
    curveCtx.lineWidth = 1.5;
    curveCtx.stroke();
  }

  // ---------- 정보 패널 갱신 ----------
  function updateReadouts() {
    const sign = b >= 0 ? '+' : '-';
    eqLabel.textContent = `y = ${a.toFixed(2)}x ${sign} ${Math.abs(b).toFixed(2)}`;
    rssLabel.textContent = rss(a, b).toFixed(2);
    derivLabel.textContent = drssda(a, b).toFixed(2);
  }

  function render() {
    drawDataPlane();
    drawCurvePlane();
    updateReadouts();
  }

  // ---------- 이벤트 ----------
  function stopAnimation() {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    btnOptimize.classList.remove('is-active');
  }

  slopeInput.addEventListener('input', () => {
    stopAnimation();
    a = parseFloat(slopeInput.value);
    updateValueLabels();
    render();
  });

  interceptInput.addEventListener('input', () => {
    stopAnimation();
    b = parseFloat(interceptInput.value);
    updateValueLabels();
    render();
  });

  btnRegen.addEventListener('click', () => {
    stopAnimation();
    generateData();
    render();
  });

  btnReset.addEventListener('click', () => {
    stopAnimation();
    const ybar = points.reduce((s, p) => s + p.y, 0) / points.length;
    a = 0.3;
    b = ybar - a * (xDomain[0] + xDomain[1]) / 2;
    syncSlidersFromState();
    render();
  });

  btnOptimize.addEventListener('click', () => {
    stopAnimation();
    btnOptimize.classList.add('is-active');
    const { aStar, bStar } = computeStats();
    const startA = a, startB = b;
    const duration = 900; // ms
    let startTime = null;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(ts) {
      if (startTime === null) startTime = ts;
      const t = Math.min(1, (ts - startTime) / duration);
      const e = easeInOutCubic(t);
      a = startA + (aStar - startA) * e;
      b = startB + (bStar - startB) * e;
      slopeInput.value = a;
      interceptInput.value = b;
      updateValueLabels();
      render();
      if (t < 1) {
        animId = requestAnimationFrame(step);
      } else {
        animId = null;
        btnOptimize.classList.remove('is-active');
      }
    }
    animId = requestAnimationFrame(step);
  });

  window.addEventListener('resize', () => {
    render();
  });

  // ---------- 초기화 ----------
  generateData();
  render();
});
