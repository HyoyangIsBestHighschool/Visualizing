// 합성함수와 그 미분 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결합니다.

document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM 요소 가져오기
  const canvas = document.getElementById('composite-canvas');
  const ctx = canvas.getContext('2d');
  
  const paramX = document.getElementById('param-x');
  const valX = document.getElementById('val-x');
  const funcGSelect = document.getElementById('func-g');
  const funcFSelect = document.getElementById('func-f');
  
  const resG = document.getElementById('res-g');
  const resFg = document.getElementById('res-fg');

  // style.css에서 디자인 토큰 색상 추출 (비상시 폴백값 지정)
  const styleTokens = getComputedStyle(document.documentElement);
  const colorBg = styleTokens.getPropertyValue('--bg').trim() || '#0b1220';
  const colorBorder = styleTokens.getPropertyValue('--border').trim() || '#23324f';
  const colorInk = styleTokens.getPropertyValue('--ink').trim() || '#eaf0fb';
  const colorMuted = styleTokens.getPropertyValue('--ink-muted').trim() || '#8ca0c4';
  const colorMath = styleTokens.getPropertyValue('--accent-math').trim() || '#5eead4';
  const colorPhysics = styleTokens.getPropertyValue('--accent-physics').trim() || '#f2b84b';

  // 2. 수학 함수 사전 정의
  const functions = {
    sin: {
      fn: (x) => Math.sin(x),
      label: 'sin(x)'
    },
    linear: {
      fn: (x) => 0.5 * x + 0.3,
      label: '0.5x + 0.3'
    },
    quad: {
      fn: (x) => 0.5 * x * x - 0.5,
      label: '0.5x² - 0.5'
    },
    cubic: {
      fn: (x) => 0.3 * x * x * x - 0.2 * x,
      label: '0.3x³ - 0.2x'
    },
    cos: {
      fn: (x) => Math.cos(x),
      label: 'cos(x)'
    }
  };

  // 3. 레이아웃 분할 구조 정의 (3개의 좌표계 배치)
  // 해상도 대응을 위한 캔버스 사이즈 조정 함수
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    draw();
  }

  // 4. 메인 그리기 함수 (핵심 시각화)
  function draw() {
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    // 배경 청소
    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, width, height);

    // 현재 사용자 컨트롤 데이터 파악
    const xVal = parseFloat(paramX.value);
    const gKey = funcGSelect.value;
    const fKey = funcFSelect.value;

    const gFn = functions[gKey].fn;
    const fFn = functions[fKey].fn;

    const gVal = gFn(xVal);
    const fgVal = fFn(gVal);

    // 텍스트 수치 업데이트
    valX.textContent = xVal.toFixed(2);
    resG.textContent = gVal.toFixed(2);
    resFg.textContent = fgVal.toFixed(2);

    // 세 개의 화면 분할 경계면 크기 정의
    const pad = 45;
    const wSub = width / 2;
    const hSub = height / 2;

    // 각 분할 평면의 중심점 계산
    // 1) 좌측 하단: 속함수 g(x) 평면 (x축 정상, y축이 오른쪽 수평으로 90도 회전된 메커니즘을 투영면으로 설정)
    const centerG = { x: wSub / 2, y: hSub + hSub / 2 };
    // 2) 좌측 상단: 겉함수 f(u) 평면 (u = g(x)가 x축, y가 수직축)
    const centerF = { x: wSub / 2, y: hSub / 2 };
    // 3) 우측 상단: 최종 합성함수 f(g(x)) 평면 (x축 정상, y축 정상)
    const centerComp = { x: wSub + wSub / 2, y: hSub / 2 };

    // 스케일 인자 (1단위당 픽셀 크기)
    const scale = Math.min(wSub, hSub) / 5;

    // 구획 가이드 경계선 그리기
    ctx.strokeStyle = colorBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wSub, 0); ctx.lineTo(wSub, height);
    ctx.moveTo(0, hSub); ctx.lineTo(width, hSub);
    ctx.stroke();

    // 개별 좌표계 축 그리기 헬퍼 함수
    function drawAxis(center, labelX, labelY, rotateG = false) {
      ctx.strokeStyle = colorBorder;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = colorMuted;
      ctx.font = "11px 'IBM Plex Mono'";

      // X축
      ctx.beginPath();
      ctx.moveTo(center.x - scale * 2.2, center.y);
      ctx.lineTo(center.x + scale * 2.2, center.y);
      ctx.stroke();
      ctx.fillText(labelX, center.x + scale * 2.2 - 10, center.y - 6);

      // Y축
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - scale * 2.2);
      ctx.lineTo(center.x, center.y + scale * 2.2);
      ctx.stroke();
      ctx.fillText(labelY, center.x + 6, center.y - scale * 2.2 + 12);
    }

    // --- 1. 속함수 g(x) 그리기 (좌측 하단) ---
    // 요구사항: 속함수 y값이 겉함수의 x값이 되므로, g(x)의 결과축(y축)을 시계방향(오른쪽)으로 눕혀서 표현
    // 일반 변환: 화면 상 가로축이 x축, 세로축 아래방향이 g(x) 결과값이 되도록 설정하면 상단의 f(x) 축과 완벽 매핑
    drawAxis(centerG, "x", "g(x)");
    
    ctx.strokeStyle = colorMath;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = -2.2; px <= 2.2; px += 0.05) {
      const yValG = gFn(px);
      // 기하 투영: 가로축 = x축, 세로축 = g(x) 정방향 아래로 배치하여 위쪽 f(x)의 x축과 수직 정렬 유도
      const cx = centerG.x + px * scale;
      const cy = centerG.y + yValG * scale; // +가 아래쪽 방향
      if (px === -2.2) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // --- 2. 겉함수 f(x) 그리기 (좌측 상단) ---
    drawAxis(centerF, "g(x)", "f(g(x))");
    
    ctx.strokeStyle = colorMath;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = -2.2; px <= 2.2; px += 0.05) {
      const yValF = fFn(px);
      const cx = centerF.x + px * scale;
      const cy = centerF.y - yValF * scale; // -가 표준 수학 위쪽 방향
      if (px === -2.2) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // --- 3. 최종 합성함수 평면 그리기 (우측 상단) ---
    drawAxis(centerComp, "x", "y");
    
    ctx.strokeStyle = colorPhysics;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = -2.2; px <= 2.2; px += 0.05) {
      const yValComp = fFn(gFn(px));
      const cx = centerComp.x + px * scale;
      const cy = centerComp.y - yValComp * scale;
      if (px === -2.2) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // --- 4. 실시간 점 데이터 및 동적 추적 화살표 점선 연결 ---
    const ptGx = centerG.x + xVal * scale;
    const ptGy = centerG.y + gVal * scale;

    const ptFx = centerF.x + gVal * scale;
    const ptFy = centerF.y - fgVal * scale;

    const ptCompx = centerComp.x + xVal * scale;
    const ptCompy = centerComp.y - fgVal * scale;

    // 점선 속성 정의
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colorMuted;

    // 화살표 추적 경로 1: 속함수 입력 x축선 -> 속함수 그래프 위 교점
    ctx.beginPath();
    ctx.moveTo(ptGx, centerG.y);
    ctx.lineTo(ptGx, ptGy);
    ctx.stroke();

    // 화살표 추적 경로 2: 속함수의 결과값(y)이 겉함수의 입력값(x)으로 수직 상승 연결
    ctx.strokeStyle = colorMath;
    ctx.beginPath();
    ctx.moveTo(ptGx, ptGy);
    ctx.lineTo(ptFx, ptFy); // g(x) 좌표가 동일하므로 수직선 형성됨
    ctx.stroke();

    // 화살표 추적 경로 3: 겉함수의 결과값과 원본 x값이 만나 최종 합성함수 형성 (우측 수평 트레이싱)
    ctx.strokeStyle = colorPhysics;
    ctx.beginPath();
    ctx.moveTo(ptFx, ptFy);
    ctx.lineTo(ptCompx, ptCompy);
    ctx.stroke();

    ctx.strokeStyle = colorMuted;
    ctx.beginPath();
    ctx.moveTo(ptCompx, centerComp.y);
    ctx.lineTo(ptCompx, ptCompy);
    ctx.stroke();

    // 점선 초기화
    ctx.setLineDash([]);

    // 각 평면 위의 유기적인 점 마커 렌더링
    function drawMarker(x, y, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colorBg;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    drawMarker(ptGx, ptGy, colorMath);       // 속함수 위 추적점
    drawMarker(ptFx, ptFy, colorMath);       // 겉함수 위 추적점
    drawMarker(ptCompx, ptCompy, colorPhysics); // 최종 합성함수 위 완성점
  }

  // 5. 이벤트 리스너 바인딩
  paramX.addEventListener('input', draw);
  funcGSelect.addEventListener('change', draw);
  funcFSelect.addEventListener('change', draw);

  window.addEventListener('resize', resizeCanvas);

  // 초기 실행
  resizeCanvas();
});
