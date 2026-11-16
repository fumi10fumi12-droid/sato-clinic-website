(() => {
  document.querySelectorAll('.split-reveal-slider').forEach((slider) => {
    if (slider.classList.contains('is-split-ready')) return;
    const track = slider.querySelector('.clinical-slider-track');
    const slides = [...track.querySelectorAll('figure')];
    const controls = slider.querySelector('.clinical-slider-controls');
    const dots = slider.querySelector('.clinical-slider-dots');
    const status = slider.querySelector('.clinical-slider-status');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current = 0;
    let requested = 0;
    let requestId = 0;
    let animations = [];
    let pointer = null;

    const clearReveal = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      track.querySelectorAll('.split-reveal-shutter').forEach((shutter) => shutter.remove());
      slider.classList.remove('is-revealing');
    };
    const update = () => {
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === current);
        slide.setAttribute('aria-hidden', String(index !== current));
        slide.inert = index !== current;
      });
      [...dots.children].forEach((dot, index) => dot.setAttribute('aria-current', String(index === current)));
      status.textContent = `${current + 1} / ${slides.length}`;
      slides[(current + 1) % slides.length].querySelector('img').loading = 'eager';
    };
    const goTo = async (index) => {
      const next = (index + slides.length) % slides.length;
      requested = next;
      const request = ++requestId;
      if (next === current) { clearReveal(); return; }
      const image = slides[next].querySelector('img');
      image.loading = 'eager';
      try {
        await image.decode();
      } catch (_) {
        if (!image.naturalWidth) {
          if (request === requestId) requested = current;
          return;
        }
      }
      if (request !== requestId) return;
      clearReveal();
      const outgoing = slides[current].querySelector('img');
      current = next;
      update();
      if (reducedMotion.matches || typeof image.animate !== 'function') return;

      const shutters = ['left', 'right'].map((side) => {
        const shutter = document.createElement('div');
        shutter.className = `split-reveal-shutter split-reveal-shutter--${side}`;
        shutter.setAttribute('aria-hidden', 'true');
        const photo = outgoing.cloneNode(false);
        photo.alt = '';
        photo.loading = 'eager';
        photo.draggable = false;
        shutter.append(photo);
        track.append(shutter);
        return shutter;
      });
      slider.classList.add('is-revealing');
      const timing = {duration: 760, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards'};
      animations = shutters.map((shutter, index) => shutter.animate([
        {transform: 'translateX(0)'},
        {transform: `translateX(${index === 0 ? '-52%' : '52%'})`},
      ], timing));
      animations.push(image.animate([{transform: 'scale(1.035)'}, {transform: 'scale(1)'}], timing));
      Promise.all(animations.map((animation) => animation.finished)).then(() => {
        if (request === requestId) clearReveal();
      }).catch(() => {});
    };

    slides.forEach((slide, index) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'スライド');
      slide.setAttribute('aria-label', `${index + 1} / ${slides.length}`);
      slide.querySelector('img').draggable = false;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `写真${index + 1}を表示`);
      dot.setAttribute('aria-controls', track.id);
      dot.addEventListener('click', () => goTo(index));
      dots.append(dot);
    });
    slider.querySelector('[data-slide="previous"]').addEventListener('click', () => goTo(requested - 1));
    slider.querySelector('[data-slide="next"]').addEventListener('click', () => goTo(requested + 1));
    track.addEventListener('keydown', (event) => {
      const targets = {ArrowLeft: requested - 1, ArrowRight: requested + 1, Home: 0, End: slides.length - 1};
      if (!(event.key in targets)) return;
      event.preventDefault();
      goTo(targets[event.key]);
    });
    track.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
      track.setPointerCapture(event.pointerId);
    });
    track.addEventListener('pointerup', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.25) goTo(requested + (dx < 0 ? 1 : -1));
    });
    track.addEventListener('pointercancel', () => { pointer = null; });
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      ++requestId;
      requested = current;
      clearReveal();
    });
    slider.classList.add('is-split-ready');
    slides[0].querySelector('img').loading = 'eager';
    update();
    controls.hidden = false;
  });
})();
