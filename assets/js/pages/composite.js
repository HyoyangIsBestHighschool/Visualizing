// 합성함수와 그 미분 시뮬레이션 로직
// #sim-stage 안에 시각화를, #sim-controls 안의 컨트롤에 이벤트를 연결합니다.

document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM 요소 가져오기
  const canvas = document.getElementById('composite-canvas');
  const ctx = canvas.getContext('2d');
  
  const paramX = document.getElementById('param-x');
  const valX = document.getElementById('val-x');
  const inputG = document.getElementById('input-g');
  const inputF = document.getElementById('input-f');
  const errorG = document.getElementById('error-g');
  const errorF = document.getElementById('error-f');
  
  const resG = document.getElementById('res-g');
  const resFg = document.getElementById('res-fg');

  // style.css에서 디자인 토큰 색상 추출
  const styleTokens = getComputedStyle(document.documentElement);
  const colorBg = styleTokens.getPropertyValue('--bg').trim() || '#0b1220';
  const colorBorder = styleTokens.getPropertyValue('--border').trim() || '#23324f';
  const colorInk = styleTokens.getPropertyValue('--ink').trim() || '#eaf0fb';
  const colorMuted = styleTokens.getPropertyValue('--ink-muted').trim() || '#8ca0c4';
  const colorMath = styleTokens.getPropertyValue('--accent-math').trim() || '#5eead4';
  const colorPhysics = styleTokens.getPropertyValue('--accent-physics').trim() || '#f2b84b';

  // 2. 텍스트 식 안전 파싱 함수 (인터프리터 로직)
  function parseExpression(str) {
    // 보안을 해치지 않고 편리한 변환을 위한 가공 처리
    let processed = str.toLowerCase()
      .replace(/(\d+)(x)/g, '$1*$2') // 2x -> 2*x 예외 처리
      .replace(/\^/g, '**')          // x^2 -> x**2 자바스크립트 거듭제곱 변환
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/abs/g, 'Math.abs')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/pow/g, 'Math.pow')
      .replace(/pi/g, 'Math.PI')
      .replace(/e/g, 'Math.E');

    // 변수 x를 받아 계산을 수행하는 함수 반환
    return new Function('x', `
      try {
        with (Math) {
          return ${processed};
        }
      } catch (e) {
        return NaN;
      }
    `);
  }

  // 초기 파싱 실행 전 홀더 설정
  let currentFnG = parseExpression(inputG.value);
  let currentFnF = parseExpression(inputF.value);

  // 3. 해상도 대응을 위한 캔버스 크기 제어
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    draw();
  }

  // 4. 메인 렌더링 그리기 함수
  function draw() {
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    // 배경 초기화
    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, width, height);

    const xVal = parseFloat(paramX.value);
    valX.textContent = xVal.toFixed(2);

    // 수식 안전 연산 수행
    let gVal = currentFnG(xVal);
    let fgVal = currentFnF(gVal);

    // 에러 발생 시(NaN) 연산 디스플레이 차단 안전장치
    if (isNaN(gVal)) gVal = 0;
    if (isNaN(fgVal)) fgVal = 0;

    resG.textContent = gVal.toFixed(2);
    resFg.textContent = fgVal.toFixed(2);

    // 화면 분할 레이아웃 정의
    const wSub = width / 2;
    const hSub = height / 2;

    // 각 공간 축 중심점 계산
    const centerG = { x: wSub / 2, y: hSub + hSub / 2 };     // 좌하: 속함수 g(x)
    const centerF = { x: wSub / 2, y: hSub / 2 };          // 좌상: 겉함수 f(x)
    const centerComp = { x: wSub + wSub / 2, y: hSub / 2 }; // 우상: 합성함수 (f o g)(x)

    // 스케일 축소/확대 비율
    const scale = Math.min(wSub, hSub) / 5;

    // 구획선 드로잉
    ctx.strokeStyle = colorBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wSub, 0); ctx.lineTo(wSub, height);
    ctx.moveTo(0, hSub); ctx.lineTo(width, hSub);
    ctx.stroke();

    // 개별 좌표 축 드로잉 함수
    function drawAxis(center, labelX, labelY) {
      ctx.strokeStyle = colorBorder;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = colorMuted;
      ctx.font = "11px 'IBM Plex Mono'";

      // X축
      ctx.beginPath();
      ctx.moveTo(center.x - scale * 2.2, center.y);
      ctx.lineTo(center.x + scale * 2.2, center.y);
      ctx.stroke();
      ctx.fillText(labelX, center.x + scale * 2.2 - 14, center.y - 6);

      // Y축
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - scale * 2.2);
      ctx.lineTo(center.x, center.y + scale * 2.2);
      ctx.stroke();
      ctx.fillText(labelY, center.x + 6, center.y - scale * 2.2 + 12);
    }

    // --- 1. 좌측 하단: 속함수 g(x) 그리기 ---
    drawAxis(centerG, "x", "g(x)");
    ctx.strokeStyle = colorMath;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let firstG = true;
    for (let px = -2.2; px <= 2.2; px += 0.04) {
      const yValG = currentFnG(px);
      if (!isNaN(yValG) && isFinite(yValG)) {
        const cx = centerG.x + px * scale;
        const cy = centerG.y + yValG * scale; // 치역이 오른쪽 f(x)의 정의역 매핑을 위해 아래 방향 회전 투영 유지
        if (firstG) { ctx.moveTo(cx, cy); firstG = false; }
        else ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();

    // --- 2. 좌측 상단: 겉함수 f(x) 그리기 (요청대로 f(x)로 축 이름 및 그래프 정상화) ---
    drawAxis(centerF, "g(x)", "f(x)");
    ctx.strokeStyle = colorMath;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let firstF = true;
    for (let px = -2.2; px <= 2.2; px += 0.04) {
      const yValF = currentFnF(px);
      if (!isNaN(yValF) && isFinite(yValF)) {
        const cx = centerF.x + px * scale;
        const cy = centerF.y - yValF * scale; // 표준 상향 축 표현
        if (firstF) { ctx.moveTo(cx, cy); firstF = false; }
        else ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();

    // --- 3. 우측 상단: 최종 합성함수 평면 그리기 (요청대로 세로축을 f(g(x))로 매핑) ---
    drawAxis(centerComp, "x", "f(g(x))");
    ctx.strokeStyle = colorPhysics;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let firstComp = true;
    for (let px = -2.2; px <= 2.2; px += 0.04) {
      const innerY = currentFnG(px);
      const yValComp = currentFnF(innerY);
      if (!isNaN(yValComp) && isFinite(yValComp)) {
        const cx = centerComp.x + px * scale;
        const cy = centerComp.y - yValComp * scale;
        if (firstComp) { ctx.moveTo(cx, cy); firstComp = false; }
        else ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();

    // --- 4. 실시간 점 및 가이드 점선 렌더링 ---
    const ptGx = centerG.x + xVal * scale;
    const ptGy = centerG.y + gVal * scale;

    const ptFx = centerF.x + gVal * scale;
    const ptFy = centerF.y - fgVal * scale;

    const ptCompx = centerComp.x + xVal * scale;
    const ptCompy = centerComp.y - fgVal * scale;

    // 수직 연결 가이드 점선 (속함수 교점 -> 겉함수 정의역 교점선 유지)
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colorMuted;

    ctx.beginPath();
    ctx.moveTo(ptGx, centerG.y);
    ctx.lineTo(ptGx, ptGy);
    ctx.stroke();

    ctx.strokeStyle = colorMath;
    ctx.beginPath();
    ctx.moveTo(ptGx, ptGy);
    ctx.lineTo(ptFx, ptFy);
    ctx.stroke();

    // 축으로 수사 내리는 단순 가이드선 (우측 합성함수 영역은 가로 연결 실선 제거)
    ctx.strokeStyle = colorMuted;
    ctx.beginPath();
    ctx.moveTo(ptCompx, centerComp.y);
    ctx.lineTo(ptCompx, ptCompy);
    ctx.stroke();

    ctx.setLineDash([]); // 대시 리셋

    // 점 마커 그리기 헬퍼
    function drawMarker(x, y, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colorBg;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 각각의 평면 위 점 이동은 그대로 작동
    if (!isNaN(gVal)) drawMarker(ptGx, ptGy, colorMath);
    if (!isNaN(fgVal)) {
      drawMarker(ptFx, ptFy, colorMath);
      drawMarker(ptCompx, ptCompy, colorPhysics);
    }
  }

  // 5. 사용자가 실시간 수식 입력 시 예외 처리 및 이벤트 리스너 연동
  inputG.addEventListener('input', () => {
    try {
      const testFn = parseExpression(inputG.value);
      if (isNaN(testFn(0)) && isNaN(testFn(1))) throw new Error(); // 간단 검증
      currentFnG = testFn;
      errorG.style.display = 'none';
    } catch (e) {
      errorG.style.display = 'block'; // 오류 문구 출력
    }
    draw();
  });

  inputF.addEventListener('input', () => {
    try {
      const testFn = parseExpression(inputF.value);
      if (isNaN(testFn(0)) && isNaN(testFn(1))) throw new Error();
      currentFnF = testFn;
      errorF.style.display = 'none';
    } catch (e) {
      errorF.style.display = 'block';
    }
    draw();
  });

  paramX.addEventListener('input', draw);
  window.addEventListener('resize', resizeCanvas);

  // 초기 실행
  resizeCanvas();
});
