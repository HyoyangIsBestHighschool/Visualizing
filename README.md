# 교과 개념 시각화 플랫폼 — 공용 틀

시뮬레이션 기반 교과 개념 시각화 플랫폼의 공용 뼈대입니다. HTML/CSS/JS로만 되어 있고,
GitHub Pages로 그대로 배포할 수 있습니다.

## 폴더 구조

```
index.html                     홈
math.html                      수학 카테고리 목록
physics.html                   물리학 카테고리 목록
pages/
  math/
    parametric.html            매개변수와 곡선
    composite.html             합성함수와 그 미분
    optimization.html          최적화
    series.html                급수와 정적분의 관계
  physics/
    magnetic-field.html        자석에 의한 자기장
    induction.html              전자기 유도
    refraction.html             굴절과 스넬의 법칙
    interference.html           간섭과 회절
    doppler.html                도플러 효과
assets/
  css/style.css                 공통 스타일 (전체 공용, 수정 시 팀원과 상의)
  js/main.js                    공통 스크립트 (내비게이션 등)
  js/pages/{이름}.js            각 시뮬레이션 전용 스크립트 (담당자가 작성)
```

## 담당 기능 개발 규칙

1. **본인 페이지만 수정하세요.** `pages/math/*.html`, `pages/physics/*.html` 중 본인이 맡은
   파일과, 그에 대응하는 `assets/js/pages/{파일명}.js`가 작업 영역입니다.
2. **DOM 규약을 지켜주세요.**
   - 시각화(캔버스, SVG, Canvas API 등)는 `#sim-stage` 안에 넣습니다.
   - 슬라이더·버튼 등 조작 UI는 `#sim-controls` 안에 넣습니다.
   - 이 두 id는 통합 시 다른 페이지들과 구조를 맞추는 기준이 되므로 이름을 바꾸지 마세요.
3. **공통 파일(`style.css`, `main.js`, 각 카테고리 페이지)을 고칠 때는 팀원과 먼저 상의하세요.**
   충돌을 막기 위해 공통 파일 수정은 별도 브랜치 + PR로 진행하는 걸 권장합니다.
4. **CSS 변수(디자인 토큰)를 활용하세요.** `:root`에 정의된 `--accent-math`, `--accent-physics`,
   `--panel`, `--border` 등을 그대로 쓰면 전체 톤이 유지됩니다.
5. 새 시뮬레이션 페이지가 필요하면 `generate_pages.py`의 `PAGES` 리스트에 항목을 추가하고
   다시 실행하면 동일한 틀로 새 페이지가 생성됩니다.

## 로컬에서 확인하기

빌드 과정이 없으므로 `index.html`을 브라우저로 바로 열어도 되고,
VS Code의 Live Server 확장 등을 쓰면 더 편합니다.

## GitHub Pages 배포

1. 이 폴더 전체를 저장소 루트(또는 `docs/` 폴더)에 푸시합니다.
2. 저장소 Settings → Pages에서 배포 브랜치/폴더를 지정합니다.
3. `index.html`이 루트에 있어야 홈 주소가 바로 열립니다.
