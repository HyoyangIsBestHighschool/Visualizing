// 간섭과 회절 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결합니다.
// 이 파일이 이 시뮬레이션의 담당 영역입니다.

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------------------------------
  // 0. style.css에 이미 정의된 색상 토큰을 그대로 읽어와 재사용합니다.
  //    (새 색상 값을 만들지 않고, :root 변수 값을 그대로 가져옵니다)
  // ------------------------------------------------------------
  const rootStyle = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) => (rootStyle.getPropertyValue(name).trim() || fallback);

  const COLOR_ACCENT = cssVar('--accent-physics', '#f2b84b');
  const COLOR_ACCENT_DIM = cssVar('--accent-physics-dim', '#8a6a2c');
  const COLOR_INK = cssVar('--ink', '#eaf0fb');
  const COLOR_INK_MUTED = cssVar('--ink-muted', '#8ca0c4');
  const COLOR_BORDER = cssVar('--border', '#23324f');
  const FONT_MONO = "12px 'IBM Plex Mono', ui-monospace, monospace";

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }
  const RGB_ACCENT = hexToRgb(COLOR_ACCENT);
  const RGB_ACCENT_DIM = hexToRgb(COLOR_ACCENT_DIM);

  function rgba(rgb, alpha) {
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  // ------------------------------------------------------------
  // 1. 상태(State) — 각 화면(scene)마다 파동 파라미터와 재생 상태를 관리
  // ------------------------------------------------------------
  const state = {
    interference: {
      playing: false,
      time: 0,
      wave1: { amplitude: 5, period: 5, frequency: 1, phase: 0 },
      wave2: { amplitude: 5, period: 5, frequency: 1, phase: 0 }
    },
    diffraction: {
      playing: false,
      time: 0,
      wave1: { amplitude: 5, period: 5, frequency: 1 },
      width: 5
    },
    combined: {
      playing: false,
      time: 0,
      wave1: { amplitude: 5, period: 5, frequency: 1, phase: 0 },
      wave2: { amplitude: 5, period: 5, frequency: 1, phase: 0 },
      width: 5
    }
  };

  // 슬라이더 값 → 실제 파형 계산에 쓸 공간적 파장(px) 변환
  // period(0~10) → 20px ~ 420px 사이의 공간 파장으로 매핑
  function spatialWavelength(period) {
    return 20 + period * 40;
  }

  // ------------------------------------------------------------
  // 2. 캔버스 컨텍스트
  // ------------------------------------------------------------
  const interferenceCanvas = document.getElementById('interferenceCanvas');
  const diffractionCanvas = document.getElementById('diffractionCanvas');
  const combinedCanvas = document.getElementById('combinedCanvas');

  const ctxInterference = interferenceCanvas ? interferenceCanvas.getContext('2d') : null;
  const ctxDiffraction = diffractionCanvas ? diffractionCanvas.getContext('2d') : null;
  const ctxCombined = combinedCanvas ? combinedCanvas.getContext('2d') : null;

  // ------------------------------------------------------------
  // 3. 탭 전환
  // ------------------------------------------------------------
  const tabs = document.querySelectorAll('.sim-tab');
  const scenes = document.querySelectorAll('.sim-scene');
  const panels = document.querySelectorAll('.control-panel-group');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      scenes.forEach((s) => { s.hidden = s.dataset.scene !== target; });
      panels.forEach((p) => { p.classList.toggle('active', p.dataset.panel === target); });

      render(target);
    });
  });

  // ------------------------------------------------------------
  // 4. 슬라이더 바인딩
  // ------------------------------------------------------------
  document.querySelectorAll('.wave-slider').forEach((slider) => {
    const { scene, wave, param } = slider.dataset;
    const valueEl = document.getElementById(`val-${scene}-${wave || 'slit'}-${param}`);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      if (wave) {
        state[scene][wave][param] = value;
      } else {
        state[scene][param] = value;
      }
      if (valueEl) valueEl.textContent = value.toFixed(1);
      render(scene);
    });
  });

  // ------------------------------------------------------------
  // 5. 버튼 바인딩 (재생 / 일시정지 / 반대위상 / 초기화)
  // ------------------------------------------------------------
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { action, scene, wave } = btn.dataset;
      const s = state[scene];

      if (action === 'play') {
        s.playing = true;
      } else if (action === 'pause') {
        s.playing = false;
      } else if (action === 'phase') {
        const w = s[wave];
        w.phase = w.phase === 0 ? Math.PI : 0;
        btn.classList.toggle('active', w.phase !== 0);
        render(scene);
      } else if (action === 'reset') {
        s.time = 0;
        if (s.wave1) s.wave1.phase = 0;
        if (s.wave2) s.wave2.phase = 0;
        document.querySelectorAll(`.phase-toggle-btn[data-scene="${scene}"]`)
          .forEach((b) => b.classList.remove('active'));
        render(scene);
      }
    });
  });

  // ------------------------------------------------------------
  // 6. 간섭 화면 렌더링 — 파동1 / 파동2 / 합성파(위 아래로 배치)
  // ------------------------------------------------------------
  function drawInterference() {
    if (!ctxInterference) return;
    const ctx = ctxInterference;
    const W = interferenceCanvas.width;
    const H = interferenceCanvas.height;
    const s = state.interference;

    ctx.clearRect(0, 0, W, H);

    const bandY = [H * 0.18, H * 0.5, H * 0.82];
    const bandHeight = H * 0.26;

    // 기준선
    ctx.strokeStyle = COLOR_BORDER;
    ctx.setLineDash([4, 4]);
    bandY.forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    function waveY(x, wave) {
      const k = (2 * Math.PI) / spatialWavelength(wave.period);
      const w = 2 * Math.PI * wave.frequency;
      const amp = wave.amplitude * (bandHeight / 2 / 10) * 2; // 0~10 진폭을 픽셀로 변환
      return amp * Math.sin(k * x - w * s.time + wave.phase);
    }

    function drawTrace(baseY, colorRgba, fn) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const y = baseY + fn(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colorRgba;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawTrace(bandY[0], rgba(RGB_ACCENT, 1), (x) => waveY(x, s.wave1));
    drawTrace(bandY[1], rgba(RGB_ACCENT_DIM, 1), (x) => waveY(x, s.wave2));
    drawTrace(bandY[2], COLOR_INK, (x) => waveY(x, s.wave1) + waveY(x, s.wave2));

    // 범례
    ctx.font = FONT_MONO;
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(RGB_ACCENT, 1);
    ctx.fillText('파동 1', 8, bandY[0] - bandHeight / 2 - 14);
    ctx.fillStyle = rgba(RGB_ACCENT_DIM, 1);
    ctx.fillText('파동 2', 8, bandY[1] - bandHeight / 2 - 14);
    ctx.fillStyle = COLOR_INK;
    ctx.fillText('합성파', 8, bandY[2] - bandHeight / 2 - 14);

    // 현재 위상 관계 판정 (합성파 라벨 옆에 표시)
    const k1 = (2 * Math.PI) / spatialWavelength(s.wave1.period);
    const k2 = (2 * Math.PI) / spatialWavelength(s.wave2.period);
    const w1 = 2 * Math.PI * s.wave1.frequency;
    const w2 = 2 * Math.PI * s.wave2.frequency;
    const xRef = W / 2;
    let diff = ((k1 * xRef - w1 * s.time + s.wave1.phase) - (k2 * xRef - w2 * s.time + s.wave2.phase));
    diff = ((diff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    let label = '부분 간섭';
    if (diff < 0.35 || diff > 2 * Math.PI - 0.35) label = '보강 간섭';
    else if (Math.abs(diff - Math.PI) < 0.35) label = '상쇄 간섭';

    ctx.fillStyle = COLOR_INK_MUTED;
    ctx.fillText(`중앙 지점 상태: ${label}`, W - 190, bandY[2] - bandHeight / 2 - 14);
  }

  // ------------------------------------------------------------
  // 7. 회절 화면 렌더링 — 하위엔스 원리로 단일 슬릿 회절 근사
  // ------------------------------------------------------------
  function drawDiffraction() {
    if (!ctxDiffraction) return;
    const ctx = ctxDiffraction;
    const W = diffractionCanvas.width;
    const H = diffractionCanvas.height;
    const s = state.diffraction;

    ctx.clearRect(0, 0, W, H);

    const barrierX = 190;
    const centerY = H / 2;
    const gapHeight = 15 + s.width * 14; // 0~10 → 15~155px
    const gapTop = centerY - gapHeight / 2;
    const gapBottom = centerY + gapHeight / 2;

    const wavelength = spatialWavelength(s.wave1.period);
    const k = (2 * Math.PI) / wavelength;
    const w = 2 * Math.PI * s.wave1.frequency;
    const amp = Math.max(s.wave1.amplitude, 0.05);

    // 입사 평면파 (barrier 왼쪽): 세로줄로 표현
    const cell = 6;
    for (let x = 0; x < barrierX; x += cell) {
      const v = amp * Math.sin(k * x - w * s.time);
      const alpha = Math.min(1, Math.abs(v) / amp) * 0.85;
      ctx.fillStyle = v > 0 ? rgba(RGB_ACCENT, alpha) : rgba(RGB_ACCENT_DIM, alpha);
      ctx.fillRect(x, 0, cell, H);
    }

    // 슬릿 안의 점파원들 (하위엔스 보조 파원)
    const sourceCount = 10;
    const sources = [];
    for (let i = 0; i < sourceCount; i++) {
      const t = sourceCount === 1 ? 0.5 : i / (sourceCount - 1);
      sources.push(gapTop + t * gapHeight);
    }

    // barrier 오른쪽: 하위엔스 합성 파동장
    for (let x = barrierX; x < W; x += cell) {
      for (let y = 0; y < H; y += cell) {
        let sum = 0;
        for (const sy of sources) {
          const dx = x - barrierX;
          const dy = y - sy;
          const r = Math.max(Math.sqrt(dx * dx + dy * dy), 5);
          sum += Math.sin(k * r - w * s.time) / Math.sqrt(r / 40 + 1);
        }
        const value = (amp * sum) / sourceCount;
        const alpha = Math.min(1, Math.abs(value) / amp) * 0.85;
        if (alpha < 0.04) continue;
        ctx.fillStyle = value > 0 ? rgba(RGB_ACCENT, alpha) : rgba(RGB_ACCENT_DIM, alpha);
        ctx.fillRect(x, y, cell, cell);
      }
    }

    // 장벽(barrier) 그리기
    ctx.fillStyle = COLOR_BORDER;
    ctx.fillRect(barrierX - 4, 0, 8, gapTop);
    ctx.fillRect(barrierX - 4, gapBottom, 8, H - gapBottom);

    ctx.font = FONT_MONO;
    ctx.fillStyle = COLOR_INK_MUTED;
    ctx.textBaseline = 'top';
    ctx.fillText('틈(슬릿)', barrierX - 26, gapTop - 16);
  }

  // ------------------------------------------------------------
  // 8. 간섭 + 회절 동시 화면 렌더링 — 이중 슬릿(더블 슬릿) 근사
  // ------------------------------------------------------------
  function drawCombined() {
    if (!ctxCombined) return;
    const ctx = ctxCombined;
    const W = combinedCanvas.width;
    const H = combinedCanvas.height;
    const s = state.combined;

    ctx.clearRect(0, 0, W, H);

    const barrierX = 190;
    const slitCenterA = H * 0.33;
    const slitCenterB = H * 0.67;
    const gapHeight = 12 + s.width * 8; // 0~10 → 12~92px

    function slitRange(center) {
      return [center - gapHeight / 2, center + gapHeight / 2];
    }
    const [aTop, aBottom] = slitRange(slitCenterA);
    const [bTop, bBottom] = slitRange(slitCenterB);

    function makeSources(top, bottom, count) {
      const arr = [];
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        arr.push(top + t * (bottom - top));
      }
      return arr;
    }

    const sourceCount = 7;
    const sourcesA = makeSources(aTop, aBottom, sourceCount);
    const sourcesB = makeSources(bTop, bBottom, sourceCount);

    function waveField(wave) {
      const wavelength = spatialWavelength(wave.period);
      return {
        k: (2 * Math.PI) / wavelength,
        w: 2 * Math.PI * wave.frequency,
        amp: Math.max(wave.amplitude, 0.05),
        phase: wave.phase
      };
    }
    const fA = waveField(s.wave1);
    const fB = waveField(s.wave2);

    const cell = 6;
    for (let x = barrierX; x < W; x += cell) {
      for (let y = 0; y < H; y += cell) {
        let sum = 0;

        for (const sy of sourcesA) {
          const dx = x - barrierX;
          const dy = y - sy;
          const r = Math.max(Math.sqrt(dx * dx + dy * dy), 5);
          sum += (fA.amp * Math.sin(fA.k * r - fA.w * s.time + fA.phase)) / Math.sqrt(r / 40 + 1) / sourceCount;
        }
        for (const sy of sourcesB) {
          const dx = x - barrierX;
          const dy = y - sy;
          const r = Math.max(Math.sqrt(dx * dx + dy * dy), 5);
          sum += (fB.amp * Math.sin(fB.k * r - fB.w * s.time + fB.phase)) / Math.sqrt(r / 40 + 1) / sourceCount;
        }

        const maxAmp = Math.max(fA.amp, fB.amp, 0.05);
        const alpha = Math.min(1, Math.abs(sum) / maxAmp) * 0.9;
        if (alpha < 0.04) continue;
        ctx.fillStyle = sum > 0 ? rgba(RGB_ACCENT, alpha) : rgba(RGB_ACCENT_DIM, alpha);
        ctx.fillRect(x, y, cell, cell);
      }
    }

    // 입사파 (barrier 왼쪽) — 두 파동 중 파동1 기준으로 단순 표시
    for (let x = 0; x < barrierX; x += cell) {
      const v = fA.amp * Math.sin(fA.k * x - fA.w * s.time + fA.phase);
      const alpha = Math.min(1, Math.abs(v) / fA.amp) * 0.6;
      ctx.fillStyle = v > 0 ? rgba(RGB_ACCENT, alpha) : rgba(RGB_ACCENT_DIM, alpha);
      ctx.fillRect(x, 0, cell, H);
    }

    // 장벽 + 두 슬릿
    ctx.fillStyle = COLOR_BORDER;
    ctx.fillRect(barrierX - 4, 0, 8, aTop);
    ctx.fillRect(barrierX - 4, aBottom, 8, bTop - aBottom);
    ctx.fillRect(barrierX - 4, bBottom, 8, H - bBottom);

    ctx.font = FONT_MONO;
    ctx.fillStyle = COLOR_INK_MUTED;
    ctx.textBaseline = 'top';
    ctx.fillText('틈 A', barrierX - 16, aTop - 16);
    ctx.fillText('틈 B', barrierX - 16, bTop - 16);
  }

  // ------------------------------------------------------------
  // 9. 렌더 디스패치 + 애니메이션 루프
  // ------------------------------------------------------------
  function render(scene) {
    if (scene === 'interference') drawInterference();
    else if (scene === 'diffraction') drawDiffraction();
    else if (scene === 'combined') drawCombined();
  }

  let lastTs = 0;
  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;

    ['interference', 'diffraction', 'combined'].forEach((scene) => {
      if (state[scene].playing) {
        state[scene].time += dt;
        render(scene);
      }
    });

    requestAnimationFrame(loop);
  }

  // 초기 화면 그리기 (재생 전에도 정적 파형이 보이도록)
  render('interference');
  render('diffraction');
  render('combined');

  requestAnimationFrame(loop);
});
