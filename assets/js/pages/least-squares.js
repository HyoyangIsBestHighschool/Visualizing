// 최소제곱법 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결합니다.
// 이 파일이 이 시뮬레이션의 담당 영역입니다.

document.addEventListener('DOMContentLoaded', () => {

  // ---------- 요소 참조 ----------
  const canvas = document.getElementById('ls-canvas');
  const ctx = canvas.getContext('2d');

  const slopeInput = document.getElementById('ls-slope');
  const interceptInput = document.getElementById('ls-intercept');
  const slopeValueLabel = document.getElementById('ls-slope-value');
  const interceptValueLabel = document.getElementById('ls-intercept-value');

  const eqLabel = document.getElementById('ls-eq');
  const ssrLabel = document.getElementById('ls-ssr-value');
  const readoutBox = document.getElementById('ls-readout');
  const feedbackEl = document.getElementById('ls-feedback');

  const btnRegen = document.getElementById('ls-btn-regen');
  const btnOptimal = document.getElementById('ls-btn-optimal');
  const btnReset = document.getElementById('ls-btn-reset');

  // ---------- 스타일 토큰 (style.css의 CSS 변수를 그대로 읽어서 사용) ----------
  const style = getComputedStyle(document.documentElement);
  const colAccent = style.getPropertyValue('--accent-math').trim() || '#5eead4';
  const colPhysics = style.getPropertyValue('--accent-physics').trim() || '#f2b84b';
  const colInk = style.getPropertyValue('--ink').trim() || '#eaf0fb';
  const colInkMuted = style.getPropertyValue('--ink-muted').trim() || '#8ca0c4';
  const colBorder = style.getPropertyValue('--border').trim() || '#23324f';

  // "정답에 가까워졌다"고 판단하는 기준: 현재 SSR이 최소 SSR의 몇 % 이내인지
  const CLOSE_RATIO = 1.05;

  // ---------- 상태 ----------
  let points = [];        // {x, y} 실제 데이터 (수학 좌표계)
  let m = 1;                // 현재 기울기 (사용자 조작)
  let b = 0;                // 현재 절편 (사용자 조작)
  let showOptimal = false;  // 정답선 표시 여부
  let xDomain = [0, 10];
  let yDomain = [0, 10];

  // ---------- 데이터 생성 ----------
  function generateData() {
    const trueM = 0.6 + Math.random() * 0.9;   // 0.6 ~ 1.5
    const trueB = -1 + Math.random() * 3;       // -1 ~ 2
    const n = 11 + Math.floor(Math.random() * 4); // 11~14개
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 10;
      const noise = (Math.random() - 0.5) * 3.2;
      const y = trueM * x + trueB + noise;
      pts.push({ x, y });
    }
    points = pts;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xPad = Math.max((xMax - xMin) * 0.18, 0.6);
    const yPad = Math.max((yMax - yMin) * 0.25, 0.8);
    xDomain = [xMin - xPad, xMax + xPad];
    yDomain = [yMin - yPad, yMax + yPad];

    const ybar = ys.reduce((s, v) => s + v, 0) / ys.length;
    m = 0.3;
    b = ybar - m * (xDomain[0] + xDomain[1]) / 2;
    interceptInput.min = Math.floor(yDomain[0] - 6);
    interceptInput.max = Math.ceil(yDomain[1] + 6);
    syncSlidersFromState();
  }

  function syncSlidersFromState() {
    slopeInput.value = m;
    interceptInput.value = b;
    updateValueLabels();
  }

  function updateValueLabels() {
    slopeValueLabel.textContent = m.toFixed(2);
    interceptValueLabel.textContent = b.toFixed(2);
  }

  // ---------- 최소제곱 통계량 ----------
  function computeOptimal() {
    const n = points.length;
    const xbar = points.reduce((s, p) => s + p.x, 0) / n;
    const ybar = points.reduce((s, p) => s + p.y, 0) / n;
    let sxx = 0, sxy = 0;
    points.forEach(p => {
      sxx += (p.x - xbar) * (p.x - xbar);
      sxy += (p.x - xbar) * (p.y - ybar);
    });
    const mStar = sxy / sxx;
    const bStar = ybar - mStar * xbar;
    return { mStar, bStar };
  }

  function ssr(mVal, bVal) {
    return points.reduce((s, p) => {
      const r = p.y - (mVal * p.x + bVal);
      return s + r * r;
    }, 0);
  }

  // ---------- 캔버스 준비 (고해상도 대응) ----------
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  // ---------- 산점도 + 직선 + 잔차 그리기 ----------
  function draw() {
    const { w, h } = fitCanvas();
    ctx.clearRect(0, 0, w, h);

    const padL = 36, padR = 16, padT = 16, padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const toPx = (x) => padL + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
    const toPy = (y) => padT + plotH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

    // 축
    ctx.strokeStyle = colBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = colInkMuted;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('x', padL + plotW - 6, padT + plotH + 20);
    ctx.fillText('y', padL - 24, padT + 8);

    const xL = xDomain[0], xR = xDomain[1];

    // 정답선 (선형회귀 정답선 보기 토글 시)
    if (showOptimal) {
      const { mStar, bStar } = computeOptimal();
      ctx.strokeStyle = colPhysics;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(toPx(xL), toPy(mStar * xL + bStar));
      ctx.lineTo(toPx(xR), toPy(mStar * xR + bStar));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 잔차 점선 (실제값 -> 예측값)
    ctx.strokeStyle = colInkMuted;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    points.forEach(p => {
      const predY = m * p.x + b;
      ctx.beginPath();
      ctx.moveTo(toPx(p.x), toPy(p.y));
      ctx.lineTo(toPx(p.x), toPy(predY));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 내가 움직이는 직선
    ctx.strokeStyle = colAccent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(toPx(xL), toPy(m * xL + b));
    ctx.lineTo(toPx(xR), toPy(m * xR + b));
    ctx.stroke();

    // 데이터 점
    points.forEach(p => {
      ctx.fillStyle = colInk;
      ctx.beginPath();
      ctx.arc(toPx(p.x), toPy(p.y), 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---------- 정보 패널 갱신 ----------
  function updateReadouts() {
    const sign = b >= 0 ? '+' : '-';
    eqLabel.textContent = `y = ${m.toFixed(2)}x ${sign} ${Math.abs(b).toFixed(2)}`;

    const currentSsr = ssr(m, b);
    const { mStar, bStar } = computeOptimal();
    const minSsr = ssr(mStar, bStar);
    ssrLabel.textContent = currentSsr.toFixed(2);

    const isClose = currentSsr <= minSsr * CLOSE_RATIO;
    ssrLabel.classList.toggle('is-close', isClose);
    readoutBox.classList.toggle('is-close', isClose);
    feedbackEl.classList.toggle('show', isClose);
  }

  function render() {
    draw();
    updateReadouts();
  }

  // ---------- 이벤트 ----------
  slopeInput.addEventListener('input', () => {
    m = parseFloat(slopeInput.value);
    updateValueLabels();
    render();
  });

  interceptInput.addEventListener('input', () => {
    b = parseFloat(interceptInput.value);
    updateValueLabels();
    render();
  });

  btnRegen.addEventListener('click', () => {
    showOptimal = false;
    btnOptimal.classList.remove('is-active');
    generateData();
    render();
  });

  btnReset.addEventListener('click', () => {
    showOptimal = false;
    btnOptimal.classList.remove('is-active');
    const ybar = points.reduce((s, p) => s + p.y, 0) / points.length;
    m = 0.3;
    b = ybar - m * (xDomain[0] + xDomain[1]) / 2;
    syncSlidersFromState();
    render();
  });

  btnOptimal.addEventListener('click', () => {
    showOptimal = !showOptimal;
    btnOptimal.classList.toggle('is-active', showOptimal);
    render();
  });

  window.addEventListener('resize', () => {
    render();
  });

  // ---------- 초기화 ----------
  generateData();
  render();
});
