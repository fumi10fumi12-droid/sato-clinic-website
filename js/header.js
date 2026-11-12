(() => {
  const header = document.querySelector('.site-header');
  if (header) {
    const nav = header.querySelector('.global-nav');
    const utilities = header.querySelector('.header-utilities');
    const top = header.querySelector('.site-top');
    if (nav && utilities && top) {
      nav.id = 'site-navigation';
      utilities.id = 'site-utilities';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'menu-toggle';
      toggle.textContent = 'メニュー';
      toggle.setAttribute('aria-controls', 'site-navigation site-utilities');
      toggle.setAttribute('aria-expanded', 'false');
      top.append(toggle);
      header.classList.add('has-mobile-menu');
      const setOpen = (open) => {
        header.classList.toggle('is-menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? '閉じる' : 'メニュー';
      };
      toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      header.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
          setOpen(false);
          toggle.focus();
        }
      });
      header.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
      window.matchMedia('(max-width: 767px)').addEventListener('change', () => setOpen(false));
    }
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
