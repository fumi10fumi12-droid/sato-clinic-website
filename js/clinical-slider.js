(() => {
  document.querySelectorAll('.clinical-slider').forEach((slider) => {
    const track = slider.querySelector('.clinical-slider-track');
    const slides = [...track.querySelectorAll('figure')];
    const controls = slider.querySelector('.clinical-slider-controls');
    const dots = slider.querySelector('.clinical-slider-dots');
    const status = slider.querySelector('.clinical-slider-status');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current = 0;
    let scrollTimer;

    const update = () => {
      if (!track.clientWidth) return;
      current = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      status.textContent = `${current + 1} / ${slides.length}`;
      [...dots.children].forEach((dot, index) => {
        dot.setAttribute('aria-current', index === current ? 'true' : 'false');
      });
    };
    const goTo = (index) => {
      if (!track.clientWidth) return;
      const next = (index + slides.length) % slides.length;
      track.scrollTo({left: next * track.clientWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
    };

    slides.forEach((slide, index) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'スライド');
      slide.setAttribute('aria-label', `${index + 1} / ${slides.length}`);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `写真${index + 1}を表示`);
      dot.setAttribute('aria-controls', track.id);
      dot.addEventListener('click', () => goTo(index));
      dots.append(dot);
    });
    slider.querySelector('[data-slide="previous"]').addEventListener('click', () => goTo(current - 1));
    slider.querySelector('[data-slide="next"]').addEventListener('click', () => goTo(current + 1));
    track.addEventListener('keydown', (event) => {
      const targets = {ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1};
      if (!(event.key in targets)) return;
      event.preventDefault();
      goTo(targets[event.key]);
    });
    track.addEventListener('scroll', () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(update, 120);
    }, {passive: true});
    const resize = () => {
      if (track.clientWidth) {
        track.scrollTo({left: current * track.clientWidth, behavior: 'instant'});
        update();
      }
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(track);
    else window.addEventListener('resize', resize);
    controls.hidden = false;
    update();
  });
})();
