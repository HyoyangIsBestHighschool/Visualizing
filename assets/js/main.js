// ============================================================
// 공통 스크립트 — 모바일 내비게이션 토글
// 각 시뮬레이션의 실제 로직은 이 파일을 건드리지 말고
// /assets/js/pages/{페이지명}.js 에 작성해 주세요.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
});
