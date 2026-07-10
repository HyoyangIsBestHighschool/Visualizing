// 굴절과 스넬의 법칙 시뮬레이션 로직
document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM 원소 탐색
  const canvas = document.getElementById('refractCanvas');
  const ctx = canvas.getContext('2d');
  
  const waveButtons = {
    light: document.getElementById('btn-wave-light'),
    sound: document.getElementById('btn-wave-sound'),
    water: document.getElementById('btn-wave-water')
  };
  
  const sliderAngle = document.getElementById('slider-incident-angle');
  const txtAngle1Display = document.getElementById('txt-angle1-display');
  
  // 제어 버튼
  const btnPlay = document.getElementById('btn-sim-play');
  const btnPause = document.getElementById('btn-sim-pause');
  const btnReset = document.getElementById('btn-sim-reset');
  
  // 실시간 수식 및 계측 데이터 DOM
  const dataN1 = document.getElementById('data-n1');
  const dataN2 = document.getElementById('data-n2');
  const dataTheta1 = document.getElementById('data-theta1');
  const dataTheta2 = document.getElementById('data-theta2');
  const dataThetac = document.getElementById('data-thetac');
  const dataThetar = document.getElementById('data-thetar');
  const systemStatus = document.getElementById('system-status');
  const formulaDynamicView = document.getElementById('formula-dynamic-view');

  // 고체 서브 레이아웃 DOM
  const m1SolidDetail = document.getElementById('m1-solid-detail');
  const m2SolidDetail = document.getElementById('m2-solid-detail');

  // 2. 물리 및 환경 상태 변수 설정
  let currentWaveType = 'light'; 
  let activeM1Type = 'gas';      
  let activeM2Type = 'liquid';   
  
  let isPlaying = true;
  let waveOffset = 0;            
  let animId = null;

  // 파동 특성별 물질 고유 굴절률 정보 테이블 정의
  const refractiveIndexTable = {
    light: { vacuum: 1.0, gas: 1.0003, liquid: 1.333, ice: 1.31, glass: 1.52, diamond: 2.42 },
    sound: { vacuum: 1.0, gas: 1.0, liquid: 0.23, ice: 0.09, glass: 0.06, diamond: 0.03 }, 
    water: { vacuum: 1.0, gas: 1.0, liquid: 1.333, ice: 1.55, glass: 1.75, diamond: 2.10 }
  };

  const labelsTable = {
    vacuum: '진공', gas: '기체 (공기)', liquid: '액체 (증류수)',
    ice: '고체 (얼음)', glass: '고체 (유리)', diamond: '고체 (다이아몬드)'
  };

  // 3. 캔버스 리사이즈 처리
  function resize() {
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientWidth * (3 / 4);
  }
  resize();
  window.addEventListener('resize', resize);

  // 4. 실시간 수식 연산 및 측정 텍스트 데이터 갱신 함수
  function calculatePhysics() {
    const isM1Blocked = (activeM1Type === 'vacuum' && (currentWaveType === 'sound' || currentWaveType === 'water'));
    const isM2Blocked = (activeM2Type === 'vacuum' && (currentWaveType === 'sound' || currentWaveType === 'water'));
    const isBlocked = isM1Blocked || isM2Blocked;

    const n1 = refractiveIndexTable[currentWaveType][activeM1Type];
    const n2 = refractiveIndexTable[currentWaveType][activeM2Type];
    
    const theta1Deg = parseFloat(sliderAngle.value);
    const theta1Rad = (theta1Deg * Math.PI) / 180;
    
    txtAngle1Display.textContent = theta1Deg;

    // 1) 소리 및 물결파의 진공 상태 특수 예외 차단 구문
    if (isBlocked) {
      dataN1.textContent = activeM1Type === 'vacuum' ? '차단(진공)' : n1.toFixed(4);
      dataN2.textContent = activeM2Type === 'vacuum' ? '차단(진공)' : n2.toFixed(4);
      dataTheta1.textContent = theta1Deg.toFixed(1) + '°';
      dataTheta2.textContent = 'N/A';
      dataThetac.textContent = 'N/A';
      dataThetar.textContent = 'N/A';
      
      const waveName = currentWaveType === 'sound' ? '소리(음파)' : '물결파';
      systemStatus.textContent = `상태: 매질 단절로 인해 ${waveName}가 전파되지 못합니다.`;
      formulaDynamicView.innerHTML = `<div><span class="formula-highlight">[매질 단절]</span> ${waveName}는 매질이 없는 진공 공간을 통과할 수 없어 수식 연산이 불가능합니다.</div>`;
      
      return { n1, n2, theta1Deg, theta2Deg: null, isTIR: false, isBlocked: true, isM1Blocked, isM2Blocked };
    }

    // 2) 정상적인 파동 연산 처리
    dataN1.textContent = n1.toFixed(4);
    dataN2.textContent = n2.toFixed(4);
    dataTheta1.textContent = theta1Deg.toFixed(1) + '°';

    let criticalAngle = null;
    let theta2Deg = null;
    let isTIR = false; 

    if (n1 > n2) {
      const sinTc = n2 / n1;
      if (sinTc <= 1.0) {
        criticalAngle = (Math.asin(sinTc) * 180) / Math.PI;
        dataThetac.textContent = criticalAngle.toFixed(1) + '°';
      }
    } else {
      dataThetac.textContent = '없음';
    }

    const sinTheta2 = (n1 * Math.sin(theta1Rad)) / n2;

    if (sinTheta2 > 1.0001) {
      isTIR = true;
      dataTheta2.textContent = '없음 (전반사)';
      dataThetar.textContent = theta1Deg.toFixed(1) + '°';
      systemStatus.textContent = `상태: 전반사 발생 (임계각: ${criticalAngle.toFixed(1)}° 미만 필요)`;
      
      const leftVal = (n1 * Math.sin(theta1Rad)).toFixed(4);
      formulaDynamicView.innerHTML = `
        <div><strong>매질1(좌변):</strong> ${n1.toFixed(3)} × sin(${theta1Deg}°) = <span class="formula-highlight">${leftVal}</span></div>
        <div><strong>매질2(우변):</strong> n₂·sin(θ₂) 값 산출 불가능 (<span class="formula-highlight">전반사 조건</span>)</div>
        <div>결과: 투과 광선 없이 100% 반사각 <span class="formula-highlight">${theta1Deg}°</span>로 전반사됩니다.</div>
      `;
    } else {
      const clampedSin = Math.min(Math.max(sinTheta2, -1), 1);
      const theta2Rad = Math.asin(clampedSin);
      theta2Deg = (theta2Rad * 180) / Math.PI;
      dataTheta2.textContent = theta2Deg.toFixed(1) + '°';
      dataThetar.textContent = '없음';
      
      if (theta1Deg === 90) {
        systemStatus.textContent = '상태: 경계 표면과 수평으로 진행 (표면 스침 입사)';
      } else {
        systemStatus.textContent = '상태: 정상 굴절 투과 중';
      }

      const leftVal = (n1 * Math.sin(theta1Rad)).toFixed(4);
      const rightVal = (n2 * Math.sin(theta2Rad)).toFixed(4);
      formulaDynamicView.innerHTML = `
        <div><strong>매질1(좌변):</strong> ${n1.toFixed(3)} × sin(${theta1Deg}°) = ${n1.toFixed(3)} × ${Math.sin(theta1Rad).toFixed(3)} = <span class="formula-highlight">${leftVal}</span></div>
        <div><strong>매질2(우변):</strong> ${n2.toFixed(3)} × sin(${theta2Deg.toFixed(1)}°) = ${n2.toFixed(3)} × ${Math.sin(theta2Rad).toFixed(3)} = <span class="formula-highlight">${rightVal}</span></div>
        <div>결과: 좌변과 우변의 실제 연산 스케일이 <span class="formula-highlight">일치</span>합니다.</div>
      `;
    }

    return { n1, n2, theta1Deg, theta2Deg, isTIR, isBlocked: false, isM1Blocked: false, isM2Blocked: false };
  }

  // 5. 시각화 애니메이션 프레임 루프
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const rayLength = Math.min(canvas.width, canvas.height) * 0.42;

    const phys = calculatePhysics();

    // 상단 매질 (매질 1) 색상 채우기
    ctx.fillStyle = '#111a2e';
    ctx.fillRect(0, 0, canvas.width, cy);

    // 하단 매질 (매질 2) 색상 채우기
    if (activeM2Type === 'vacuum') {
      ctx.fillStyle = '#050912';
    } else {
      const densityEffect = Math.min(Math.max((refractiveIndexTable.light[activeM2Type] - 0.9) * 45, 10), 85);
      ctx.fillStyle = `rgb(16, ${28 + densityEffect}, ${50 + densityEffect})`;
    }
    ctx.fillRect(0, cy, canvas.width, canvas.height - cy);

    // 가로 매질 경계선과 세로 기준 법선 드로잉
    ctx.strokeStyle = '#23324f';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();

    ctx.strokeStyle = '#8ca0c4';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
    ctx.setLineDash([]); 

    // 상단/하단 텍스트 정보 마킹
    ctx.fillStyle = '#8ca0c4';
    ctx.font = '11px var(--font-mono)';
    ctx.fillText(`상단 매질1: ${labelsTable[activeM1Type]}`, 15, 25);
    ctx.fillText(`하단 매질2: ${labelsTable[activeM2Type]}`, 15, cy + 25);

    if (isPlaying) {
      waveOffset += 0.8;
    }

    let waveColor = 'rgba(242, 184, 75, 0.9)'; 
    if (currentWaveType === 'sound') waveColor = 'rgba(56, 189, 248, 0.9)'; 
    if (currentWaveType === 'water') waveColor = 'rgba(52, 211, 153, 0.9)'; 

    const t1Rad = (phys.theta1Deg * Math.PI) / 180;
    const x1 = cx - rayLength * Math.sin(t1Rad);
    const y1 = cy - rayLength * Math.cos(t1Rad);

    // 매질 차단 상태일 때의 특수 드로잉 분기
    if (phys.isBlocked) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px var(--font-body)';
      ctx.textAlign = 'center';
      ctx.fillText('❌ 매질 단절로 파동 전파 불가', cx, cy + (phys.isM1Blocked ? -50 : 60));
      ctx.textAlign = 'left';

      if (!phys.isM1Blocked) {
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx, cy); ctx.stroke();
        
        ctx.save();
        ctx.strokeStyle = 'rgba(234, 240, 251, 0.22)';
        ctx.lineWidth = 1;
        for (let d = 0; d < rayLength; d += 16) {
          let currentD = d + (waveOffset % 16);
          if (currentD < rayLength) {
            let wx = cx - currentD * Math.sin(t1Rad);
            let wy = cy - currentD * Math.cos(t1Rad);
            let vx = Math.cos(t1Rad) * 15; let vy = -Math.sin(t1Rad) * 15;
            ctx.beginPath(); ctx.moveTo(wx - vx, wy - vy); ctx.lineTo(wx + vx, wy + vy); ctx.stroke();
          }
        }
        ctx.restore();
      }
      
      animId = requestAnimationFrame(draw);
      return;
    }

    // 1) 입사 파선(Ray) 그리기
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // 2) 입사 파면(Wavefront) 줄무늬 애니메이션 그리기
    ctx.save();
    ctx.strokeStyle = 'rgba(234, 240, 251, 0.22)';
    ctx.lineWidth = 1;
    for (let d = 0; d < rayLength; d += 16) {
      let currentD = d + (waveOffset % 16);
      if (currentD < rayLength) {
        let wx = cx - currentD * Math.sin(t1Rad);
        let wy = cy - currentD * Math.cos(t1Rad);
        let vx = Math.cos(t1Rad) * 15;
        let vy = -Math.sin(t1Rad) * 15;
        ctx.beginPath(); ctx.moveTo(wx - vx, wy - vy); ctx.lineTo(wx + vx, wy + vy); ctx.stroke();
      }
    }
    ctx.restore();

    // 3) 하단부 전파 (굴절 혹은 전반사 분기)
    if (phys.isTIR) {
      const xr = cx + rayLength * Math.sin(t1Rad);
      const yr = cy - rayLength * Math.cos(t1Rad);
      
      ctx.strokeStyle = '#ef4444'; 
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(xr, yr); ctx.stroke(); // ctx. 오타 교정 완료!
    } else if (phys.theta2Deg !== null) {
      const t2Rad = (phys.theta2Deg * Math.PI) / 180;
      const x2 = cx + rayLength * Math.sin(t2Rad);
      const y2 = cy + rayLength * Math.cos(t2Rad);

      ctx.strokeStyle = waveColor;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();

      ctx.save();
      ctx.strokeStyle = 'rgba(234, 240, 251, 0.22)';
      ctx.lineWidth = 1;
      const intervalScale = 16 * (phys.n1 / phys.n2); 
      
      for (let d = 0; d < rayLength; d += intervalScale) {
        let currentD = d + ((waveOffset * (phys.n1 / phys.n2)) % intervalScale);
        if (currentD < rayLength) {
          let wx = cx + currentD * Math.sin(t2Rad);
          let wy = cy + currentD * Math.cos(t2Rad);
          let vx = Math.cos(t2Rad) * 15;
          let vy = -Math.sin(t2Rad) * 15;
          ctx.beginPath(); ctx.moveTo(wx - vx, wy - vy); ctx.lineTo(wx + vx, wy + vy); ctx.stroke();
        }
      }
      ctx.restore();
    }

    animId = requestAnimationFrame(draw);
  }

  // 6. 상호작용 인터페이스 상태 관리 컨트롤 스크립트 결합
  function handleWaveTypeChange(waveType) {
    currentWaveType = waveType;
    Object.keys(waveButtons).forEach(key => {
      waveButtons[key].style.borderColor = 'var(--border)';
      waveButtons[key].style.color = 'var(--ink-muted)';
    });
    waveButtons[waveType].style.borderColor = 'var(--accent-physics)';
    waveButtons[waveType].style.color = 'var(--ink)';
    calculatePhysics();
  }

  waveButtons.light.addEventListener('click', () => handleWaveTypeChange('light'));
  waveButtons.sound.addEventListener('click', () => handleWaveTypeChange('sound'));
  waveButtons.water.addEventListener('click', () => handleWaveTypeChange('water'));

  sliderAngle.addEventListener('input', calculatePhysics);

  function initMediaButtonGroup(mPrefix, callback) {
    const types = ['vacuum', 'gas', 'liquid', 'solid'];
    const subTypes = ['ice', 'glass', 'diamond'];
    const detailPanel = document.getElementById(`${mPrefix}-solid-detail`);

    types.forEach(t => {
      const btn = document.getElementById(`${mPrefix}-${t}`);
      btn.addEventListener('click', () => {
        types.forEach(x => {
          document.getElementById(`${mPrefix}-${x}`).style.borderColor = 'var(--border)';
          document.getElementById(`${mPrefix}-${x}`).style.color = 'var(--ink-muted)';
        });
        btn.style.borderColor = 'var(--accent-physics)';
        btn.style.color = 'var(--ink)';

        if (t === 'solid') {
          detailPanel.style.display = 'grid';
          subTypes.forEach(s => {
            document.getElementById(`${mPrefix}-${s}`).style.borderColor = 'var(--border)';
            document.getElementById(`${mPrefix}-${s}`).style.color = 'var(--ink-muted)';
          });
          document.getElementById(`${mPrefix}-glass`).style.borderColor = 'var(--accent-physics)';
          document.getElementById(`${mPrefix}-glass`).style.color = 'var(--ink)';
          callback('glass');
        } else {
          detailPanel.style.display = 'none';
          callback(t);
        }
      });
    });

    subTypes.forEach(s => {
      const btn = document.getElementById(`${mPrefix}-${s}`);
      btn.addEventListener('click', () => {
        subTypes.forEach(x => {
          document.getElementById(`${mPrefix}-${x}`).style.borderColor = 'var(--border)';
          document.getElementById(`${mPrefix}-${x}`).style.color = 'var(--ink-muted)';
        });
        btn.style.borderColor = 'var(--accent-physics)';
        btn.style.color = 'var(--ink)';
        callback(s);
      });
    });
  }

  initMediaButtonGroup('m1', (type) => { activeM1Type = type; calculatePhysics(); });
  initMediaButtonGroup('m2', (type) => { activeM2Type = type; calculatePhysics(); });

  btnPlay.addEventListener('click', () => {
    isPlaying = true;
    btnPlay.style.background = 'var(--accent-physics-dim)';
    btnPause.style.background = 'transparent';
  });
  
  btnPause.addEventListener('click', () => {
    isPlaying = false;
    btnPause.style.background = 'var(--accent-physics-dim)';
    btnPlay.style.background = 'transparent';
  });
  
  btnReset.addEventListener('click', () => {
    isPlaying = true;
    sliderAngle.value = 45;
    activeM1Type = 'gas';
    activeM2Type = 'liquid';
    
    document.getElementById('m1-gas').click();
    document.getElementById('m2-liquid').click();
    handleWaveTypeChange('light');
    
    btnPlay.style.background = 'var(--accent-physics-dim)';
    btnPause.style.background = 'transparent';
    waveOffset = 0;
  });

  calculatePhysics();
  draw();
});