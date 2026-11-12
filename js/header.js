(() => {
  const header = document.querySelector('.site-header');
  if (header) {
    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    };
    updateHeaderHeight();
    if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(header);
    else window.addEventListener('resize', updateHeaderHeight);
  }
  const controls = document.querySelectorAll('[data-text-size]');
  function setTextSize(size) {
    const selected = size === 'large' ? 'large' : 'standard';
    document.documentElement.style.setProperty('--text-scale', selected === 'large' ? '1.15' : '1');
    controls.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.textSize === selected));
    });
    try { window.localStorage.setItem('sato-text-size', selected); } catch (_) {}
  }
  let saved = 'standard';
  try { saved = window.localStorage.getItem('sato-text-size') || saved; } catch (_) {}
  setTextSize(saved);
  controls.forEach((button) => {
    button.addEventListener('click', () => setTextSize(button.dataset.textSize));
  });
  document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!window.confirm('発信していいですか？')) event.preventDefault();
    });
  });
})();
