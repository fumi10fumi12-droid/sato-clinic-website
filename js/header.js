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
      toggle.setAttribute('aria-label', 'メニューを開く');
      toggle.setAttribute('aria-controls', 'site-navigation site-utilities');
      toggle.setAttribute('aria-expanded', 'false');
      top.append(toggle);
      header.classList.add('has-mobile-menu');
      const setOpen = (open) => {
        header.classList.toggle('is-menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? '閉じる' : 'メニュー';
        toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
        if (!open) closeSubmenus();
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
    const mobile = window.matchMedia('(max-width: 767px)');
    const items = nav ? [...nav.querySelectorAll(':scope > .nav-item')] : [];
    let activeItem = null;
    let closeTimer;
    let keyboardMode = false;
    let restoringFocus = false;
    const closeSubmenus = () => {
      clearTimeout(closeTimer);
      items.forEach(item => {
        item.classList.remove('is-submenu-open');
        const button = item.querySelector('.nav-toggle');
        const panel = item.querySelector('.mega-panel');
        if (button) {
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-label', `${item.querySelector('.nav-parent > a').textContent}の詳細メニューを開く`);
        }
        if (panel) { panel.inert = true; panel.setAttribute('aria-hidden', 'true'); }
      });
      activeItem = null;
    };
    const openSubmenu = item => {
      clearTimeout(closeTimer);
      if (activeItem === item) return;
      closeSubmenus();
      const panel = item.querySelector('.mega-panel');
      if (!panel) return;
      activeItem = item;
      item.classList.add('is-submenu-open');
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      const button = item.querySelector('.nav-toggle');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', `${item.querySelector('.nav-parent > a').textContent}の詳細メニューを閉じる`);
    };
    document.addEventListener('keydown', event => {
      if (['Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) keyboardMode = true;
    });
    document.addEventListener('pointerdown', () => { keyboardMode = false; });
    items.forEach(item => {
      const button = item.querySelector('.nav-toggle');
      item.addEventListener('pointerenter', event => {
        if (!mobile.matches && event.pointerType !== 'touch') openSubmenu(item);
      });
      item.addEventListener('focusin', event => {
        if (!restoringFocus && !mobile.matches && keyboardMode) openSubmenu(item);
      });
      button?.addEventListener('click', () => {
        if (activeItem === item) closeSubmenus();
        else openSubmenu(item);
      });
      item.querySelector('.nav-parent').addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' && button) {
          event.preventDefault();
          openSubmenu(item);
          item.querySelector('.mega-panel a').focus();
        }
      });
    });
    header.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    header.addEventListener('pointerleave', () => {
      if (!mobile.matches) closeTimer = setTimeout(() => {
        if (!(keyboardMode && header.contains(document.activeElement))) closeSubmenus();
      }, 150);
    });
    header.addEventListener('focusout', event => {
      if (!header.contains(event.relatedTarget)) closeSubmenus();
    });
    header.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !activeItem) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const button = activeItem.querySelector('.nav-toggle');
      closeSubmenus();
      restoringFocus = true;
      button.focus();
      restoringFocus = false;
    }, true);
    document.addEventListener('pointerdown', event => {
      if (!header.contains(event.target)) closeSubmenus();
    });
    header.querySelectorAll('nav a').forEach(link => link.addEventListener('click', closeSubmenus));
    mobile.addEventListener('change', closeSubmenus);
    window.addEventListener('hashchange', closeSubmenus);

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    };
    updateHeaderHeight();
    if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(header);
    window.addEventListener('resize', updateHeaderHeight);
  }
  document.querySelectorAll('.back-to-top').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({top: 0, left: 0, behavior: reducedMotion ? 'instant' : 'smooth'});
    });
  });
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
