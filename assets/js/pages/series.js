// 급수와 정적분의 관계 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결하세요.
// 이 파일이 이 시뮬레이션의 담당 영역입니다.

document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------
  // 1. 예시 함수 3가지 (도메인은 모두 값이 양수가 되도록 설정)
  // ---------------------------------------------------------------
  const FUNCTIONS = {
    cubic: {
      label: '삼차함수',
      domain: [0, 7],
      f: (x) => 0.05 * x ** 3 - 0.4 * x ** 2 + x + 3,
      exact: () => {
        const F = (x) => 0.0125 * x ** 4 - (0.4 / 3) * x ** 3 + 0.5 * x ** 2 + 3 * x;
        return F(7) - F(0);
      },
      formula: 'f(x) = 0.05x³ − 0.4x² + x + 3',
    },
    exp: {
      label: '지수함수',
      domain: [0, 5],
      f: (x) => 0.6 * Math.exp(0.4 * x),
      exact: () => {
        const F = (x) => 1.5 * Math.exp(0.4 * x);
        return F(5) - F(0);
      },
      formula: 'f(x) = 0.6 · e^(0.4x)',
    },
    trig: {
      label: '삼각함수',
      domain: [0, 2 * Math.PI],
      f: (x) => 2 * Math.sin(x) + 3,
      exact: () => {
        const F = (x) => -2 * Math.cos(x) + 3 * x;
        return F(2 * Math.PI) - F(0);
      },
      formula: 'f(x) = 2sin(x) + 3',
    },
  };

  const SUM_LABEL = { left: '왼쪽 합', mid: '중점 합', right: '오른쪽 합' };

  // ---------------------------------------------------------------
  // 2. DOM 참조
  // ---------------------------------------------------------------
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');
  const stageEl = document.getElementById('sim-stage');

  const nSlider = document.getElementById('nSlider');
  const nValueEl = document.getElementById('nValue');
  const fnButtons = document.querySelectorAll('[data-fn]');
  const sumButtons = document.querySelectorAll('[data-sum]');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const currentFormulaEl = document.getElementById('currentFormula');

  // ---------------------------------------------------------------
  // 3. 상태
  // ---------------------------------------------------------------
  const DEFAULT_N = 4;
  const MAX_N = 200;

  const state = {
    fnKey: 'cubic',
    n: DEFAULT_N,
    sumType: 'mid',
    playing: false,
    timer: null,
  };

  // style.css의 CSS 변수 값을 그대로 읽어 캔버스에서 재사용합니다.
  // (캔버스는 CSS var()를 직접 해석하지 못하므로 값만 가져와 씁니다.)
  const rootStyles = getComputedStyle(document.documentElement);
  const COLORS = {
    accent: rootStyles.getPropertyValue('--accent-math').trim() || '#5eead4',
    ink: rootStyles.getPropertyValue('--ink').trim() || '#eaf0fb',
    inkMuted: rootStyles.getPropertyValue('--ink-muted').trim() || '#8ca0c4',
    border: rootStyles.getPropertyValue('--border').trim() || '#23324f',
  };

  // ---------------------------------------------------------------
  // 4. 캔버스 크기 대응 (반응형 + 고해상도 대응)
  // ---------------------------------------------------------------
  function resizeCanvas() {
    const rect = stageEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssHeight = rect.width * (3 / 4); // 4:3 비율 유지
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // ---------------------------------------------------------------
  // 5. 리만 합 계산
  // ---------------------------------------------------------------
  function riemannSum(cfg, n, sumType) {
    const [a, b] = cfg.domain;
    const dx = (b - a) / n;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * dx;
      let evalX;
      if (sumType === 'left') evalX = x0;
      else if (sumType === 'right') evalX = x0 + dx;
      else evalX = x0 + dx / 2;
      sum += cfg.f(evalX) * dx;
    }
    return sum;
  }

  // ---------------------------------------------------------------
  // 6. 그리기
  // ---------------------------------------------------------------
  function draw() {
    const cfg = FUNCTIONS[state.fnKey];
    const [a, b] = cfg.domain;
    const n = state.n;
    const dx = (b - a) / n;

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    ctx.clearRect(0, 0, cssW, cssH);

    // y 범위 계산 (0을 기준선으로, 살짝 여유를 둠)
    let yMax = 0;
    const SAMPLES = 200;
    for (let i = 0; i <= SAMPLES; i++) {
      const x = a + ((b - a) * i) / SAMPLES;
      yMax = Math.max(yMax, cfg.f(x));
    }
    yMax *= 1.15;

    const pad = { left: 46, right: 16, top: 16, bottom: 34 };
    const plotW = cssW - pad.left - pad.right;
    const plotH = cssH - pad.top - pad.bottom;

    const xScale = (x) => pad.left + ((x - a) / (b - a)) * plotW;
    const yScale = (y) => pad.top + (1 - y / yMax) * plotH;

    // 축
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yScale(0));
    ctx.lineTo(pad.left + plotW, yScale(0));
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.stroke();

    // x축 눈금
    ctx.fillStyle = COLORS.inkMuted;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    const TICKS = 5;
    for (let i = 0; i <= TICKS; i++) {
      const x = a + ((b - a) * i) / TICKS;
      const px = xScale(x);
      ctx.beginPath();
      ctx.moveTo(px, yScale(0));
      ctx.lineTo(px, yScale(0) + 4);
      ctx.stroke();
      ctx.fillText(x.toFixed(1), px, yScale(0) + 15);
    }
    // y축 눈금
    ctx.textAlign = 'right';
    for (let i = 0; i <= TICKS; i++) {
      const y = (yMax * i) / TICKS;
      const py = yScale(y);
      ctx.beginPath();
      ctx.moveTo(pad.left - 4, py);
      ctx.lineTo(pad.left, py);
      ctx.stroke();
      ctx.fillText(y.toFixed(1), pad.left - 8, py + 3);
    }

    // 리만 합 직사각형
    ctx.fillStyle = hexToRgba(COLORS.accent, 0.22);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * dx;
      const x1 = x0 + dx;
      let evalX;
      if (state.sumType === 'left') evalX = x0;
      else if (state.sumType === 'right') evalX = x0 + dx;
      else evalX = x0 + dx / 2;
      const h = cfg.f(evalX);

      const px0 = xScale(x0);
      const px1 = xScale(x1);
      const py0 = yScale(0);
      const py1 = yScale(h);

      ctx.fillRect(px0, py1, px1 - px0, py0 - py1);
      ctx.strokeRect(px0, py1, px1 - px0, py0 - py1);
    }

    // 함수 곡선
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = a + ((b - a) * i) / SAMPLES;
      const px = xScale(x);
      const py = yScale(cfg.f(x));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 통계 텍스트
    const sum = riemannSum(cfg, n, state.sumType);
    const exact = cfg.exact();
    const err = Math.abs(exact - sum);
    const errPct = exact !== 0 ? (err / Math.abs(exact)) * 100 : 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px "IBM Plex Mono", ui-monospace, monospace';
    const lines = [
      `n = ${n}  (${SUM_LABEL[state.sumType]})`,
      `리만 합 ≈ ${sum.toFixed(4)}`,
      `정적분 값 = ${exact.toFixed(4)}`,
      `오차 ≈ ${err.toFixed(4)} (${errPct.toFixed(2)}%)`,
    ];
    const boxX = pad.left + plotW - 190;
    const boxY = pad.top + 8;
    ctx.fillStyle = 'rgba(11, 18, 32, 0.72)';
    ctx.fillRect(boxX - 8, boxY - 4, 198, lines.length * 16 + 8);
    ctx.fillStyle = COLORS.ink;
    lines.forEach((line, i) => {
      ctx.fillText(line, boxX, boxY + (i + 1) * 15 - 3);
    });
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ---------------------------------------------------------------
  // 7. 컨트롤 이벤트
  // ---------------------------------------------------------------
  function setActive(buttons, attr, value) {
    buttons.forEach((btn) => {
      const isActive = btn.dataset[attr] === value;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  fnButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.fnKey = btn.dataset.fn;
      setActive(fnButtons, 'fn', state.fnKey);
      currentFormulaEl.textContent = FUNCTIONS[state.fnKey].formula;
      draw();
    });
  });

  sumButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sumType = btn.dataset.sum;
      setActive(sumButtons, 'sum', state.sumType);
      draw();
    });
  });

  nSlider.addEventListener('input', () => {
    stopAnimation();
    state.n = Number(nSlider.value);
    nValueEl.textContent = state.n;
    draw();
  });

  function stopAnimation() {
    state.playing = false;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  playBtn.addEventListener('click', () => {
    if (state.playing) return;
    state.playing = true;
    state.timer = setInterval(() => {
      const step = Math.max(1, Math.round(state.n * 0.08));
      state.n = Math.min(MAX_N, state.n + step);
      nSlider.value = state.n;
      nValueEl.textContent = state.n;
      draw();
      if (state.n >= MAX_N) {
        stopAnimation();
      }
    }, 140);
  });

  pauseBtn.addEventListener('click', stopAnimation);

  resetBtn.addEventListener('click', () => {
    stopAnimation();
    state.fnKey = 'cubic';
    state.n = DEFAULT_N;
    state.sumType = 'mid';

    setActive(fnButtons, 'fn', state.fnKey);
    setActive(sumButtons, 'sum', state.sumType);
    nSlider.value = state.n;
    nValueEl.textContent = state.n;
    currentFormulaEl.textContent = FUNCTIONS[state.fnKey].formula;
    draw();
  });

  // ---------------------------------------------------------------
  // 8. 초기화
  // ---------------------------------------------------------------
  window.addEventListener('resize', resizeCanvas);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resizeCanvas);
  }

  resizeCanvas();
});
